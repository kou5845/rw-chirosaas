"use server";

/**
 * トレーニング種目マスタ CRUD Server Actions
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type ExerciseFormState = {
  errors?: {
    name?:     string;
    category?: string;
    unit?:     string;
    general?:  string;
  };
  success?: boolean;
} | null;

// ── 新規作成 ──────────────────────────────────────────────────────

export async function createExercise(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  if (!tenantId || !tenantSlug) return { errors: { general: "テナント情報が不正です。" } };

  const parsed = parseForm(formData);
  if ("errors" in parsed) return { errors: parsed.errors };

  try {
    await prisma.exercise.create({ data: { tenantId, ...parsed.data } });
  } catch {
    return { errors: { general: "登録処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/trainings`);
  return { success: true };
}

// ── 更新 ─────────────────────────────────────────────────────────

export async function updateExercise(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  const exerciseId = formData.get("exerciseId") as string;
  if (!tenantId || !tenantSlug || !exerciseId) return { errors: { general: "テナント情報が不正です。" } };

  const parsed = parseForm(formData);
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

// ── 論理削除 ──────────────────────────────────────────────────────

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

// ── 復元 ─────────────────────────────────────────────────────────

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

// ── 共通パーサー ─────────────────────────────────────────────────

type ParsedData = { name: string; category: string | null; unit: string | null };

function parseForm(
  formData: FormData,
): { data: ParsedData } | { errors: NonNullable<ExerciseFormState>["errors"] } {
  const name     = (formData.get("name")     as string | null)?.trim() ?? "";
  const category = (formData.get("category") as string | null)?.trim() || null;
  const unit     = (formData.get("unit")     as string | null)?.trim() || null;

  const errors: NonNullable<ExerciseFormState>["errors"] = {};

  if (!name)                  errors.name = "種目名は必須です。";
  else if (name.length > 255) errors.name = "種目名は255文字以内で入力してください。";

  if (Object.keys(errors).length > 0) return { errors };

  return { data: { name, category, unit } };
}
