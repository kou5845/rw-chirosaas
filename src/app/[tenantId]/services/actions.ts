"use server";

/**
 * 施術マスタ CRUD Server Actions
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type ServiceFormState = {
  errors?: {
    name?:        string;
    duration?:    string;
    price?:       string;
    description?: string;
    general?:     string;
  };
  success?: boolean;
} | null;

// ── 新規作成 ──────────────────────────────────────────────────────

export async function createService(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantId || !tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  const parsed = parseServiceForm(formData);
  if ("errors" in parsed) return { errors: parsed.errors };

  try {
    await prisma.service.create({
      data: { tenantId, ...parsed.data },
    });
  } catch {
    return { errors: { general: "登録処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/services`);
  return { success: true };
}

// ── 更新 ─────────────────────────────────────────────────────────

export async function updateService(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  const serviceId  = formData.get("serviceId")  as string;
  if (!tenantId || !tenantSlug || !serviceId) return { errors: { general: "テナント情報が不正です。" } };

  const parsed = parseServiceForm(formData);
  if ("errors" in parsed) return { errors: parsed.errors };

  try {
    // CLAUDE.md 絶対ルール: tenantId フィルタで他テナントへの書き込みを防止
    await prisma.service.updateMany({
      where: { id: serviceId, tenantId },
      data:  parsed.data,
    });
  } catch {
    return { errors: { general: "更新処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/services`);
  return { success: true };
}

// ── 論理削除（isActive = false）────────────────────────────────

export async function deactivateService(
  serviceId: string,
  tenantId:  string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.service.updateMany({
      where: { id: serviceId, tenantId },
      data:  { isActive: false },
    });
  } catch {
    return { success: false, error: "削除処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${tenantSlug}/services`);
  return { success: true };
}

// ── 復元（isActive = true）───────────────────────────────────

export async function reactivateService(
  serviceId: string,
  tenantId:  string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.service.updateMany({
      where: { id: serviceId, tenantId },
      data:  { isActive: true },
    });
  } catch {
    return { success: false, error: "復元処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${tenantSlug}/services`);
  return { success: true };
}

// ── 共通パーサー ─────────────────────────────────────────────

type ParsedData = {
  name:        string;
  duration:    number;
  price:       number;
  description: string | null;
};

function parseServiceForm(
  formData: FormData,
): { data: ParsedData } | { errors: NonNullable<ServiceFormState>["errors"] } {
  const name        = (formData.get("name")        as string | null)?.trim() ?? "";
  const durationStr = (formData.get("duration")    as string | null)?.trim() ?? "";
  const priceStr    = (formData.get("price")        as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() || null;

  const errors: NonNullable<ServiceFormState>["errors"] = {};

  if (!name)                         errors.name     = "施術名は必須です。";
  else if (name.length > 255)        errors.name     = "施術名は255文字以内で入力してください。";

  const duration = parseInt(durationStr, 10);
  if (!durationStr || isNaN(duration) || duration <= 0)
    errors.duration = "所要時間は1以上の整数で入力してください。";
  else if (duration > 480)
    errors.duration = "所要時間は480分（8時間）以内で入力してください。";

  const price = parseInt(priceStr, 10);
  if (!priceStr || isNaN(price) || price < 0)
    errors.price = "料金は0以上の整数で入力してください。";

  if (Object.keys(errors).length > 0) return { errors };

  return { data: { name, duration, price, description } };
}
