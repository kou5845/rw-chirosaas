"use server";

/**
 * カルテ登録 / 更新 / 削除 Server Actions
 *
 * CLAUDE.md 規約:
 *   - 患者取得時に tenantId フィルタを必ず含める（クロステナントアクセス防止）
 *   - 全 Prisma 操作に tenantId を含める（絶対ルール）
 *   - メディアファイルパスは Route Handler からの storagePath をそのまま保存する
 *   - Supabase Storage 操作は createSupabaseAdmin() でサーバーサイドのみ実行
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdmin, KARTE_MEDIA_BUCKET } from "@/lib/supabase";
import type { ConditionStatus, KarteMode, KarteType, MediaType } from "@prisma/client";

type ExerciseRowInput = {
  exerciseId:  string;
  sets:        number | null;
  reps:        number | null;
  weightKg:    number | null;
  durationSec: number | null;
  memo:        string;
};

type MediaInput = {
  storagePath: string;
  mediaType:   "image" | "video";
  fileSizeKb:  number;
};

type ActionState = { error: string } | null;

// ── カルテ作成 ──────────────────────────────────────────────────────

export async function createKarte(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // ── フォームデータ取得 ────────────────────────────────────────
  const tenantId          = formData.get("tenantId")          as string;
  const patientId         = formData.get("patientId")         as string;
  const tenantSlug        = formData.get("tenantSlug")        as string;
  const karteModeSnapshot = formData.get("karteModeSnapshot") as KarteMode;
  const karteTypeRaw      = (formData.get("karteType") as string | null) ?? "MEDICAL";
  const karteType         = (karteTypeRaw === "TRAINING" ? "TRAINING" : "MEDICAL") as KarteType;

  const conditionNote      = (formData.get("conditionNote") as string | null)?.trim() || null;
  const progressNote       = (formData.get("progressNote")  as string | null)?.trim() || null;
  const conditionStatusRaw = formData.get("conditionStatus") as string;
  const conditionStatus    = (conditionStatusRaw || null) as ConditionStatus | null;
  const bodyParts          = formData.getAll("bodyParts")   as string[];
  const treatments         = formData.getAll("treatments")  as string[];

  const exerciseJson = formData.get("exerciseRecordsJson") as string | null;
  const mediaJson    = formData.get("mediaJson")            as string | null;

  const bodyCompValuesJson = formData.get("bodyCompValuesJson") as string | null;
  const bodyCompValues = bodyCompValuesJson ? JSON.parse(bodyCompValuesJson) : null;

  const bcWeight      = bodyCompValues?.weight      ?? null;
  const bcBodyFat     = bodyCompValues?.bodyFat     ?? null;
  const bcBmi         = bodyCompValues?.bmi         ?? null;
  const bcMuscleMass  = bodyCompValues?.muscleMass  ?? null;
  const bcBmr         = bodyCompValues?.bmr         ?? null;
  const bcVisceralFat = bodyCompValues?.visceralFat ?? null;

  // ── バリデーション ─────────────────────────────────────────────
  if (karteType === "MEDICAL" && !conditionNote && !progressNote) {
    return { error: "症状・主訴、または経過・所見のいずれかを入力してください。" };
  }
  if (karteType === "TRAINING") {
    const rows: ExerciseRowInput[] = exerciseJson ? JSON.parse(exerciseJson) : [];
    const hasExercise = rows.filter((r) => r.exerciseId).length > 0;
    const hasBodyComp = [bcWeight, bcBodyFat, bcBmi, bcMuscleMass, bcBmr, bcVisceralFat].some((v) => v !== null);
    if (!hasExercise && !hasBodyComp && !progressNote) {
      return { error: "体組成データを1項目以上入力するか、メモを入力してください。" };
    }
  }

  // ── セキュリティ: 患者の所属テナントを必ず検証 ─────────────────
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId }, // CLAUDE.md 絶対ルール
  });
  if (!patient) {
    return { error: "患者が見つかりません。" };
  }

  // ── フィーチャートグル 2層バリデーション（CLAUDE.md 規約）──────
  if (karteType === "TRAINING") {
    const trainingFeature = await prisma.tenantSetting.findUnique({
      where: { tenantId_featureKey: { tenantId, featureKey: "training_record" } },
      select: { featureValue: true },
    });
    if (trainingFeature?.featureValue !== "true") {
      return { error: "トレーニング記録機能が有効になっていません。" };
    }
  }

  try {
    // ── トランザクションで一括保存 ────────────────────────────────
    await prisma.$transaction(async (tx) => {
      // 1. カルテ作成
      const karte = await tx.karte.create({
        data: {
          tenantId,          // CLAUDE.md 絶対ルール
          patientId,
          karteModeSnapshot,
          karteType,
          conditionNote,
          progressNote,
          conditionStatus,
          bodyParts,
          treatments,
          weight:      bcWeight,
          bodyFat:     bcBodyFat,
          bmi:         bcBmi,
          muscleMass:  bcMuscleMass,
          bmr:         bcBmr,
          visceralFat: bcVisceralFat,
          bodyCompValues,
        },
      });

      // 2. トレーニング記録
      if (exerciseJson) {
        const rows: ExerciseRowInput[] = JSON.parse(exerciseJson);
        const validRows = rows.filter((r) => r.exerciseId.length > 0);
        if (validRows.length > 0) {
          await tx.exerciseRecord.createMany({
            data: validRows.map((r) => ({
              tenantId,          // CLAUDE.md 絶対ルール
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

      // 3. メディアファイル記録
      if (mediaJson) {
        const mediaItems: MediaInput[] = JSON.parse(mediaJson);
        const validMedia = mediaItems.filter((m) => m.storagePath.length > 0);
        if (validMedia.length > 0) {
          await tx.karteMedia.createMany({
            data: validMedia.map((m) => ({
              tenantId,          // CLAUDE.md 絶対ルール
              karteId:     karte.id,
              storagePath: m.storagePath,
              mediaType:   m.mediaType as MediaType,
              fileSizeKb:  m.fileSizeKb,
            })),
          });
        }
      }
    });
  } catch (e) {
    console.error("[createKarte] DB error:", e);
    return { error: "保存中にエラーが発生しました。もう一度お試しください。" };
  }

  // ── キャッシュ無効化 + リダイレクト ───────────────────────────
  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  redirect(`/${tenantSlug}/patients/${patientId}`);
}

// ── カルテ更新 ──────────────────────────────────────────────────────

export type UpdateKarteState = { error?: string; success?: boolean } | null;

export async function updateKarte(
  _prevState: UpdateKarteState,
  formData: FormData
): Promise<UpdateKarteState> {
  const karteId        = formData.get("karteId")        as string;
  const tenantId       = formData.get("tenantId")       as string;
  const patientId      = formData.get("patientId")      as string;
  const tenantSlug     = formData.get("tenantSlug")     as string;
  const karteTypeRaw   = (formData.get("karteType") as string | null) ?? "MEDICAL";
  const karteType      = (karteTypeRaw === "TRAINING" ? "TRAINING" : "MEDICAL") as KarteType;

  const conditionNote      = (formData.get("conditionNote") as string | null)?.trim() || null;
  const progressNote       = (formData.get("progressNote")  as string | null)?.trim() || null;
  const conditionStatusRaw = formData.get("conditionStatus") as string;
  const conditionStatus    = (conditionStatusRaw || null) as ConditionStatus | null;
  const bodyParts          = formData.getAll("bodyParts")   as string[];
  const treatments         = formData.getAll("treatments")  as string[];

  const exerciseJson     = formData.get("exerciseRecordsJson") as string | null;
  const newMediaJson     = formData.get("mediaJson")           as string | null;
  const deleteMediaJson  = formData.get("deleteMediaIdsJson")  as string | null;

  const bodyCompValuesJson = formData.get("bodyCompValuesJson") as string | null;
  const bodyCompValues = bodyCompValuesJson ? JSON.parse(bodyCompValuesJson) : null;

  const bcWeightU      = bodyCompValues?.weight      ?? null;
  const bcBodyFatU     = bodyCompValues?.bodyFat     ?? null;
  const bcBmiU         = bodyCompValues?.bmi         ?? null;
  const bcMuscleMassU  = bodyCompValues?.muscleMass  ?? null;
  const bcBmrU         = bodyCompValues?.bmr         ?? null;
  const bcVisceralFatU = bodyCompValues?.visceralFat ?? null;

  const karteDateTimeRaw = formData.get("karteDateTime") as string | null;
  let createdAtUpdate: Date | undefined;
  if (karteDateTimeRaw) {
    const d = new Date(karteDateTimeRaw);
    if (!isNaN(d.getTime())) {
      createdAtUpdate = d;
    }
  }

  // ── バリデーション ─────────────────────────────────────────────
  if (!karteId) return { error: "カルテIDが不正です。" };

  if (karteType === "MEDICAL" && !conditionNote && !progressNote) {
    return { error: "症状・主訴、または経過・所見のいずれかを入力してください。" };
  }
  if (karteType === "TRAINING") {
    const rows: ExerciseRowInput[] = exerciseJson ? JSON.parse(exerciseJson) : [];
    const hasExercise = rows.filter((r) => r.exerciseId).length > 0;
    const hasBodyComp = [bcWeightU, bcBodyFatU, bcBmiU, bcMuscleMassU, bcBmrU, bcVisceralFatU].some((v) => v !== null);
    if (!hasExercise && !hasBodyComp && !progressNote) {
      return { error: "体組成データを1項目以上入力するか、メモを入力してください。" };
    }
  }

  // ── CLAUDE.md 絶対ルール: tenantId + karteId で照合 ────────────
  const existing = await prisma.karte.findFirst({
    where: { id: karteId, tenantId },
    select: { id: true },
  });
  if (!existing) return { error: "カルテが見つかりません。" };

  // ── フィーチャートグル 2層バリデーション ────────────────────────
  if (karteType === "TRAINING") {
    const trainingFeature = await prisma.tenantSetting.findUnique({
      where: { tenantId_featureKey: { tenantId, featureKey: "training_record" } },
      select: { featureValue: true },
    });
    if (trainingFeature?.featureValue !== "true") {
      return { error: "トレーニング記録機能が有効になっていません。" };
    }
  }

  // ── 削除対象メディアの storagePath を事前取得（Storage削除用）──
  const deleteMediaIds: string[] = deleteMediaJson ? JSON.parse(deleteMediaJson) : [];
  let deleteStoragePaths: string[] = [];

  if (deleteMediaIds.length > 0) {
    const toDelete = await prisma.karteMedia.findMany({
      where: {
        id:       { in: deleteMediaIds },
        karteId,
        tenantId, // CLAUDE.md 絶対ルール
      },
      select: { storagePath: true },
    });
    deleteStoragePaths = toDelete.map((m) => m.storagePath);
  }

  try {
    // ── トランザクション内: DB 更新 ──────────────────────────────
    await prisma.$transaction(async (tx) => {
      // 1. カルテ本体を更新
      await tx.karte.update({
        where: { id: karteId },
        data: {
          conditionNote,
          progressNote,
          conditionStatus,
          bodyParts,
          treatments,
          weight:      bcWeightU,
          bodyFat:     bcBodyFatU,
          bmi:         bcBmiU,
          muscleMass:  bcMuscleMassU,
          bmr:         bcBmrU,
          visceralFat: bcVisceralFatU,
          bodyCompValues,
          createdAt:   createdAtUpdate,
        },
      });

      // 2. トレーニング記録を全削除 → 再登録
      await tx.exerciseRecord.deleteMany({ where: { karteId, tenantId } });
      if (exerciseJson) {
        const rows: ExerciseRowInput[] = JSON.parse(exerciseJson);
        const validRows = rows.filter((r) => r.exerciseId.length > 0);
        if (validRows.length > 0) {
          await tx.exerciseRecord.createMany({
            data: validRows.map((r) => ({
              tenantId,   // CLAUDE.md 絶対ルール
              karteId,
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

      // 3. 削除マーク済みメディアを DB から削除
      if (deleteMediaIds.length > 0) {
        await tx.karteMedia.deleteMany({
          where: {
            id:       { in: deleteMediaIds },
            karteId,
            tenantId, // CLAUDE.md 絶対ルール
          },
        });
      }

      // 4. 新規メディアを DB に追加
      if (newMediaJson) {
        const mediaItems: MediaInput[] = JSON.parse(newMediaJson);
        const validMedia = mediaItems.filter((m) => m.storagePath.length > 0);
        if (validMedia.length > 0) {
          await tx.karteMedia.createMany({
            data: validMedia.map((m) => ({
              tenantId,   // CLAUDE.md 絶対ルール
              karteId,
              storagePath: m.storagePath,
              mediaType:   m.mediaType as MediaType,
              fileSizeKb:  m.fileSizeKb,
            })),
          });
        }
      }
    });

    // ── トランザクション外: Supabase Storage から物理削除 ──────────
    // CLAUDE.md 規約: service role key はサーバーサイドのみ使用
    if (deleteStoragePaths.length > 0) {
      const supabase = createSupabaseAdmin();
      const { error: storageError } = await supabase.storage
        .from(KARTE_MEDIA_BUCKET)
        .remove(deleteStoragePaths);
      if (storageError) {
        // Storage削除失敗はログのみ（DBは既にコミット済みのため続行）
        console.error("[updateKarte] Storage remove error:", storageError);
      }
    }
  } catch (e) {
    console.error("[updateKarte] DB error:", e);
    return { error: "更新中にエラーが発生しました。もう一度お試しください。" };
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  return { success: true };
}

// ── カルテ削除 ──────────────────────────────────────────────────────

export type DeleteKarteResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteKarte(
  karteId:   string,
  tenantId:  string,
  patientId: string,
  tenantSlug: string,
): Promise<DeleteKarteResult> {
  // ── CLAUDE.md 絶対ルール: tenantId でクロステナント防止 ──────────
  const existing = await prisma.karte.findFirst({
    where: { id: karteId, tenantId },
    select: { id: true },
  });
  if (!existing) {
    return { success: false, error: "カルテが見つかりません。" };
  }

  // ── Storage 削除用に storagePath を事前取得 ──────────────────────
  const mediaList = await prisma.karteMedia.findMany({
    where:  { karteId, tenantId }, // CLAUDE.md 絶対ルール
    select: { storagePath: true },
  });
  const storagePaths = mediaList.map((m) => m.storagePath);

  try {
    await prisma.$transaction(async (tx) => {
      // 1. トレーニング記録を削除
      await tx.exerciseRecord.deleteMany({ where: { karteId, tenantId } });
      // 2. メディアレコードを削除
      await tx.karteMedia.deleteMany({ where: { karteId, tenantId } });
      // 3. カルテ本体を削除
      await tx.karte.delete({ where: { id: karteId } });
    });

    // ── トランザクション外: Storage 物理削除 ─────────────────────
    if (storagePaths.length > 0) {
      const supabase = createSupabaseAdmin();
      const { error: storageError } = await supabase.storage
        .from(KARTE_MEDIA_BUCKET)
        .remove(storagePaths);
      if (storageError) {
        console.error("[deleteKarte] Storage remove error:", storageError);
      }
    }
  } catch (e) {
    console.error("[deleteKarte] DB error:", e);
    return { success: false, error: "削除処理中にエラーが発生しました。" };
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  return { success: true };
}

