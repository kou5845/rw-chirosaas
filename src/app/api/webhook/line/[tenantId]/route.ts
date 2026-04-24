/**
 * LINE Webhook エンドポイント（テナント別）
 *
 * URL: /api/webhook/line/{tenantId}
 *
 * 各テナントは LINE Developer Console の Webhook URL に
 * https://your-domain/api/webhook/line/{tenantId} を設定する。
 *
 * 機能:
 *   - 署名検証 (HMAC-SHA256) でリクエストの正当性を確認
 *   - follow イベント → 連携方法の案内メッセージを返信
 *   - message (テキスト) イベント → 電話番号を受信したら患者と紐付け
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSignature, messagingApi, webhook } from "@line/bot-sdk";
import { prisma } from "@/lib/prisma";

/** 全角数字・ハイフンを半角に変換する */
function toHalfWidth(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[－ー‐]/g, "-")
    .replace(/　/g, " ");
}

/** 電話番号らしい文字列かを判定する（全角/半角・ハイフンあり/なし両対応） */
function looksLikePhoneNumber(text: string): boolean {
  return /^[\d\-\s]{10,13}$/.test(toHalfWidth(text.trim()));
}

/** 電話番号を正規化する: "090-1234-5678" / "０９０－１２３４－５６７８" → "09012345678" */
function normalizePhone(phone: string): string {
  return toHalfWidth(phone).replace(/[\-\s]/g, "");
}

/** 生年月日 Date を YYYYMMDD 文字列に変換する */
function fmtBirthDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

type TenantInfo = {
  id:                     string;
  name:                   string;
  subdomain:              string | null;
  isActive:               boolean;
  lineChannelSecret:      string | null;
  lineChannelAccessToken: string | null;
  phone:                  string | null;
  address:                string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  // ── 1. テナント取得 ──────────────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id:                     true,
      name:                   true,
      subdomain:              true,
      isActive:               true,
      lineChannelSecret:      true,
      lineChannelAccessToken: true,
      phone:                  true,
      address:                true,
    },
  });

  if (!tenant || !tenant.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // テナント固有のシークレットがあればそれを使い、なければ環境変数にフォールバック
  const channelSecret =
    tenant.lineChannelSecret ?? process.env.LINE_CHANNEL_SECRET ?? "";
  const channelAccessToken =
    tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

  if (!channelSecret || !channelAccessToken) {
    console.error(`[webhook/line] tenantId=${tenantId}: LINE 設定が未完了です`);
    return NextResponse.json({ error: "LINE not configured" }, { status: 500 });
  }

  // ── 2. 署名検証 ──────────────────────────────────────────────────
  const signature = request.headers.get("x-line-signature") ?? "";
  const rawBody = await request.text();

  if (!validateSignature(rawBody, channelSecret, signature)) {
    console.warn(`[webhook/line] tenantId=${tenantId}: 署名検証失敗`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 3. イベント処理 ──────────────────────────────────────────────
  let body: webhook.CallbackRequest;
  try {
    body = JSON.parse(rawBody) as webhook.CallbackRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });

  // イベントを並列処理（返信トークンは5分以内に使い切る必要があるため）
  const results = await Promise.allSettled(
    body.events.map((event) => handleEvent(event, tenant, client)),
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[webhook/line] tenantId=${tenantId} event[${i}] 処理エラー:`, r.reason);
    }
  });

  return NextResponse.json({ ok: true });
}

// ── イベントハンドラ ──────────────────────────────────────────────────

async function handleEvent(
  event: webhook.Event,
  tenant: TenantInfo,
  client: messagingApi.MessagingApiClient,
): Promise<void> {
  switch (event.type) {
    case "follow":
      await handleFollow(
        (event as webhook.FollowEvent).replyToken,
        tenant,
        client,
      );
      break;

    case "message": {
      const msgEvent = event as webhook.MessageEvent;
      if (msgEvent.message.type === "text" && msgEvent.replyToken) {
        const textMsg = msgEvent.message as webhook.TextMessageContent;
        await handleTextMessage(
          msgEvent.replyToken,
          msgEvent.source?.userId ?? "",
          textMsg.text,
          tenant,
          client,
        );
      }
      break;
    }

    default:
      // unfollow, postback 等は現時点では無視
      break;
  }
}

/** 友だち追加イベント: 連携方法と院の連絡先を案内する */
async function handleFollow(
  replyToken: string,
  tenant: TenantInfo,
  client: messagingApi.MessagingApiClient,
): Promise<void> {
  const lines = [
    `${tenant.name} の公式LINEアカウントへようこそ！`,
    "",
    "📱 ご予約の通知を受け取るには、",
    "こちらのトーク画面に「電話番号」を送信してください。",
    "",
    "例: 090-1234-5678",
    "",
    "ご予約時のお電話番号と一致した場合、",
    "自動的に連携が完了します。",
  ];

  if (tenant.phone) {
    lines.push("", "─────────────────", `📞 ${tenant.phone}`);
  }
  if (tenant.address) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`;
    lines.push(...(tenant.phone ? [] : ["", "─────────────────"]), `📍 ${tenant.address}`, `🗺 ${mapUrl}`);
  }

  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: lines.join("\n") }],
  });
}

