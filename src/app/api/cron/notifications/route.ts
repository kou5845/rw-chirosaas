/**
 * 通知処理 Cron ルートハンドラー
 * URL: GET /api/cron/notifications
 *
 * Vercel Cron Jobs からの定期呼び出し（vercel.json で設定）。
 * 手動実行時も Authorization: Bearer {CRON_SECRET} ヘッダーが必要。
 *
 * 処理フロー:
 *   1. NotificationQueue から status=pending かつ scheduledAt <= now のものを取得
 *   2. patient.lineUserId が未設定の場合は "LINE未連携" として failed に更新してスキップ
 *   3. LINE Messaging API でプッシュ通知を送信
 *   4. 成功 → status=sent / 失敗 → status=failed + errorMessage を記録
 *
 * CLAUDE.md 規約:
 *   - 本ルートは全テナントの通知を横断処理するシステムサービスのため、
 *     tenantId フィルタなしで NotificationQueue を操作する（設計上の例外）。
 *   - 処理上限: 1バッチ50件（タイムアウト防止）。
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { pushText, buildNotificationMessage } from "@/lib/line";

/**
 * テナントの LINE カスタムメッセージを取得する（キャッシュ付き）。
 * テナント固有タグ "tenant-msg-{tenantId}" でパージ可能。
 * マルチテナント間のキャッシュ衝突を防ぐためキャッシュキーに tenantId を含める。
 */
function getCachedTenantLineMessages(tenantId: string) {
  return unstable_cache(
    () =>
      prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: {
          lineConfirmMsg:  true,
          lineReminderMsg: true,
          lineChangeMsg:   true,
          lineFriendUrl:   true,
        },
      }),
    [`tenant-msg-${tenantId}`],
    { tags: [`tenant-msg-${tenantId}`], revalidate: false }
  )();
}

// Vercel Edge Runtime では pg/prisma が動かないため nodejs runtime を明示
export const runtime = "nodejs";

// 1バッチあたりの最大処理件数
const BATCH_LIMIT = 50;

/**
 * 認証方式（いずれか1つで通過）:
 *   1. Vercel Cron 自動実行: Authorization: Bearer {CRON_SECRET} ヘッダー
 *   2. 手動 / 外部サービス: ?key={CRON_SECRET} クエリパラメータ
 *   3. CRON_SECRET 未設定: 開発環境（NODE_ENV !== "production"）のみ通過
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret || secret === "[CRON_SECRET]") {
    console.warn("[cron/notifications] CRON_SECRET が未設定です。本番環境では必ず設定してください。");
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("key") === secret) return true;

  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ── 処理対象レコードを取得 ──────────────────────────────────
  const pendingItems = await prisma.notificationQueue.findMany({
    where: {
      status:      "pending",
      channel:     "line",
      scheduledAt: { lte: now },   // 送信予定時刻を過ぎているもののみ
    },
    include: {
      patient:     { select: { lineUserId: true, displayName: true } },
      appointment: {
        select: {
          menuName:    true,
          durationMin: true,
          price:       true,
          startAt:     true,
          endAt:       true,
        },
      },
      tenant: { select: { name: true, id: true } },
    },
    take:    BATCH_LIMIT,
    orderBy: { scheduledAt: "asc" },
  });

  if (pendingItems.length === 0) {
    return Response.json({ ok: true, processed: 0, sent: 0, failed: 0, skipped: 0 });
  }

  // ── 各レコードを逐次処理 ─────────────────────────────────────
  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const item of pendingItems) {
    const lineUserId = item.patient.lineUserId;

    // LINE 未連携の患者はスキップ → failed として記録
    if (!lineUserId) {
      await prisma.notificationQueue.update({
        where: { id: item.id },
        data: {
          status:       "failed",
          errorMessage: "患者の LINE アカウントが未連携のため送信できませんでした",
          sentAt:       now,
        },
      });
      results.skipped++;
      continue;
    }

    // テナントの LINE カスタムメッセージをキャッシュ経由で取得
    const tenantMsgs = await getCachedTenantLineMessages(item.tenant.id);

    // 通知種別に対応するカスタムメッセージを選択
    const customMessage =
      item.notificationType === "confirmation"
        ? tenantMsgs?.lineConfirmMsg
        : item.notificationType === "reminder_24h" || item.notificationType === "reminder_2h"
        ? tenantMsgs?.lineReminderMsg
        : null;

    // メッセージ文字列を生成
    const text = buildNotificationMessage(item.notificationType, {
      tenantName:    item.tenant.name,
      patientName:   item.patient.displayName,
      menuName:      item.appointment.menuName,
      durationMin:   item.appointment.durationMin,
      price:         item.appointment.price,
      startAt:       item.appointment.startAt,
      endAt:         item.appointment.endAt,
      customMessage: customMessage ?? null,
    });

    try {
      // LINE Messaging API でプッシュ送信
      await pushText(lineUserId, text);

      // 成功 → sent に更新
      await prisma.notificationQueue.update({
        where: { id: item.id },
        data:  { status: "sent", sentAt: now },
      });
      results.sent++;

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`[cron/notifications] 送信失敗 queueId=${item.id}:`, errorMessage);

      // 失敗 → failed + errorMessage を記録
      await prisma.notificationQueue.update({
        where: { id: item.id },
        data: {
          status:       "failed",
          errorMessage: errorMessage.slice(0, 500), // カラム長上限に合わせてトリム
          sentAt:       now,
        },
      });
      results.failed++;
    }
  }

  const summary = {
    ok:        true,
    processed: pendingItems.length,
    ...results,
    executedAt: now.toISOString(),
  };

  console.log("[cron/notifications] 完了:", summary);
  return Response.json(summary);
}
