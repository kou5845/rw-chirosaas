/**
 * 24時間前リマインダー送信ロジック
 *
 * 処理フロー:
 *   1. 現在時刻から 23〜24 時間後に開始される confirmed 予約を取得
 *      （reminderSent=false のもののみ）
 *   2. テナントの通知設定を確認
 *      - lineEnabled=true かつ patient.lineUserId あり → LINE でリマインダー送信
 *      - emailEnabled=true かつ patient.email あり   → メールでリマインダー送信
 *   3. 送信成功後、appointment.reminderSent を true に更新（二重送信防止）
 *
 * CLAUDE.md 規約:
 *   - このモジュールはサーバーサイド専用（"use client" 禁止）
 *   - tenantId フィルタなしで全テナントを横断処理する（システムバッチの設計上の例外）
 */

import { prisma }             from "@/lib/prisma";
import { pushText, buildReminder24hMessage } from "@/lib/line";
import { sendReminderEmail }  from "@/lib/email";

// 1バッチあたりの最大処理件数（タイムアウト防止）
const BATCH_LIMIT = 50;

export type ReminderResult = {
  processed: number;
  sent:      number;
  failed:    number;
  skipped:   number;
};

/**
 * 24時間前リマインダーを未送信の予約に対して送信する。
 * /api/cron/reminders から呼び出す。
 */
export async function sendPendingReminders(): Promise<ReminderResult> {
  const now        = new Date();
  // 対象ウィンドウ: now+23h 〜 now+24h
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status:      "confirmed",
      reminderSent: false,
      startAt: {
        gte: windowStart,
        lt:  windowEnd,
      },
    },
    include: {
      tenant: {
        select: {
          id:          true,
          name:        true,
          phone:       true,
          address:     true,
          lineEnabled: true,
          emailEnabled: true,
        },
      },
      patient: {
        select: {
          displayName: true,
          lineUserId:  true,
          email:       true,
        },
      },
    },
    take:    BATCH_LIMIT,
    orderBy: { startAt: "asc" },
  });

  if (appointments.length === 0) {
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const results: ReminderResult = { processed: appointments.length, sent: 0, failed: 0, skipped: 0 };

  for (const appt of appointments) {
    const { tenant, patient } = appt;
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
    };

    let notified = false;

    // ── LINE 通知 ──────────────────────────────────────────────
    if (tenant.lineEnabled && patient.lineUserId) {
      try {
        const text = buildReminder24hMessage(templateArgs);
        await pushText(patient.lineUserId, text);
        notified = true;
      } catch (e) {
        console.error(
          `[reminders] LINE送信失敗 appointmentId=${appt.id}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    // ── メール通知 ─────────────────────────────────────────────
    if (tenant.emailEnabled && patient.email) {
      try {
        await sendReminderEmail({
          to:          patient.email,
          tenantName:  tenant.name,
          patientName: patient.displayName,
          menuName:    appt.menuName,
          durationMin: appt.durationMin,
          price:       appt.price,
          startAt:     appt.startAt,
          endAt:       appt.endAt,
          phone:       tenant.phone,
          address:     tenant.address,
        });
        notified = true;
      } catch (e) {
        console.error(
          `[reminders] メール送信失敗 appointmentId=${appt.id}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    if (!notified) {
      // LINE未連携かつメール未設定 → スキップ（reminderSent は更新しない）
      console.warn(
        `[reminders] 通知手段なし appointmentId=${appt.id} ` +
        `lineEnabled=${tenant.lineEnabled} lineUserId=${patient.lineUserId ?? "null"} ` +
        `emailEnabled=${tenant.emailEnabled} email=${patient.email ?? "null"}`
      );
      results.skipped++;
      continue;
    }

    // 送信成功 → reminderSent を true に更新（二重送信防止）
    try {
      await prisma.appointment.update({
        where: { id: appt.id },
        data:  { reminderSent: true },
      });
      results.sent++;
    } catch (e) {
      console.error(
        `[reminders] reminderSent 更新失敗 appointmentId=${appt.id}:`,
        e instanceof Error ? e.message : e
      );
      results.failed++;
    }
  }

  return results;
}
