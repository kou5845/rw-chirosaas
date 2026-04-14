"use server";

/**
 * テナント設定更新 Server Action
 *
 * CLAUDE.md 規約:
 *   - tenantId はリクエストボディからは取得しない（DB照合済み値を使用）
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type SettingsState = {
  success?: boolean;
  errors?: { general?: string; [key: string]: string | undefined };
} | null;

const TIME_RE = /^([01]\d|2[0-3]):[03]0$/;
const VALID_SLOT_INTERVALS = [15, 20, 30, 60] as const;

export async function updateTenantSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  // CLAUDE.md 絶対ルール: DB照合でtenantIdを確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { errors: { general: "テナントが見つかりません。" } };

  const errors: Record<string, string> = {};

  // ── slotInterval / maxCapacity ──
  const slotIntervalRaw = parseInt(formData.get("slotInterval") as string, 10);
  const maxCapacityRaw  = parseInt(formData.get("maxCapacity")  as string, 10);

  const slotInterval = VALID_SLOT_INTERVALS.includes(slotIntervalRaw as typeof VALID_SLOT_INTERVALS[number])
    ? slotIntervalRaw
    : 30;
  const maxCapacity = !isNaN(maxCapacityRaw) && maxCapacityRaw >= 1 && maxCapacityRaw <= 10
    ? maxCapacityRaw
    : 1;

  // ── 昼休み ──
  const noLunch          = formData.get("noLunch") === "on";
  const lunchStartRaw    = formData.get("lunchStartTime") as string | null;
  const lunchEndRaw      = formData.get("lunchEndTime")   as string | null;
  const lunchStartTime   = noLunch ? null : (lunchStartRaw || null);
  const lunchEndTime     = noLunch ? null : (lunchEndRaw   || null);

  if (!noLunch && lunchStartTime && lunchEndTime) {
    if (lunchStartTime >= lunchEndTime) {
      errors.lunch = "昼休み終了時間は開始時間より後に設定してください。";
    }
  }

  // ── 曜日別営業時間 ──
  type DayData = { dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string };
  const dayRows: DayData[] = [];

  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    const isOpen    = formData.get(`isOpen-${d}`) === "on";
    const openTime  = (formData.get(`openTime-${d}`)  as string | null)?.trim() || "09:00";
    const closeTime = (formData.get(`closeTime-${d}`) as string | null)?.trim() || "20:00";

    if (isOpen) {
      if (!TIME_RE.test(openTime))  errors[`openTime-${d}`]  = `曜日${d}: 開始時間の形式が不正です`;
      if (!TIME_RE.test(closeTime)) errors[`closeTime-${d}`] = `曜日${d}: 終了時間の形式が不正です`;
      if (openTime >= closeTime)    errors[`range-${d}`]     = `曜日${d}: 終了は開始より後にしてください`;
    }
    dayRows.push({ dayOfWeek: d, isOpen, openTime, closeTime });
  }

  if (Object.keys(errors).length > 0) return { errors };

  // ── DB 更新（トランザクション）──
  await prisma.$transaction([
    // Tenant の昼休み・スロット設定を更新
    prisma.tenant.update({
      where: { id: tenant.id },
      data:  { lunchStartTime, lunchEndTime, slotInterval, maxCapacity },
    }),
    // BusinessHour を全曜日 upsert
    ...dayRows.map((row) =>
      prisma.businessHour.upsert({
        where:  { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek: row.dayOfWeek } },
        update: { isOpen: row.isOpen, openTime: row.openTime, closeTime: row.closeTime },
        create: { tenantId: tenant.id, ...row },
      })
    ),
  ]);

  revalidatePath(`/${tenantSlug}/settings`);
  revalidatePath(`/${tenantSlug}/appointments`);

  return { success: true };
}
