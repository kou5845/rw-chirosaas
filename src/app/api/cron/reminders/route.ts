/**
 * リマインダー Cron ルートハンドラー
 * URL: GET /api/cron/reminders
 *
 * 認証方式（いずれか1つで通過）:
 *   1. Vercel Cron 自動実行: Authorization: Bearer {CRON_SECRET} ヘッダー
 *   2. 手動 / 外部サービス: ?key={CRON_SECRET} クエリパラメータ
 *   3. CRON_SECRET 未設定: 開発環境（NODE_ENV !== "production"）のみ通過
 *
 * CLAUDE.md 規約:
 *   - Vercel Edge Runtime では pg/prisma が動作しないため nodejs runtime を明示
 */

import { sendPendingReminders } from "@/lib/reminders";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret || secret === "[CRON_SECRET]") {
    console.warn("[cron/reminders] CRON_SECRET が未設定です。本番環境では必ず設定してください。");
    return process.env.NODE_ENV !== "production";
  }

  // Vercel Cron / curl 等: Authorization ヘッダー
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  // ブラウザ / 外部サービス: ?key= クエリパラメータ
  const url = new URL(request.url);
  if (url.searchParams.get("key") === secret) return true;

  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const executedAt = new Date();

  try {
    const result = await sendPendingReminders();

    const summary = {
      ok:          true,
      processed:   result.processed,
      sent:        result.sent,
      failed:      result.failed,
      skipped:     result.skipped,
      windowStart: result.windowStart,
      windowEnd:   result.windowEnd,
      executedAt:  executedAt.toISOString(),
    };

    // route レベルのサマリーログ（reminders.ts 内の詳細ログと分離）
    console.log("[cron/reminders] 実行完了:", JSON.stringify(summary));
    return Response.json(summary);

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/reminders] 予期せぬエラー:", message);
    return Response.json(
      { ok: false, error: message, executedAt: executedAt.toISOString() },
      { status: 500 }
    );
  }
}
