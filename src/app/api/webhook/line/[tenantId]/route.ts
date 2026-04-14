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

/** 電話番号らしい文字列かを判定する（ハイフンあり/なし両対応） */
function looksLikePhoneNumber(text: string): boolean {
  return /^[\d\-\s]{10,13}$/.test(text.trim());
}

/** 電話番号を正規化する: "090-1234-5678" → "09012345678" */
function normalizePhone(phone: string): string {
  return phone.replace(/[\-\s]/g, "");
}

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
      isActive:               true,
      lineChannelSecret:      true,
      lineChannelAccessToken: true,
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
  await Promise.allSettled(
    body.events.map((event) => handleEvent(event, tenantId, tenant.name, client)),
  );

  return NextResponse.json({ ok: true });
}

// ── イベントハンドラ ──────────────────────────────────────────────────

async function handleEvent(
  event: webhook.Event,
  tenantId: string,
  tenantName: string,
  client: messagingApi.MessagingApiClient,
): Promise<void> {
  switch (event.type) {
    case "follow":
      await handleFollow(
        (event as webhook.FollowEvent).replyToken,
        tenantName,
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
          tenantId,
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

/** 友だち追加イベント: 連携方法を案内する */
async function handleFollow(
  replyToken: string,
  tenantName: string,
  client: messagingApi.MessagingApiClient,
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text: [
          `${tenantName} の公式LINEアカウントへようこそ！`,
          "",
          "📱 カルテ・ご予約の通知を受け取るには、",
          "こちらのトーク画面に「電話番号」を送信してください。",
          "",
          "例: 090-1234-5678",
          "",
          "診察券登録時のお電話番号と一致した場合、",
          "自動的に連携が完了します。",
        ].join("\n"),
      },
    ],
  });
}

/** テキストメッセージイベント: 電話番号なら患者と紐付けを試みる */
async function handleTextMessage(
  replyToken: string,
  lineUserId: string,
  text: string,
  tenantId: string,
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
          text: "電話番号をお送りください（例: 090-1234-5678）。\n診察券登録時のお電話番号と照合して連携します。",
        },
      ],
    });
    return;
  }

  const normalizedPhone = normalizePhone(trimmed);

  // ── 既に同じ lineUserId で紐付け済みか確認 ──
  const alreadyLinked = await prisma.patient.findUnique({
    where: { lineUserId },
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
  // DB に保存されている phone は "090-1234-5678" 形式なので正規化して比較する
  const patients = await prisma.patient.findMany({
    where: {
      tenantId,
      isActive:   true,
      lineUserId: null, // 未連携の患者のみ
    },
    select: { id: true, phone: true, displayName: true },
  });

  const matched = patients.find(
    (p) => p.phone && normalizePhone(p.phone) === normalizedPhone,
  );

  if (!matched) {
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: [
            "入力いただいた電話番号と一致する患者情報が見つかりませんでした。",
            "",
            "・番号の入力間違いがないかご確認ください",
            "・診察券登録時のお電話番号と同じ番号をお送りください",
            "・ご不明な場合は院までお問い合わせください",
          ].join("\n"),
        },
      ],
    });
    return;
  }

  // ── 紐付け保存 ──
  await prisma.patient.update({
    where: { id: matched.id },
    data:  { lineUserId },
  });

  console.log(
    `[webhook/line] 紐付け成功: tenantId=${tenantId}, patientId=${matched.id}, lineUserId=${lineUserId}`,
  );

  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text: [
          `✅ 連携が完了しました！`,
          "",
          `${matched.displayName} 様のアカウントと紐付けられました。`,
          "これからご予約の確定やリマインダーをこちらのトークでお届けします。",
          "",
          "今後ともよろしくお願いいたします。",
        ].join("\n"),
      },
    ],
  });
}
