/**
 * リマインダー Cron ルートハンドラー
 * URL: GET /api/cron/reminders
 *
 * Vercel Cron Jobs からの定期呼び出し（vercel.json で設定: 毎時0分）。
 * 手動実行時も Authorization: Bearer {CRON_SECRET} ヘッダーが必要。
 *
 * 処理フロー:
 *   1. 現在時刻から 23〜24 時間後に開始される confirmed 予約を取得
 *   2. lineEnabled=true かつ LINE連携済み → LINE でリマインダー送信
 *   3. emailEnabled=true かつ email あり  → メールでリマインダー送信
 *   4. 送信成功後、appointment.reminderSent = true に更新（二重送信防止）
 *
 * CLAUDE.md 規約:
 *   - Vercel Edge Runtime では pg/prisma が動作しないため nodejs runtime を明示
 *   - CRON_SECRET 未設定時は開発環境のみ通過（本番では必ず設定）
 */

import { sendPendingReminders } from "@/lib/reminders";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;

  if (!secret || secret === "[CRON_SECRET]") {
    console.warn("[cron/reminders] CRON_SECRET が未設定です。本番環境では必ず設定してください。");
    return process.env.NODE_ENV !== "production";
  }

  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const executedAt = new Date();

  try {
    const result = await sendPendingReminders();

    const summary = {
      ok: true,
      ...result,
      executedAt: executedAt.toISOString(),
    };

    console.log("[cron/reminders] 完了:", summary);
    return Response.json(summary);

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/reminders] 予期せぬエラー:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
