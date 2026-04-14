"use server";

/**
 * カルテ登録 Server Action
 *
 * CLAUDE.md 規約:
 *   - 患者取得時に tenantId フィルタを必ず含める（クロステナントアクセス防止）
 *   - 全 Prisma 操作に tenantId を含める（絶対ルール）
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ConditionStatus, KarteMode } from "@prisma/client";

type ExerciseRowInput = {
  exerciseId: string;
  sets:        number | null;
  reps:        number | null;
  weightKg:    number | null;
  durationSec: number | null;
  memo:        string;
};

type ActionState = { error: string } | null;

export async function createKarte(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // ── フォームデータ取得 ────────────────────────────────────────
  const tenantId          = formData.get("tenantId")          as string;
  const patientId         = formData.get("patientId")         as string;
  const tenantSlug        = formData.get("tenantSlug")        as string;
  const karteModeSnapshot = formData.get("karteModeSnapshot") as KarteMode;
  const conditionNote     = (formData.get("conditionNote") as string | null)?.trim() || null;
  const progressNote      = (formData.get("progressNote")  as string | null)?.trim() || null;
  const conditionStatusRaw = formData.get("conditionStatus") as string;
  const conditionStatus   = (conditionStatusRaw || null) as ConditionStatus | null;
  const bodyParts         = formData.getAll("bodyParts")   as string[];
  const treatments        = formData.getAll("treatments")  as string[];
  const exerciseJson      = formData.get("exerciseRecordsJson") as string | null;

  // ── 基本バリデーション ─────────────────────────────────────────
  if (!conditionNote && !progressNote) {
    return { error: "症状・主訴、または経過・所見のいずれかを入力してください。" };
  }

  // ── セキュリティ: 患者の所属テナントを必ず検証 ─────────────────
  // CLAUDE.md 絶対ルール: patientId と tenantId の組み合わせで検索する
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
  });
  if (!patient) {
    return { error: "患者が見つかりません。" };
  }

  try {
    // ── カルテ作成 ────────────────────────────────────────────────
    const karte = await prisma.karte.create({
      data: {
        tenantId,           // CLAUDE.md 絶対ルール
        patientId,
        karteModeSnapshot,
        conditionNote,
        progressNote,
        conditionStatus,
        bodyParts,
        treatments,
      },
    });

    // ── トレーニング記録作成（A院のみ）──────────────────────────
    if (exerciseJson) {
      const rows: ExerciseRowInput[] = JSON.parse(exerciseJson);
      const validRows = rows.filter((r) => r.exerciseId.length > 0);

      if (validRows.length > 0) {
        await prisma.exerciseRecord.createMany({
          data: validRows.map((r) => ({
            tenantId,           // CLAUDE.md 絶対ルール
            karteId:     karte.id,
            exerciseId:  r.exerciseId,
            sets:        r.sets,
            reps:        r.reps,
            weightKg:    r.weightKg,
            durationSec: r.durationSec,
            memo:        r.memo || null,
          })),
        });
      }
    }
  } catch (e) {
    console.error("[createKarte] DB error:", e);
    return { error: "保存中にエラーが発生しました。もう一度お試しください。" };
  }

  // ── 患者詳細ページのキャッシュを無効化してリダイレクト ──────
  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  redirect(`/${tenantSlug}/patients/${patientId}`);
}
