"use server";

/**
 * 予約承認 Server Action
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - ステータス変更は必ず AppointmentLog に記録すること（絶対ルール）
 *   - require_approval: pending → confirmed の順は不変
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type ConfirmActionState = { error: string } | null;

export async function confirmAppointment(
  _prevState: ConfirmActionState,
  formData: FormData
): Promise<ConfirmActionState> {
  const appointmentId = formData.get("appointmentId") as string;
  const tenantId      = formData.get("tenantId")      as string;
  const tenantSlug    = formData.get("tenantSlug")    as string;

  if (!appointmentId || !tenantId || !tenantSlug) {
    return { error: "必要なパラメータが不足しています。" };
  }

  // CLAUDE.md 絶対ルール: tenantId フィルタ必須 ＋ status=pending を確認
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId, status: "pending" },
  });
  if (!appointment) {
    return { error: "予約が見つからないか、すでに処理済みです。" };
  }

  // Auth 未実装のため、当該テナントの最初の admin プロフィールを changedBy に使用。
  // TODO: Supabase Auth 実装後は session.user.id に差し替えること。
  const adminProfile = await prisma.profile.findFirst({
    where:  { tenantId, role: "admin", isActive: true },
    select: { id: true },
  });
  if (!adminProfile) {
    return { error: "管理者プロフィールが見つかりません。シードデータをご確認ください。" };
  }

  const now = new Date();

  try {
    await prisma.$transaction([
      // 1. ステータス更新: pending → confirmed
      prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status:      "confirmed",
          confirmedAt: now,
          confirmedBy: adminProfile.id,
        },
      }),

      // 2. CLAUDE.md 絶対ルール: ステータス変更は必ず AppointmentLog に記録する
      prisma.appointmentLog.create({
        data: {
          appointmentId,
          oldStatus:   "pending",
          newStatus:   "confirmed",
          changedById: adminProfile.id,
          note:        "管理画面より承認",
        },
      }),

      // 3. LINE 通知キューへエントリ（LINE Messaging API 実装準備）
      //    実際の送信は LINE API 実装後に NotificationQueue を処理するバッチが行う
      prisma.notificationQueue.create({
        data: {
          tenantId,
          appointmentId,
          patientId:        appointment.patientId,
          channel:          "line",
          notificationType: "confirmation",
          scheduledAt:      now,   // 即時送信予定
          status:           "pending",
        },
      }),
    ]);
  } catch (e) {
    console.error("[confirmAppointment] DB error:", e);
    return { error: "承認処理中にエラーが発生しました。もう一度お試しください。" };
  }

  // ダッシュボード・予約一覧のキャッシュを無効化（承認待ち件数バッジの即時更新）
  revalidatePath(`/${tenantSlug}/dashboard`);
  revalidatePath(`/${tenantSlug}/appointments`);

  redirect(`/${tenantSlug}/appointments?tab=confirmed`);
}
