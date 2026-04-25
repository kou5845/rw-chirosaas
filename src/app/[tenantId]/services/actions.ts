"use server";

/**
 * 施術マスタ CRUD Server Actions
 *
 * CLAUDE.md 規約:
 *   - tenantId はセッション由来の値のみ使用（FormData 不使用）
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth }   from "@/auth";

async function getSessionTenant() {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.tenantSlug) return null;
  return { tenantId: session.user.tenantId, tenantSlug: session.user.tenantSlug };
}

export type ServiceFormState = {
  errors?: {
    name?:        string;
    duration?:    string;
    intervalMin?: string;
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
  // CLAUDE.md 絶対ルール: tenantId はセッションから取得
  const t = await getSessionTenant();
  if (!t) return { errors: { general: "認証エラーです。再ログインしてください。" } };

  const parsed = parseServiceForm(formData);
  if ("errors" in parsed) return { errors: parsed.errors };

  try {
    await prisma.service.create({
      data: { tenantId: t.tenantId, ...parsed.data },
    });
  } catch {
    return { errors: { general: "登録処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${t.tenantSlug}/services`);
  return { success: true };
}

// ── 更新 ─────────────────────────────────────────────────────────

export async function updateService(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  // CLAUDE.md 絶対ルール: tenantId はセッションから取得
  const t = await getSessionTenant();
  if (!t) return { errors: { general: "認証エラーです。再ログインしてください。" } };

  const serviceId = formData.get("serviceId") as string;
  if (!serviceId) return { errors: { general: "サービス情報が不正です。" } };

  const parsed = parseServiceForm(formData);
  if ("errors" in parsed) return { errors: parsed.errors };

  try {
    // CLAUDE.md 絶対ルール: tenantId フィルタで他テナントへの書き込みを防止
    await prisma.service.updateMany({
      where: { id: serviceId, tenantId: t.tenantId },
      data:  parsed.data,
    });
  } catch {
    return { errors: { general: "更新処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${t.tenantSlug}/services`);
  return { success: true };
}

// ── 有効/停止 トグル ─────────────────────────────────────────

export async function toggleServiceStatus(
  serviceId:  string,
  isActive:   boolean,
  _tenantId:   string,
  _tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const t = await getSessionTenant();
  if (!t) return { success: false, error: "認証エラーです。" };
  try {
    await prisma.service.updateMany({
      where: { id: serviceId, tenantId: t.tenantId }, // CLAUDE.md 絶対ルール
      data:  { isActive },
    });
  } catch {
    return { success: false, error: "状態の更新中にエラーが発生しました。" };
  }
  revalidatePath(`/${t.tenantSlug}/services`);
  return { success: true };
}

// ── 論理削除（isActive = false）────────────────────────────────

export async function deactivateService(
  serviceId:  string,
  _tenantId:  string,
  _tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const t = await getSessionTenant();
  if (!t) return { success: false, error: "認証エラーです。" };
  try {
    await prisma.service.updateMany({
      where: { id: serviceId, tenantId: t.tenantId },
      data:  { isActive: false },
    });
  } catch {
    return { success: false, error: "削除処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${t.tenantSlug}/services`);
  return { success: true };
}

// ── 復元（isActive = true）───────────────────────────────────

export async function reactivateService(
  serviceId:  string,
  _tenantId:  string,
  _tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const t = await getSessionTenant();
  if (!t) return { success: false, error: "認証エラーです。" };
  try {
    await prisma.service.updateMany({
      where: { id: serviceId, tenantId: t.tenantId },
      data:  { isActive: true },
    });
  } catch {
    return { success: false, error: "復元処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${t.tenantSlug}/services`);
  return { success: true };
}

// ── 並び替え ─────────────────────────────────────────────────

export async function reorderServices(
  items:       { id: string; sortOrder: number }[],
  _tenantId:   string,
  _tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const t = await getSessionTenant();
  if (!t) return { success: false, error: "認証エラーです。" };
  try {
    await prisma.$transaction(
      items.map((item) =>
        prisma.service.updateMany({
          where: { id: item.id, tenantId: t.tenantId }, // CLAUDE.md 絶対ルール
          data:  { sortOrder: item.sortOrder },
        })
      )
    );
  } catch {
    return { success: false, error: "並び替え処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${t.tenantSlug}/services`);
  return { success: true };
}

// ── 共通パーサー ─────────────────────────────────────────────

type ParsedData = {
  name:        string;
  duration:    number;
  intervalMin: number;
  price:       number;
  description: string | null;
};

function parseServiceForm(
  formData: FormData,
): { data: ParsedData } | { errors: NonNullable<ServiceFormState>["errors"] } {
  const name           = (formData.get("name")        as string | null)?.trim() ?? "";
  const durationStr    = (formData.get("duration")    as string | null)?.trim() ?? "";
  const intervalStr    = (formData.get("intervalMin") as string | null)?.trim() ?? "";
  const priceStr       = (formData.get("price")       as string | null)?.trim() ?? "";
  const description    = (formData.get("description") as string | null)?.trim() || null;

  const errors: NonNullable<ServiceFormState>["errors"] = {};

  if (!name)                         errors.name     = "施術名は必須です。";
  else if (name.length > 255)        errors.name     = "施術名は255文字以内で入力してください。";

  const duration = parseInt(durationStr, 10);
  if (!durationStr || isNaN(duration) || duration <= 0)
    errors.duration = "所要時間は1以上の整数で入力してください。";
  else if (duration > 480)
    errors.duration = "所要時間は480分（8時間）以内で入力してください。";

  const intervalMin = intervalStr === "" ? 0 : parseInt(intervalStr, 10);
  if (isNaN(intervalMin) || intervalMin < 0)
    errors.intervalMin = "インターバルは0以上の整数で入力してください。";
  else if (intervalMin > 120)
    errors.intervalMin = "インターバルは120分以内で入力してください。";

  const price = parseInt(priceStr, 10);
  if (!priceStr || isNaN(price) || price < 0)
    errors.price = "料金は0以上の整数で入力してください。";

  if (Object.keys(errors).length > 0) return { errors };

  return { data: { name, duration, intervalMin, price, description } };
}
