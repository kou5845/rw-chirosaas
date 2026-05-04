"use server";

/**
 * 患者詳細ページからの予約新規作成 Server Action
 *
 * CLAUDE.md 規約:
 *   - tenantId はリクエストボディからではなく DB 照合済み値を使用
 *   - 予約ステータスは pending が初期値（require_approval は全テナント必須）
 *
 * 役割:
 *   - フォームデータのパース・入力バリデーション
 *   - テナント内の患者・スタッフ存在確認
 *   - 予約ビジネスロジックは reservationService に委譲
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getOrCreateProfile } from "@/lib/getOrCreateProfile";
import { createReservation, updateReservationStatus } from "@/services/reservationService";

export type CreateAppointmentState = {
  success?: boolean;
  errors?: {
    date?:        string;
    time?:        string;
    menuName?:    string;
    durationMin?: string;
    price?:       string;
    general?:     string;
  };
} | null;

export async function createAppointment(
  _prevState: CreateAppointmentState,
  formData: FormData
): Promise<CreateAppointmentState> {
  const tenantId   = formData.get("tenantId")   as string;
  const patientId  = formData.get("patientId")  as string;
  const tenantSlug = formData.get("tenantSlug") as string;

  if (!tenantId || !patientId || !tenantSlug) {
    return { errors: { general: "必要なパラメータが不足しています。" } };
  }

  const dateStr     = (formData.get("date")        as string | null)?.trim() ?? "";
  const timeStr     = (formData.get("time")        as string | null)?.trim() ?? "";
  const menuName    = (formData.get("menuName")    as string | null)?.trim() ?? "";
  const durationRaw = (formData.get("durationMin") as string | null);
  const priceRaw    = (formData.get("price")       as string | null);
  const staffId     = (formData.get("staffId")     as string | null) || null;
  const note        = (formData.get("note")        as string | null)?.trim() || null;

  // ── フォーム入力バリデーション ────────────────────────────────────
  const errors: NonNullable<CreateAppointmentState>["errors"] = {};

  if (!dateStr)  errors.date     = "予約日を選択してください。";
  if (!timeStr)  errors.time     = "予約時間を選択してください。";
  if (!menuName) errors.menuName = "メニュー名を入力してください。";

  const durationMin = durationRaw ? parseInt(durationRaw, 10) : NaN;
  if (isNaN(durationMin) || durationMin <= 0) {
    errors.durationMin = "所要時間を選択してください。";
  }

  const price = priceRaw ? parseInt(priceRaw, 10) : NaN;
  if (isNaN(price) || price < 0) {
    errors.price = "料金を正しく入力してください。";
  }

  if (Object.keys(errors).length > 0) return { errors };

  // startAt / endAt を構築
  const startAt = new Date(`${dateStr}T${timeStr}:00+09:00`);
  if (isNaN(startAt.getTime())) {
    return { errors: { date: "日時の形式が正しくありません。" } };
  }
  const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);

  // ── CLAUDE.md 規約: テナント内の患者であることを DB で確認 ─────────
  const patient = await prisma.patient.findFirst({
    where:  { id: patientId, tenantId },
    select: { id: true },
  });
  if (!patient) {
    return { errors: { general: "患者情報が見つかりません。" } };
  }

  // staffId が指定されている場合は同テナント内のスタッフか確認
  if (staffId) {
    const staff = await prisma.staff.findFirst({
      where:  { id: staffId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!staff) {
      return { errors: { general: "指定されたスタッフが見つかりません。" } };
    }
  }

  // ── 予約ビジネスロジックを共通サービスに委譲 ──────────────────────
  const result = await createReservation({
    tenantId,
    patientId,
    menuName,
    durationMin,
    price,
    startAt,
    endAt,
    staffId,
    note,
  });

  if (!result.success) {
    return { errors: { general: result.error } };
  }

  // ── 管理画面からの作成は即時確定 + 確定通知を送信 ──
  // AppointmentLog への記録も updateReservationStatus 内で行われる
  const session = await auth();
  const adminProfile = session?.user?.id
    ? await getOrCreateProfile(session.user.id, tenantId)
    : null;
  if (adminProfile) {
    const confirmResult = await updateReservationStatus({
      appointmentId: result.appointmentId,
      tenantId,
      newStatus:   "confirmed",
      changedById: adminProfile.id,
      note:        "管理画面から作成・即時確定",
    });
    if (!confirmResult.success) {
      console.error("[createAppointment] 即時確定に失敗しました:", confirmResult.error);
    }
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  revalidatePath(`/${tenantSlug}/appointments`);

  return { success: true };
}
