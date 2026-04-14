/**
 * トレーニング種目マスタ管理ページ（Server Component）
 *
 * training_record フィーチャートグルが有効なテナント（A院）のみアクセス可能。
 * CLAUDE.md 規約: 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TrainingsClient, type ExerciseRow } from "./TrainingsClient";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function TrainingsPage({ params }: Props) {
  const { tenantId: slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true },
  });
  if (!tenant) notFound();

  // フィーチャートグル確認（training_record=true のテナントのみ）
  const trainingFeature = await prisma.tenantSetting.findUnique({
    where: {
      tenantId_featureKey: { tenantId: tenant.id, featureKey: "training_record" },
    },
    select: { featureValue: true },
  });
  if (trainingFeature?.featureValue !== "true") notFound();

  const exercises = await prisma.exercise.findMany({
    where:   { tenantId: tenant.id }, // CLAUDE.md 絶対ルール
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
    select: {
      id:       true,
      name:     true,
      category: true,
      unit:     true,
      isActive: true,
    },
  });

  const rows: ExerciseRow[] = exercises;

  return (
    <div className="mx-auto max-w-4xl">
      <TrainingsClient
        exercises={rows}
        tenantId={tenant.id}
        tenantSlug={slug}
      />
    </div>
  );
}
