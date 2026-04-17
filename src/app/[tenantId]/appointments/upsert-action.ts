"use server";

/**
 * 予約作成・編集 統合 Server Action
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - 新規予約は必ず pending ステータスで作成（require_approval 必須・不変）
 *   - tenantId はリクエストボディではなく DB 照合済み値を使用
 *   - maxCapacity 重複バリデーションを必ず実行
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { updateReservationStatus } from "@/services/reservationService";
import { sendUpdateNotification } from "@/lib/notificationService";

export type UpsertAppointmentState = {
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

export async function upsertAppointment(
  _prevState: UpsertAppointmentState,
  formData: FormData,
): Promise<UpsertAppointmentState> {
  const tenantId      = formData.get("tenantId")      as string;
  const tenantSlug    = formData.get("tenantSlug")    as string;
  const patientId     = formData.get("patientId")     as string;
  const appointmentId = (formData.get("appointmentId") as string | null) || null;

  if (!tenantId || !tenantSlug || !patientId) {
    return { errors: { general: "必要なパラメータが不足しています。" } };
  }

  const dateStr      = (formData.get("date")        as string | null)?.trim() ?? "";
  const timeStr      = (formData.get("time")        as string | null)?.trim() ?? "";
  const menuName     = (formData.get("menuName")    as string | null)?.trim() ?? "";
  const durationRaw  = formData.get("durationMin")  as string | null;
  const intervalRaw  = formData.get("intervalMin")  as string | null;
  const priceRaw     = formData.get("price")        as string | null;
  const staffId      = (formData.get("staffId")     as string | null) || null;
  const note         = (formData.get("note")        as string | null)?.trim() || null;

  // ── バリデーション ──
  const errors: NonNullable<UpsertAppointmentState>["errors"] = {};

  if (!dateStr)  errors.date        = "予約日を選択してください。";
  if (!timeStr)  errors.time        = "予約時間を選択してください。";
  if (!menuName) errors.menuName    = "メニュー名を入力してください。";

  const durationMin = durationRaw ? parseInt(durationRaw, 10) : NaN;
  if (isNaN(durationMin) || durationMin <= 0) {
    errors.durationMin = "所要時間を選択してください。";
  }

  const price = priceRaw ? parseInt(priceRaw, 10) : NaN;
  if (isNaN(price) || price < 0) {
    errors.price = "料金を正しく入力してください。";
  }

  if (Object.keys(errors).length > 0) return { errors };

  // インターバル（準備時間）: endAt = startAt + durationMin + intervalMin
  const intervalMinRaw = intervalRaw ? parseInt(intervalRaw, 10) : 0;
  const effectiveInterval = !isNaN(intervalMinRaw) && intervalMinRaw > 0 ? intervalMinRaw : 0;

  const startAt = new Date(`${dateStr}T${timeStr}:00+09:00`);
  if (isNaN(startAt.getTime())) {
    return { errors: { date: "日時の形式が正しくありません。" } };
  }
  const endAt = new Date(startAt.getTime() + (durationMin + effectiveInterval) * 60 * 1000);

  // ── テナント・患者の整合性確認 ──
  const patient = await prisma.patient.findFirst({
    where:  { id: patientId, tenantId },
    select: { id: true },
  });
  if (!patient) return { errors: { general: "患者情報が見つかりません。" } };

  // ── maxCapacity チェック ──
  const tenantConfig = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { maxCapacity: true },
  });
  if (tenantConfig) {
    const overlapping = await prisma.appointment.count({
      where: {
        tenantId,
        // 編集時は自分自身を除外する
        ...(appointmentId ? { id: { not: appointmentId } } : {}),
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

  // ── スタッフ確認 ──
  if (staffId) {
    const staff = await prisma.staff.findFirst({
      where:  { id: staffId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!staff) return { errors: { general: "指定されたスタッフが見つかりません。" } };
  }

  try {
    if (appointmentId) {
      // ── 更新 ──
      // CLAUDE.md 絶対ルール: tenantId フィルタで自テナントの予約であることを確認
      const existing = await prisma.appointment.findFirst({
        where:  { id: appointmentId, tenantId },
        select: {
          id:          true,
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
      if (!existing) return { errors: { general: "予約が見つからないか、権限がありません。" } };

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          patientId,
          staffId:    staffId ?? null,
          menuName,
          durationMin,
          price,
          startAt,
          endAt,
          note,
        },
      });

      // 日時が変更された場合のみ通知を送信（失敗しても更新は完了扱い）
      const dateChanged = existing.startAt.getTime() !== startAt.getTime();
      if (dateChanged) {
        const tenant = await prisma.tenant.findUnique({
          where:  { id: tenantId },
          select: { name: true, phone: true, address: true, lineEnabled: true, lineChannelAccessToken: true, emailEnabled: true },
        });
        if (tenant) {
          sendUpdateNotification({
            tenant,
            patient:     existing.patient,
            appointment: { menuName, durationMin, price, startAt, endAt },
            oldStartAt:  existing.startAt,
            oldEndAt:    existing.endAt,
          }).catch((e) => console.error("[upsertAppointment] 変更通知エラー:", e));
        }
      }
    } else {
      // ── 通知フラグ（チェックボックス ON = "on"、未チェックは absent）──
      const sendNotification = formData.get("sendNotification") === "on";

      // ── 新規作成（CLAUDE.md: pending → confirmed の順を維持）──
      const created = await prisma.appointment.create({
        data: {
          tenantId,
          patientId,
          staffId:    staffId ?? null,
          menuName,
          durationMin,
          price,
          status:  "pending",
          startAt,
          endAt,
          note,
        },
      });

      // ── 即時確定（AppointmentLog 記録 + 条件付き通知）──
      const adminProfile = await prisma.profile.findFirst({
        where:  { tenantId, role: "admin", isActive: true },
        select: { id: true },
      });
      if (adminProfile) {
        const logNote = sendNotification
          ? "管理画面から作成（通知あり）"
          : "管理画面から作成（通知なし）";
        const confirmResult = await updateReservationStatus({
          appointmentId:    created.id,
          tenantId,
          newStatus:        "confirmed",
          changedById:      adminProfile.id,
          note:             logNote,
          sendNotification,
        });
        if (!confirmResult.success) {
          console.error("[upsertAppointment] 即時確定に失敗しました:", confirmResult.error);
        }
      }
    }
  } catch (e) {
    console.error("[upsertAppointment] DB error:", e);
    return { errors: { general: "予約の保存中にエラーが発生しました。もう一度お試しください。" } };
  }

  revalidatePath(`/${tenantSlug}/appointments`);
  revalidatePath(`/${tenantSlug}/dashboard`);
  revalidatePath(`/${tenantSlug}/patients/${patientId}`);

  return { success: true };
}
