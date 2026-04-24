"use server";

/**
 * 予約承認 Server Action
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - ステータス変更は必ず AppointmentLog に記録すること（絶対ルール）
 *   - require_approval: pending → confirmed の順は不変
 *
 * DB更新・AppointmentLog記録・LINE即時送信はすべて
 * reservationService.updateReservationStatus に委譲する。
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { updateReservationStatus, rejectReservation } from "@/services/reservationService";
import { messagingApi } from "@line/bot-sdk";
import { buildConfirmationMessage } from "@/lib/line";
import { sendReservationEmail } from "@/lib/email";

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

  // Auth 未実装のため、当該テナントの最初の admin プロフィールを changedBy に使用。
  // TODO: Supabase Auth 実装後は session.user.id に差し替えること。
  const adminProfile = await prisma.profile.findFirst({
    where:  { tenantId, role: "admin", isActive: true },
    select: { id: true },
  });
  if (!adminProfile) {
    return { error: "管理者プロフィールが見つかりません。シードデータをご確認ください。" };
  }

  // DB更新 + AppointmentLog記録 + LINE確定通知をサービスに委譲
  const result = await updateReservationStatus({
    appointmentId,
    tenantId,
    newStatus:   "confirmed",
    changedById: adminProfile.id,
  });

  if (!result.success) {
    return { error: result.error };
  }

  // ダッシュボード・予約一覧のキャッシュを無効化（承認待ち件数バッジの即時更新）
  revalidatePath(`/${tenantSlug}/dashboard`);
  revalidatePath(`/${tenantSlug}/appointments`);

  // redirect を除去: 承認後はリストに留まり連続作業できるようにする
  return null;
}

// ── お断り ────────────────────────────────────────────────────────────

export type RejectActionState = { error: string } | null;

export async function rejectAppointment(
  _prevState: RejectActionState,
  formData: FormData
): Promise<RejectActionState> {
  const appointmentId = formData.get("appointmentId") as string;
  const tenantId      = formData.get("tenantId")      as string;
  const tenantSlug    = formData.get("tenantSlug")    as string;

  if (!appointmentId || !tenantId || !tenantSlug) {
    return { error: "必要なパラメータが不足しています。" };
  }

  const adminProfile = await prisma.profile.findFirst({
    where:  { tenantId, role: "admin", isActive: true },
    select: { id: true },
  });
  if (!adminProfile) {
    return { error: "管理者プロフィールが見つかりません。" };
  }

  const result = await rejectReservation({
    appointmentId,
    tenantId,
    changedById: adminProfile.id,
  });

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath(`/${tenantSlug}/dashboard`);
  revalidatePath(`/${tenantSlug}/appointments`);

  return null;
}

// ── 一括承認 ─────────────────────────────────────────────────────────

export type BulkApproveResult =
  | { success: true;  approvedCount: number }
  | { success: false; error: string };

/**
 * 複数の予約を一括で confirmed に更新する。
 * updateMany で効率的に処理し、AppointmentLog もバッチ insert する。
 * 通知は非同期送信（失敗しても承認は完了扱い）。
 */
export async function bulkApproveAppointments(
  appointmentIds: string[],
  tenantId:        string,
  tenantSlug:      string,
): Promise<BulkApproveResult> {
  if (appointmentIds.length === 0) {
    return { success: true, approvedCount: 0 };
  }

  // テナント照合 + 対象予約の検証（CLAUDE.md 絶対ルール: tenantId フィルタ）
  const adminProfile = await prisma.profile.findFirst({
    where:  { tenantId, role: "admin", isActive: true },
    select: { id: true },
  });
  if (!adminProfile) {
    return { success: false, error: "管理者プロフィールが見つかりません。" };
  }

  // pending かつ自テナントの予約のみ対象（通知用に patient・tenant も取得）
  const targets = await prisma.appointment.findMany({
    where: {
      id:       { in: appointmentIds },
      tenantId,                          // CLAUDE.md 絶対ルール
      status:   "pending",
    },
    select: {
      id:          true,
      menuName:    true,
      durationMin: true,
      price:       true,
      startAt:     true,
      endAt:       true,
      patient: { select: { displayName: true, lineUserId: true, email: true } },
    },
  });

  if (targets.length === 0) {
    return { success: false, error: "承認対象の予約が見つかりません。" };
  }

  const now       = new Date();
  const targetIds = targets.map((t) => t.id);

  try {
    await prisma.$transaction([
      // 一括ステータス更新
      prisma.appointment.updateMany({
        where: { id: { in: targetIds }, tenantId, status: "pending" },
        data:  { status: "confirmed", confirmedAt: now, confirmedBy: adminProfile.id },
      }),
      // AppointmentLog を一括 insert（CLAUDE.md 絶対ルール）
      prisma.appointmentLog.createMany({
        data: targetIds.map((id) => ({
          appointmentId: id,
          oldStatus:     "pending"   as const,
          newStatus:     "confirmed" as const,
          changedById:   adminProfile.id,
          note:          "管理画面から一括承認",
        })),
      }),
    ]);
  } catch (e) {
    console.error("[bulkApproveAppointments] DB error:", e);
    return { success: false, error: "一括承認処理中にエラーが発生しました。" };
  }

  // 通知を非同期送信（失敗しても承認は完了扱い）
  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { name: true, phone: true, address: true, lineEnabled: true, lineChannelAccessToken: true, emailEnabled: true, emailConfirmMsg: true, lineConfirmMsg: true },
  });
  if (tenant) {
    for (const appt of targets) {
      const msgArgs = {
        tenantName:  tenant.name,
        patientName: appt.patient.displayName,
        menuName:    appt.menuName,
        durationMin: appt.durationMin,
        price:       appt.price,
        startAt:     appt.startAt,
        endAt:       appt.endAt,
        phone:       tenant.phone,
        address:     tenant.address,
      };

      if (tenant.lineEnabled && appt.patient.lineUserId) {
        const token = tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
        if (token) {
          const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
          client.pushMessage({
            to:       appt.patient.lineUserId,
            messages: [{ type: "text", text: buildConfirmationMessage({ ...msgArgs, customMessage: tenant.lineConfirmMsg }) }],
          }).catch((e: unknown) => console.error("[bulkApprove] LINE通知失敗:", e));
        }
      }

      if (tenant.emailEnabled && appt.patient.email) {
        sendReservationEmail({
          to:            appt.patient.email,
          type:          "confirmation",
          ...msgArgs,
          customMessage: tenant.emailConfirmMsg,
        }).catch((e: unknown) => console.error("[bulkApprove] メール通知失敗:", e));
      }
    }
  }

  revalidatePath(`/${tenantSlug}/appointments`);
  revalidatePath(`/${tenantSlug}/dashboard`);

  return { success: true, approvedCount: targets.length };
}
