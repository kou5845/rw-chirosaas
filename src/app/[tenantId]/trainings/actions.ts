"use server";

/**
 * トレーニング種目マスタ CRUD Server Actions
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// ============================================================
// 型定義
// ============================================================

export type CategoryFormState = {
  errors?: { name?: string; general?: string };
  success?: boolean;
} | null;

// ============================================================
// 種目 CRUD
// ============================================================

export async function createExercise(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantId || !tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  const parsed = parseExerciseForm(formData);
  if ("errors" in parsed) return { errors: parsed.errors };

  try {
    await prisma.exercise.create({ data: { tenantId, ...parsed.data } });
  } catch {
    return { errors: { general: "登録処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function updateExercise(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  const exerciseId = formData.get("exerciseId") as string;
  if (!tenantId || !tenantSlug || !exerciseId) return { errors: { general: "テナント情報が不正です。" } };

  const parsed = parseExerciseForm(formData);
  if ("errors" in parsed) return { errors: parsed.errors };

  try {
    await prisma.exercise.updateMany({
      where: { id: exerciseId, tenantId }, // CLAUDE.md 絶対ルール
      data:  parsed.data,
    });
  } catch {
    return { errors: { general: "更新処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function deactivateExercise(
  exerciseId: string,
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.exercise.updateMany({
      where: { id: exerciseId, tenantId },
      data:  { isActive: false },
    });
  } catch {
    return { success: false, error: "削除処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function reactivateExercise(
  exerciseId: string,
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.exercise.updateMany({
      where: { id: exerciseId, tenantId },
      data:  { isActive: true },
    });
  } catch {
    return { success: false, error: "復元処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function toggleExerciseStatus(
  exerciseId: string,
  isActive:   boolean,
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.exercise.updateMany({
      where: { id: exerciseId, tenantId }, // CLAUDE.md 絶対ルール
      data:  { isActive },
    });
  } catch {
    return { success: false, error: "状態の更新中にエラーが発生しました。" };
  }
  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function reorderExercises(
  items:      { id: string; sortOrder: number }[],
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(
      items.map((item) =>
        prisma.exercise.updateMany({
          where: { id: item.id, tenantId }, // CLAUDE.md 絶対ルール
          data:  { sortOrder: item.sortOrder },
        })
      )
    );
  } catch {
    return { success: false, error: "並び替え処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

// ============================================================
// カテゴリ CRUD
// ============================================================

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  const name       = (formData.get("name") as string | null)?.trim() ?? "";

  if (!tenantId || !tenantSlug) return { errors: { general: "テナント情報が不正です。" } };
  if (!name)                    return { errors: { name: "カテゴリ名は必須です。" } };
  if (name.length > 64)         return { errors: { name: "64文字以内で入力してください。" } };

  try {
    // 現在の最大 sortOrder を取得して末尾に追加
    const last = await prisma.exerciseCategory.findFirst({
      where:   { tenantId },
      orderBy: { sortOrder: "desc" },
      select:  { sortOrder: true },
    });
    await prisma.exerciseCategory.create({
      data: { tenantId, name, sortOrder: (last?.sortOrder ?? -10) + 10 },
    });
  } catch {
    return { errors: { general: "登録処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function updateCategory(
  categoryId: string,
  name:       string,
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { success: false, error: "カテゴリ名は必須です。" };

  try {
    await prisma.exerciseCategory.updateMany({
      where: { id: categoryId, tenantId }, // CLAUDE.md 絶対ルール
      data:  { name: trimmed },
    });
    // category スナップショット文字列も同期（既存互換性）
    await prisma.exercise.updateMany({
      where: { categoryId, tenantId },
      data:  { category: trimmed },
    });
  } catch {
    return { success: false, error: "更新処理中にエラーが発生しました。" };
  }

  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function deleteCategory(
  categoryId: string,
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // カテゴリに紐づく種目の categoryId を NULL にしてから削除
    await prisma.$transaction([
      prisma.exercise.updateMany({
        where: { categoryId, tenantId },
        data:  { categoryId: null },
      }),
      prisma.exerciseCategory.deleteMany({
        where: { id: categoryId, tenantId }, // CLAUDE.md 絶対ルール
      }),
    ]);
  } catch {
    return { success: false, error: "削除処理中にエラーが発生しました。" };
  }

  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

export async function reorderCategories(
  items:      { id: string; sortOrder: number }[],
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(
      items.map((item) =>
        prisma.exerciseCategory.updateMany({
          where: { id: item.id, tenantId }, // CLAUDE.md 絶対ルール
          data:  { sortOrder: item.sortOrder },
        })
      )
    );
  } catch {
    return { success: false, error: "並び替え処理中にエラーが発生しました。" };
  }
  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

// ============================================================
// 共通パーサー
// ============================================================

export type ExerciseFormState = {
  errors?: {
    name?:        string;
    category?:    string;
    unit?:        string;
    duration?:    string;
    intervalMin?: string;
    price?:       string;
    general?:     string;
  };
  success?: boolean;
} | null;

type ParsedExercise = {
  name:        string;
  categoryId:  string | null;
  category:    string | null; // 後方互換スナップショット
  unit:        string | null;
  duration:    number;
  intervalMin: number;
  price:       number;
};

function parseExerciseForm(
  formData: FormData,
): { data: ParsedExercise } | { errors: NonNullable<ExerciseFormState>["errors"] } {
  const name        = (formData.get("name")        as string | null)?.trim() ?? "";
  const categoryId  = (formData.get("categoryId")  as string | null)?.trim() || null;
  const category    = (formData.get("category")    as string | null)?.trim() || null;
  const unit        = (formData.get("unit")        as string | null)?.trim() || null;
  const durationStr = (formData.get("duration")    as string | null)?.trim() ?? "";
  const intervalStr = (formData.get("intervalMin") as string | null)?.trim() ?? "";
  const priceStr    = (formData.get("price")       as string | null)?.trim() ?? "";

  const errors: NonNullable<ExerciseFormState>["errors"] = {};

  if (!name)                  errors.name = "種目名は必須です。";
  else if (name.length > 255) errors.name = "種目名は255文字以内で入力してください。";

  const duration = durationStr === "" ? 0 : parseInt(durationStr, 10);
  if (isNaN(duration) || duration < 0)
    errors.duration = "所要時間は0以上の整数で入力してください。";
  else if (duration > 480)
    errors.duration = "所要時間は480分以内で入力してください。";

  const intervalMin = intervalStr === "" ? 0 : parseInt(intervalStr, 10);
  if (isNaN(intervalMin) || intervalMin < 0)
    errors.intervalMin = "インターバルは0以上の整数で入力してください。";
  else if (intervalMin > 120)
    errors.intervalMin = "インターバルは120分以内で入力してください。";

  const price = priceStr === "" ? 0 : parseInt(priceStr, 10);
  if (isNaN(price) || price < 0)
    errors.price = "料金は0以上の整数で入力してください。";

  if (Object.keys(errors).length > 0) return { errors };

  return { data: { name, categoryId, category, unit, duration, intervalMin, price } };
}
