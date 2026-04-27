/**
 * LINE 送信テスト用エンドポイント
 * URL: GET /api/test-line?lineUserId={userId}
 *
 * 使用方法:
 *   curl -H "Authorization: Bearer {CRON_SECRET}" \
 *        "http://localhost:3000/api/test-line?lineUserId={自分のLINE userId}"
 *
 * lineUserId の確認方法:
 *   - LINE Developers コンソール > Messaging API > Webhook
 *   - Webhook をオンにして自分のアカウントから Messaging API チャネルにメッセージを送ると
 *     サーバーログに "follow" または "message" イベントとして userId が記録される
 *   - または LINE_TEST_USER_ID 環境変数に設定しておくと query param 省略可
 *
 * セキュリティ:
 *   - Authorization: Bearer {CRON_SECRET} ヘッダーが必要
 *   - 本番環境でも使用可能（テスト用なので CRON_SECRET でアクセスを制限）
 */

import { prisma } from "@/lib/prisma";
import { pushText } from "@/lib/line";

export const runtime = "nodejs";

/** Authorization ヘッダーを検証する */
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || secret === "[CRON_SECRET]") {
    // CRON_SECRET 未設定は開発環境のみ通過
    return process.env.NODE_ENV !== "production";
  }

  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized — Authorization: Bearer {CRON_SECRET} ヘッダーが必要です" }, { status: 401 });
  }

  const url        = new URL(request.url);
  const lineUserId = url.searchParams.get("lineUserId") ?? process.env.LINE_TEST_USER_ID;

  if (!lineUserId) {
    return Response.json(
      {
        error:   "lineUserId が指定されていません",
        hint:    "?lineUserId=U... クエリパラメータか LINE_TEST_USER_ID 環境変数を設定してください",
        example: "/api/test-line?lineUserId=U1234567890abcdef",
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const sentAt = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const testMessage = [
    "【SyncotBase テスト送信】",
    "",
    "LINE Messaging API の接続テストです。",
    "このメッセージが届いていれば設定は完了です ✅",
    "",
    `送信時刻: ${sentAt}`,
    `送信先 userId: ${lineUserId}`,
  ].join("\n");

  try {
    await pushText(lineUserId, testMessage);

    // オプション: DB に送信済みログを残す（デバッグ用）
    // テスト送信は NotificationQueue に記録しない

    return Response.json({
      ok:      true,
      to:      lineUserId,
      sentAt:  now.toISOString(),
      message: "テストメッセージを送信しました。LINE アプリを確認してください。",
    });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[test-line] 送信失敗:", errorMessage);

    return Response.json(
      {
        ok:    false,
        error: errorMessage,
        hints: [
          "LINE_CHANNEL_ACCESS_TOKEN が正しく設定されているか確認してください",
          "lineUserId が正しい形式（U + 32文字）か確認してください",
          "LINE Developers でチャネルが有効化されているか確認してください",
        ],
      },
      { status: 500 }
    );
  }
}

/**
 * DB の NotificationQueue から手動で1件再送するユーティリティ。
 * URL: POST /api/test-line  body: { queueId: "uuid" }
 *
 * 使用方法:
 *   curl -X POST -H "Authorization: Bearer {CRON_SECRET}" \
 *        -H "Content-Type: application/json" \
 *        -d '{"queueId":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}' \
 *        http://localhost:3000/api/test-line
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let queueId: string;
  try {
    const body = await request.json();
    queueId = body.queueId;
  } catch {
    return Response.json({ error: "JSON body が必要です: { queueId: string }" }, { status: 400 });
  }

  if (!queueId) {
    return Response.json({ error: "queueId が指定されていません" }, { status: 400 });
  }

  // キューレコードを取得（tenant_id は NotificationQueue 内のため内部アクセスとして許容）
  const item = await prisma.notificationQueue.findUnique({
    where:   { id: queueId },
    include: {
      patient:     { select: { lineUserId: true, displayName: true } },
      appointment: { select: { menuName: true, durationMin: true, price: true, startAt: true, endAt: true } },
      tenant:      { select: { name: true } },
    },
  });

  if (!item) {
    return Response.json({ error: `queueId ${queueId} のレコードが見つかりません` }, { status: 404 });
  }

  const lineUserId = item.patient.lineUserId;
  if (!lineUserId) {
    return Response.json({ error: "この患者は LINE 未連携です" }, { status: 422 });
  }

  // メッセージを組み立ててプレビュー + 送信
  const { buildNotificationMessage } = await import("@/lib/line");
  const text = buildNotificationMessage(item.notificationType, {
    tenantName:  item.tenant.name,
    patientName: item.patient.displayName,
    menuName:    item.appointment.menuName,
    durationMin: item.appointment.durationMin,
    price:       item.appointment.price,
    startAt:     item.appointment.startAt,
    endAt:       item.appointment.endAt,
  });

  try {
    await pushText(lineUserId, text);
    return Response.json({
      ok:      true,
      queueId,
      to:      lineUserId,
      preview: text,
      message: "再送信に成功しました",
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error }, { status: 500 });
  }
}
