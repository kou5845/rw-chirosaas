"use server";

/**
 * トレーニング体組成指標設定の保存 Server Action
 *
 * CLAUDE.md 規約:
 *   - tenantId はセッション由来の値のみ使用（フォームから受け取らない）
 *   - Prisma 操作には必ず tenantId フィルタを含める
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { type MetricConfigItem, parseMetricsConfig } from "@/lib/training-metrics";

type ActionState = { error?: string; success?: boolean } | null;

export async function updateTrainingMetrics(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const tenantId   = formData.get("tenantId")   as string;
  const configJson = formData.get("configJson") as string;

  if (!tenantSlug || !tenantId) {
    return { error: "テナント情報が不正です。" };
  }

  // CLAUDE.md 絶対ルール: tenantId で所有者を確認してから更新
  const existing = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { id: true },
  });
  if (!existing) return { error: "テナントが見つかりません。" };

  let config: MetricConfigItem[] = [];
  try {
    const raw = JSON.parse(configJson);
    config = parseMetricsConfig(raw);
  } catch (e) {
    return { error: "設定の保存に失敗しました。不正なデータ形式です。" };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },        // CLAUDE.md 絶対ルール
      data:  { trainingMetricsConfig: config },
    });
  } catch (e) {
    console.error("[updateTrainingMetrics]", e);
    return { error: "設定の保存に失敗しました。もう一度お試しください。" };
  }

  revalidatePath(`/${tenantSlug}/settings`);
  return { success: true };
}
