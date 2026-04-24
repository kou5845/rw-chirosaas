"use server";

/**
 * テナント設定更新 Server Action
 *
 * CLAUDE.md 規約:
 *   - tenantId はリクエストボディからは取得しない（DB照合済み値を使用）
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { revalidatePath, revalidateTag } from "next/cache";
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

// ── 基本情報更新 ──────────────────────────────────────────────────────

export type ClinicInfoState = {
  success?: boolean;
  errors?: { general?: string; phone?: string };
} | null;

export async function updateClinicInfo(
  _prev: ClinicInfoState,
  formData: FormData
): Promise<ClinicInfoState> {
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  // CLAUDE.md 絶対ルール: DB照合でtenantIdを確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { errors: { general: "テナントが見つかりません。" } };

  const phone   = (formData.get("phone")   as string | null)?.trim() || null;
  const address = (formData.get("address") as string | null)?.trim() || null;

  if (phone && !/^[\d\-\(\)\s]{10,20}$/.test(phone)) {
    return { errors: { phone: "正しい電話番号を入力してください（例: 03-1234-5678）。" } };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data:  { phone, address },
    });
  } catch (err) {
    console.error("[updateClinicInfo] DB error:", err);
    return { errors: { general: "保存中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/settings`);
  return { success: true };
}

// ── LINE 連携設定更新 ──────────────────────────────────────────────────

export type LineSettingsState = {
  success?: boolean;
  errors?: { general?: string };
} | null;

export async function updateLineSettings(
  _prev: LineSettingsState,
  formData: FormData
): Promise<LineSettingsState> {
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  // CLAUDE.md 絶対ルール: DB照合でtenantIdを確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { errors: { general: "テナントが見つかりません。" } };

  const lineChannelSecret      = (formData.get("lineChannelSecret")      as string | null)?.trim() || null;
  const lineChannelAccessToken = (formData.get("lineChannelAccessToken") as string | null)?.trim() || null;
  const lineFriendUrl          = (formData.get("lineFriendUrl")          as string | null)?.trim() || null;

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data:  { lineChannelSecret, lineChannelAccessToken, lineFriendUrl },
    });
  } catch (err) {
    console.error("[updateLineSettings] DB error:", err);
    return { errors: { general: "保存中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/settings`);
  return { success: true };
}

// ── メールカスタムメッセージ更新（プロプラン限定）────────────────────────

export type EmailCustomMessageState = {
  success?: boolean;
  errors?: { general?: string; message?: string };
} | null;

export async function updateEmailCustomMessage(
  _prev: EmailCustomMessageState,
  formData: FormData
): Promise<EmailCustomMessageState> {
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  // CLAUDE.md 絶対ルール: DB照合でtenantIdを確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, plan: true },
  });
  if (!tenant) return { errors: { general: "テナントが見つかりません。" } };

  // バックエンドでのプランガード（フロントエンドのみ制御に依存しない）
  if (tenant.plan !== "pro") {
    return { errors: { general: "この機能はプロプラン限定です。" } };
  }

  const raw = (formData.get("emailCustomMessage") as string | null) ?? "";
  const message = raw.trim() || null;

  if (message && message.length > 500) {
    return { errors: { message: "500文字以内で入力してください。" } };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data:  { emailCustomMessage: message },
    });
  } catch (err) {
    console.error("[updateEmailCustomMessage] DB error:", err);
    return { errors: { general: "保存中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/settings`);
  return { success: true };
}

// ── 通知カスタムメッセージ更新（プロプラン限定・プラットフォーム×種別）────────────

export type NotificationCustomMessageState = {
  success?: boolean;
  errors?: { general?: string; message?: string };
} | null;

type Platform  = "email" | "line";
type NotifType = "confirm" | "change" | "reminder" | "reject";

const FIELD_MAP: Record<`${Platform}:${NotifType}`, string> = {
  "email:confirm":  "emailConfirmMsg",
  "email:change":   "emailChangeMsg",
  "email:reminder": "emailReminderMsg",
  "email:reject":   "emailRejectMsg",
  "line:confirm":   "lineConfirmMsg",
  "line:change":    "lineChangeMsg",
  "line:reminder":  "lineReminderMsg",
  "line:reject":    "lineRejectMsg",
};

/**
 * プラットフォーム × 通知種別ごとのカスタムメッセージを保存する。
 * バックエンドでプロプランを検証し、保存後に cron バッチ用のキャッシュをパージする。
 */
export async function updateNotificationCustomMessage(
  _prev: NotificationCustomMessageState,
  formData: FormData
): Promise<NotificationCustomMessageState> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const platform   = formData.get("platform")   as Platform;
  const notifType  = formData.get("notifType")  as NotifType;

  if (!tenantSlug || !platform || !notifType) {
    return { errors: { general: "パラメータが不正です。" } };
  }

  const fieldName = FIELD_MAP[`${platform}:${notifType}`];
  if (!fieldName) return { errors: { general: "パラメータが不正です。" } };

  // CLAUDE.md 絶対ルール: DB照合でtenantIdを確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, plan: true },
  });
  if (!tenant) return { errors: { general: "テナントが見つかりません。" } };

  // バックエンドでのプランガード（2層バリデーション）
  if (tenant.plan !== "pro") {
    return { errors: { general: "この機能はプロプラン限定です。" } };
  }

  const raw     = (formData.get("message") as string | null) ?? "";
  const message = raw.trim() || null;

  if (message && message.length > 500) {
    return { errors: { message: "500文字以内で入力してください。" } };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data:  { [fieldName]: message },
    });

    // cron バッチが古いメッセージを送信しないようキャッシュをパージ
    // キャッシュキーにtenantIdを含めることでマルチテナント間の衝突を防ぐ
    revalidateTag(`tenant-msg-${tenant.id}`, "default");
  } catch (err) {
    console.error("[updateNotificationCustomMessage] DB error:", err);
    return { errors: { general: "保存中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/settings`);
  return { success: true };
}

// ── 通知設定更新 ──────────────────────────────────────────────────────

export type NotificationSettingsState = {
  success?: boolean;
  errors?: { general?: string };
} | null;

export async function updateNotificationSettings(
  _prev: NotificationSettingsState,
  formData: FormData
): Promise<NotificationSettingsState> {
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  // CLAUDE.md 絶対ルール: DB照合でtenantIdを確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { errors: { general: "テナントが見つかりません。" } };

  // チェックボックスは ON 時のみ値が送信される
  const lineEnabled  = formData.get("lineEnabled")  === "on";
  const emailEnabled = formData.get("emailEnabled") === "on";

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data:  { lineEnabled, emailEnabled },
    });
  } catch (err) {
    console.error("[updateNotificationSettings] DB error:", err);
    return { errors: { general: "保存中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/settings`);
  return { success: true };
}
