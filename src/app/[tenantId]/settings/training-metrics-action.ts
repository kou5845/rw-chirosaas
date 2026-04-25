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
import { auth }   from "@/auth";
import { type MetricConfigItem, parseMetricsConfig } from "@/lib/training-metrics";

type ActionState = { error?: string; success?: boolean } | null;

export async function updateTrainingMetrics(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // CLAUDE.md 絶対ルール: tenantId はセッションから取得（FormData 不使用）
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.tenantSlug) {
    return { error: "認証情報が取得できません。再ログインしてください。" };
  }
  const tenantId   = session.user.tenantId;
  const tenantSlug = session.user.tenantSlug;

  const configJson = formData.get("configJson") as string;

  let config: MetricConfigItem[] = [];
  try {
    const raw = JSON.parse(configJson);
    config = parseMetricsConfig(raw);
  } catch {
    return { error: "設定の保存に失敗しました。不正なデータ形式です。" };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },   // CLAUDE.md 絶対ルール: セッション由来の tenantId
      data:  { trainingMetricsConfig: config },
    });
  } catch (e) {
    console.error("[updateTrainingMetrics]", e);
    return { error: "設定の保存に失敗しました。もう一度お試しください。" };
  }

  revalidatePath(`/${tenantSlug}/settings`);
  return { success: true };
}