/** テキストメッセージイベント: 電話番号なら患者と紐付けを試みる */
async function handleTextMessage(
  replyToken: string,
  lineUserId: string,
  text: string,
  tenant: TenantInfo,
  client: messagingApi.MessagingApiClient,
): Promise<void> {
  if (!lineUserId) return;

  const trimmed = text.trim();
  if (!looksLikePhoneNumber(trimmed)) {
    // 電話番号以外のメッセージには案内を返す
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: "電話番号をお送りください（例: 090-1234-5678）。\nご予約時のお電話番号と照合して連携します。",
        },
      ],
    });
    return;
  }

  const normalizedPhone = normalizePhone(trimmed);

  // ── 既に同じ lineUserId でこのテナントに紐付け済みか確認（有効患者のみ）──
  // isActive: true を必須にすることで、削除・非アクティブ化済み患者を「連携済み」と誤判定しない
  const alreadyLinked = await prisma.patient.findFirst({
    where: { tenantId: tenant.id, lineUserId, isActive: true },
    select: { displayName: true },
  });
  if (alreadyLinked) {
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: `${alreadyLinked.displayName} 様、すでに連携済みです。\n引き続きよろしくお願いいたします。`,
        },
      ],
    });
    return;
  }

  // ── 電話番号で患者を検索 ──
  const patients = await prisma.patient.findMany({
    where: {
      tenantId:   tenant.id,
      isActive:   true,
      lineUserId: null,
    },
    select: { id: true, phone: true, displayName: true, birthDate: true, accessPin: true, accessToken: true },
  });

  const matched = patients.find(
    (p) => p.phone && normalizePhone(p.phone) === normalizedPhone,
  );

  if (!matched) {
    const notFoundLines = [
      "入力いただいた電話番号と一致する患者情報が見つかりませんでした。",
      "",
      "・番号の入力間違いがないかご確認ください",
      "・ご予約時のお電話番号と同じ番号をお送りください",
      "・ご不明な場合は院までお問い合わせください",
    ];
    if (tenant.phone) {
      notFoundLines.push("", `📞 ${tenant.phone}`);
    }
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: notFoundLines.join("\n") }],
    });
    return;
  }

  // ── 非アクティブ患者が同じ lineUserId を保持している場合は解放する ──
  // @unique 制約の競合を防ぐため、紐付け前に古いレコードの lineUserId を NULL にする
  await prisma.patient.updateMany({
    where: { tenantId: tenant.id, lineUserId, isActive: false },
    data:  { lineUserId: null },
  });

  // ── 紐付け保存 ──
  await prisma.patient.update({
    where: { id: matched.id },
    data:  { lineUserId },
  });

  console.log(
    `[webhook/line] 紐付け成功: tenantId=${tenant.id}, patientId=${matched.id}, lineUserId=${lineUserId}`,
  );

  // ── 成功メッセージ（ログイン情報・院情報を添付）──
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL ?? "localhost:3000"}`;
  const mypageUrl = `${appUrl}/${tenant.subdomain}/mypage/login`;

  const successLines = [
    "✅ 連携が完了しました！",
    "",
    `${matched.displayName} 様のアカウントと紐付けられました。`,
    "これからご予約の確定やリマインダーをこちらのトークでお届けします。",
  ];

  // マイページログイン情報（birthDate・accessPin がある患者のみ）
  if (matched.birthDate || matched.accessPin) {
    successLines.push("", "─────────────────", "📋 マイページログイン情報");
    successLines.push(`🔗 マイページログインURL`, mypageUrl);
    if (matched.birthDate) {
      successLines.push(`🗓 ログインID: ${fmtBirthDate(matched.birthDate)}`);
    }
    if (matched.accessPin) {
      successLines.push(`🔑 暗証番号: ${matched.accessPin}`);
    }
  }

  // 院の連絡先
  if (tenant.phone || tenant.address) {
    successLines.push("", "─────────────────");
    if (tenant.phone) {
      successLines.push(`📞 ${tenant.phone}`);
    }
    if (tenant.address) {
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`;
      successLines.push(`📍 ${tenant.address}`, `🗺 ${mapUrl}`);
    }
  }

  successLines.push("", "今後ともよろしくお願いいたします。");

  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text: successLines.join("\n") }],
  });
}
