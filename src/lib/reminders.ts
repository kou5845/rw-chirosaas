/**
 * 24時間前リマインダー送信ロジック
 *
 * 処理フロー:
 *   1. 現在時刻から 15〜39 時間後に開始される confirmed 予約を取得
 *      （reminderSent=false のもののみ）
 *      ※ 日次Cron（00:00 UTC = 09:00 JST）でJST翌日全時間帯をカバーするため
 *         24時間幅にする。reminderSent=false が二重送信を防ぐ。
 *   2. テナントの通知設定を確認
 *      - lineEnabled=true かつ patient.lineUserId あり → 当該テナントの LINE チャネルで送信
 *        （tenant.lineChannelAccessToken → 環境変数 LINE_CHANNEL_ACCESS_TOKEN の順でフォールバック）
 *      - emailEnabled=true かつ patient.email あり   → メールでリマインダー送信
 *   3. 送信成功後、appointment.reminderSent を true に更新（二重送信防止）
 *
 * CLAUDE.md 規約:
 *   - このモジュールはサーバーサイド専用（"use client" 禁止）
 *   - tenantId フィルタなしで全テナントを横断処理する（システムバッチの設計上の例外）
 */

import { prisma }                       from "@/lib/prisma";
import { messagingApi }                 from "@line/bot-sdk";
import { buildReminder24hMessage }      from "@/lib/line";
import { sendReminderEmail }            from "@/lib/email";
import { buildMypageUrl }               from "@/lib/mypage";

// 1バッチあたりの最大処理件数（タイムアウト防止）
const BATCH_LIMIT = 50;

export type ReminderResult = {
  processed: number;
  sent:      number;
  failed:    number;
  skipped:   number;
  windowStart: string;
  windowEnd:   string;
};

/**
 * 24時間前リマインダーを未送信の予約に対して送信する。
 * /api/cron/reminders から呼び出す。
 */
