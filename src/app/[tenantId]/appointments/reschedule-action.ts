"use server";

/**
 * 予約日時変更 Server Action（DnD ドロップ時に呼ばれる）
 *
 * CLAUDE.md 規約:
 *   - tenantId は DB 照合で確定（リクエストから信頼しない）
 *   - 全 Prisma クエリに tenantId を含めること
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendUpdateNotification } from "@/lib/notificationService";

type Input = {
  appointmentId: string;
  tenantSlug:    string;
  newStartIso:   string; // ISO 8601
  newEndIso:     string; // ISO 8601
};

export async function rescheduleAppointment({
  appointmentId,
  tenantSlug,
  newStartIso,
  newEndIso,
}: Input): Promise<{ success: boolean; error?: string }> {
  // CLAUDE.md 絶対ルール: DB 照合で tenantId を確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, maxCapacity: true },
  });
  if (!tenant) return { success: false, error: "テナントが見つかりません" };

  // 予約がこのテナントに属することを確認（通知用に詳細も取得）
  const appt = await prisma.appointment.findFirst({
    where:  { id: appointmentId, tenantId: tenant.id },
    select: {
      id:          true,
      status:      true,
      startAt:     true,
      endAt:       true,
      menuName:    true,
      durationMin: true,
      price:       true,
      patient: {
        select: { displayName: true, lineUserId: true, email: true },
      },
    },
  });
  if (!appt) return { success: false, error: "予約が見つかりません" };

  if (appt.status !== "pending" && appt.status !== "confirmed") {
    return { success: false, error: "完了・キャンセル済みの予約は変更できません" };
  }

  const newStartAt = new Date(newStartIso);
  const newEndAt   = new Date(newEndIso);

  if (isNaN(newStartAt.getTime()) || isNaN(newEndAt.getTime())) {
    return { success: false, error: "日時の形式が不正です" };
  }

  // maxCapacity チェック（自分自身は除外）
  const overlapping = await prisma.appointment.count({
    where: {
      tenantId: tenant.id,
      id:       { not: appointmentId },
      status:   { in: ["pending", "confirmed"] },
      startAt:  { lt: newEndAt },
      endAt:    { gt: newStartAt },
    },
  });
  if (overlapping >= tenant.maxCapacity) {
    return {
      success: false,
      error: `この時間帯はすでに${tenant.maxCapacity}件の予約が入っています（上限: ${tenant.maxCapacity}件）`,
    };
  }

  const oldStartAt = appt.startAt;
  const oldEndAt   = appt.endAt;

  try {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data:  { startAt: newStartAt, endAt: newEndAt },
    });
  } catch (err) {
    console.error("[rescheduleAppointment]", err);
    return { success: false, error: "予約の更新に失敗しました。再度お試しください。" };
  }

  // 変更通知を非同期送信（失敗してもリスケジュール自体は成功扱い）
  const tenantInfo = await prisma.tenant.findUnique({
    where:  { id: tenant.id },
    select: { name: true, phone: true, address: true, lineEnabled: true, lineChannelAccessToken: true, emailEnabled: true },
  });
  if (tenantInfo) {
    sendUpdateNotification({
      tenant:      tenantInfo,
      patient:     appt.patient,
      appointment: {
        menuName:    appt.menuName,
        durationMin: appt.durationMin,
        price:       appt.price,
        startAt:     newStartAt,
        endAt:       newEndAt,
      },
      oldStartAt,
      oldEndAt,
    }).catch((e) => console.error("[rescheduleAppointment] 変更通知エラー:", e));
  }

  revalidatePath(`/${tenantSlug}/appointments`);
  return { success: true };
}
