"use server";

/**
 * 予約削除 Server Actions
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - tenantId は DB 照合済み値のみ使用（リクエストパラメータ不使用）
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendCancellationNotification } from "@/lib/notificationService";

export async function deleteAppointment(
  appointmentId: string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  if (!appointmentId || !tenantSlug) {
    return { success: false, error: "必要なパラメータが不足しています。" };
  }

  // tenantSlug から tenantId を解決（絶対ルール: DB 照合済み値を使用）
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { success: false, error: "テナントが見つかりません。" };

  // CLAUDE.md 絶対ルール: tenantId フィルタで自テナントの予約であることを確認
  // 通知に必要な情報も合わせて取得
  const appt = await prisma.appointment.findFirst({
    where:  { id: appointmentId, tenantId: tenant.id },
    select: {
      id:          true,
      patientId:   true,
      menuName:    true,
      durationMin: true,
      price:       true,
      startAt:     true,
      endAt:       true,
      patient: {
        select: { displayName: true, lineUserId: true, email: true },
      },
    },
  });
  if (!appt) return { success: false, error: "予約が見つからないか、権限がありません。" };

  // テナント通知設定を取得（削除前に通知するため先に取得）
  const tenantInfo = await prisma.tenant.findUnique({
    where:  { id: tenant.id },
    select: { name: true, phone: true, address: true, lineEnabled: true, lineChannelAccessToken: true, emailEnabled: true, emailCustomMessage: true },
  });

  try {
    await prisma.appointment.delete({ where: { id: appointmentId } });
  } catch (e) {
    console.error("[deleteAppointment] DB error:", e);
    return { success: false, error: "削除処理中にエラーが発生しました。" };
  }

  // 削除後に通知（削除成功確定後に送信・失敗しても削除は完了扱い）
  if (tenantInfo) {
    sendCancellationNotification({
      tenant:      tenantInfo,
      patient:     appt.patient,
      appointment: {
        menuName:    appt.menuName,
        durationMin: appt.durationMin,
        price:       appt.price,
        startAt:     appt.startAt,
        endAt:       appt.endAt,
      },
    }).catch((e) => console.error("[deleteAppointment] キャンセル通知エラー:", e));
  }

  revalidatePath(`/${tenantSlug}/appointments`);
  revalidatePath(`/${tenantSlug}/dashboard`);
  revalidatePath(`/${tenantSlug}/patients/${appt.patientId}`);
  return { success: true };
}

export async function bulkDeleteAppointments(
  appointmentIds: string[],
  tenantSlug: string,
): Promise<{ success: boolean; error?: string; deletedCount?: number }> {
  if (appointmentIds.length === 0) return { success: true, deletedCount: 0 };

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { success: false, error: "テナントが見つかりません。" };

  try {
    const result = await prisma.appointment.deleteMany({
      where: {
        id:       { in: appointmentIds },
        tenantId: tenant.id, // CLAUDE.md 絶対ルール
      },
    });

    revalidatePath(`/${tenantSlug}/appointments`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    return { success: true, deletedCount: result.count };
  } catch (e) {
    console.error("[bulkDeleteAppointments] DB error:", e);
    return { success: false, error: "一括削除中にエラーが発生しました。" };
  }
}
