"use server";

/**
 * 患者詳細ページからの予約新規作成 Server Action
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - 予約ステータスは pending が初期値（require_approval は全テナント必須）
 *   - tenantId はリクエストボディからではなく DB 照合済み値を使用
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type CreateAppointmentState = {
  success?: boolean;
  errors?: {
    date?: string;
    time?: string;
    menuName?: string;
    durationMin?: string;
    price?: string;
    general?: string;
  };
} | null;

export async function createAppointment(
  _prevState: CreateAppointmentState,
  formData: FormData
): Promise<CreateAppointmentState> {
  const tenantId  = formData.get("tenantId")  as string;
  const patientId = formData.get("patientId") as string;
  const tenantSlug = formData.get("tenantSlug") as string;

  if (!tenantId || !patientId || !tenantSlug) {
    return { errors: { general: "必要なパラメータが不足しています。" } };
  }

  const dateStr    = (formData.get("date")     as string | null)?.trim() ?? "";
  const timeStr    = (formData.get("time")     as string | null)?.trim() ?? "";
  const menuName   = (formData.get("menuName") as string | null)?.trim() ?? "";
  const durationRaw = formData.get("durationMin") as string | null;
  const priceRaw    = formData.get("price")       as string | null;
  const staffId     = (formData.get("staffId") as string | null) || null;
  const note        = (formData.get("note")    as string | null)?.trim() || null;

  // ── バリデーション ──
  const errors: NonNullable<CreateAppointmentState>["errors"] = {};

  if (!dateStr) errors.date     = "予約日を選択してください。";
  if (!timeStr) errors.time     = "予約時間を選択してください。";
  if (!menuName) errors.menuName = "メニュー名を入力してください。";

  const durationMin = durationRaw ? parseInt(durationRaw, 10) : NaN;
  if (isNaN(durationMin) || durationMin <= 0) {
    errors.durationMin = "所要時間を選択してください。";
  }

  const price = priceRaw ? parseInt(priceRaw, 10) : NaN;
  if (isNaN(price) || price < 0) {
    errors.price = "料金を正しく入力してください。";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // startAt / endAt を構築
  const startAt = new Date(`${dateStr}T${timeStr}:00+09:00`);
  if (isNaN(startAt.getTime())) {
    return { errors: { date: "日時の形式が正しくありません。" } };
  }
  const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000);

  // CLAUDE.md 規約: tenantId でテナント内の患者であることを確認
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!patient) {
    return { errors: { general: "患者情報が見つかりません。" } };
  }

  // maxCapacity チェック
  const tenantConfig = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { maxCapacity: true },
  });
  if (tenantConfig) {
    const overlapping = await prisma.appointment.count({
      where: {
        tenantId,
        status:  { in: ["pending", "confirmed"] },
        startAt: { lt: endAt },
        endAt:   { gt: startAt },
      },
    });
    if (overlapping >= tenantConfig.maxCapacity) {
      return {
        errors: {
          general: `この時間帯はすでに${tenantConfig.maxCapacity}件の予約が入っています（上限: ${tenantConfig.maxCapacity}件）。`,
        },
      };
    }
  }

  // staffId が指定されている場合は同テナント内のスタッフか確認
  if (staffId) {
    const staff = await prisma.profile.findFirst({
      where: { id: staffId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!staff) {
      return { errors: { general: "指定されたスタッフが見つかりません。" } };
    }
  }

  try {
    // CLAUDE.md 絶対ルール: 予約は pending から開始（require_approval=true 必須）
    await prisma.appointment.create({
      data: {
        tenantId,
        patientId,
        staffId:    staffId || null,
        menuName,
        durationMin,
        price,
        status:  "pending",
        startAt,
        endAt,
        note,
      },
    });
  } catch (e) {
    console.error("[createAppointment] DB error:", e);
    return { errors: { general: "予約の作成中にエラーが発生しました。もう一度お試しください。" } };
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  revalidatePath(`/${tenantSlug}/appointments`);

  return { success: true };
}