export async function sendPendingReminders(): Promise<ReminderResult> {
  const now = new Date();

  // 対象ウィンドウ: now+15h 〜 now+39h（24時間幅）
  // 日次Cron（00:00 UTC = 09:00 JST）から翌日JST全時間帯（00:00〜23:59 JST）を
  // 漏れなくカバーするため24時間幅にする。
  // reminderSent=false フィルタが二重送信を防ぐ。
  const windowStart = new Date(now.getTime() + 15 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 39 * 60 * 60 * 1000);

  console.log(
    `[reminders] 実行開始 executedAt=${now.toISOString()} ` +
    `window=[${windowStart.toISOString()}, ${windowEnd.toISOString()})`
  );

  const appointments = await prisma.appointment.findMany({
    where: {
      status:       "confirmed",
      reminderSent: false,
      startAt: {
        gte: windowStart,
        lt:  windowEnd,
      },
    },
    include: {
      tenant: {
        select: {
          id:                     true,
          name:                   true,
          phone:                  true,
          address:                true,
          subdomain:              true,
          lineEnabled:            true,
          lineChannelAccessToken: true,   // テナント固有のLINEトークン
          emailEnabled:           true,
          emailReminderMsg:       true,
          lineReminderMsg:        true,
        },
      },
      patient: {
        select: {
          displayName: true,
          lineUserId:  true,
          email:       true,
          accessToken: true,
        },
      },
    },
    take:    BATCH_LIMIT,
    orderBy: { startAt: "asc" },
  });

  console.log(`[reminders] 対象予約: ${appointments.length}件`);

  if (appointments.length === 0) {
    return {
      processed:   0,
      sent:        0,
      failed:      0,
      skipped:     0,
      windowStart: windowStart.toISOString(),
      windowEnd:   windowEnd.toISOString(),
    };
  }

  const results: ReminderResult = {
    processed:   appointments.length,
    sent:        0,
    failed:      0,
    skipped:     0,
    windowStart: windowStart.toISOString(),
    windowEnd:   windowEnd.toISOString(),
  };

  for (const appt of appointments) {
    const { tenant, patient } = appt;

    // テナント固有のLINEトークンを優先し、なければ共有環境変数にフォールバック
    const lineChannelToken =
      tenant.lineChannelAccessToken?.trim() ||
      process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
      null;

    const mypageUrl = patient.accessToken && tenant.subdomain
      ? buildMypageUrl(tenant.subdomain, patient.accessToken)
      : null;

    const templateArgs = {
      tenantName:  tenant.name,
      patientName: patient.displayName,
      menuName:    appt.menuName,
      durationMin: appt.durationMin,
      price:       appt.price,
      startAt:     appt.startAt,
      endAt:       appt.endAt,
      phone:       tenant.phone,
      address:     tenant.address,
      mypageUrl,
    };

    let lineSent  = false;
    let emailSent = false;

    // ── LINE 通知 ──────────────────────────────────────────────
    if (tenant.lineEnabled && patient.lineUserId) {
      if (!lineChannelToken) {
        console.warn(
          `[reminders] LINE設定なし（トークン未設定） ` +
          `appointmentId=${appt.id} tenantId=${tenant.id}`
        );
      } else {
        try {
          const lineClient = new messagingApi.MessagingApiClient({
            channelAccessToken: lineChannelToken,
          });
          const text = buildReminder24hMessage({ ...templateArgs, customMessage: tenant.lineReminderMsg });
          await lineClient.pushMessage({
            to:       patient.lineUserId,
            messages: [{ type: "text", text }],
          });
          lineSent = true;
          console.log(
            `[reminders] LINE送信成功 appointmentId=${appt.id} ` +
            `patientName=${patient.displayName} startAt=${appt.startAt.toISOString()}`
          );
        } catch (e) {
          console.error(
            `[reminders] LINE送信失敗 appointmentId=${appt.id}:`,
            e instanceof Error ? e.message : e
          );
        }
      }
    }

    // ── メール通知 ─────────────────────────────────────────────
    if (tenant.emailEnabled && patient.email) {
      try {
        await sendReminderEmail({
          to:            patient.email,
          tenantName:    tenant.name,
          patientName:   patient.displayName,
          menuName:      appt.menuName,
          durationMin:   appt.durationMin,
          price:         appt.price,
          startAt:       appt.startAt,
          endAt:         appt.endAt,
          phone:         tenant.phone,
          address:       tenant.address,
          mypageUrl,
          customMessage: tenant.emailReminderMsg,
        });
        emailSent = true;
        console.log(
          `[reminders] メール送信成功 appointmentId=${appt.id} ` +
          `to=${patient.email}`
        );
      } catch (e) {
        console.error(
          `[reminders] メール送信失敗 appointmentId=${appt.id}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    const notified = lineSent || emailSent;

    if (!notified) {
      // 通知手段なし、または全チャネル送信失敗 → skipped（reminderSent は更新しない）
      const reason =
        (!tenant.lineEnabled && !tenant.emailEnabled)  ? "LINE・メール両方無効" :
        (tenant.lineEnabled  && !patient.lineUserId)   ? "LINE有効だがlineUserId未設定" :
        (tenant.emailEnabled && !patient.email)        ? "メール有効だがemail未設定" :
        "全チャネル送信失敗";
      console.warn(
        `[reminders] 通知スキップ appointmentId=${appt.id} reason="${reason}" ` +
        `lineEnabled=${tenant.lineEnabled} lineUserId=${patient.lineUserId ?? "null"} ` +
        `emailEnabled=${tenant.emailEnabled} email=${patient.email ?? "null"}`
      );
      results.skipped++;
      continue;
    }

    // 1チャネル以上で送信成功 → reminderSent を true に更新（二重送信防止）
    try {
      await prisma.appointment.update({
        where: { id: appt.id },
        data:  { reminderSent: true },
      });
      results.sent++;
      console.log(
        `[reminders] reminderSent更新済 appointmentId=${appt.id} ` +
        `(line=${lineSent} email=${emailSent})`
      );
    } catch (e) {
      console.error(
        `[reminders] reminderSent更新失敗 appointmentId=${appt.id}:`,
        e instanceof Error ? e.message : e
      );
      // 送信は成功したが DB 更新失敗 → 次回のCronで再送される可能性あり（許容範囲）
      results.failed++;
    }
  }

  console.log(
    `[reminders] 完了 processed=${results.processed} ` +
    `sent=${results.sent} failed=${results.failed} skipped=${results.skipped}`
  );

  return results;
}
