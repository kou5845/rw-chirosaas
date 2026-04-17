/**
 * 新規カルテ登録ページ
 *
 * CLAUDE.md 規約:
 *   - tenantId はサーバーサイドで subdomain から解決し、セッション由来の値として扱う
 *   - 患者取得時は tenantId & patientId の両方でフィルタリングし、クロステナントアクセスを防止すること
 *   - フィーチャートグルはフロントエンド（表示制御）とバックエンド（actions.ts）の両方で検証すること
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { KarteNewForm } from "@/components/karte/KarteNewForm";
import type { KarteMode } from "@prisma/client";
import type { PreviousRecord } from "@/components/karte/TrainingRecordSection";
import { parseMetricsConfig } from "@/lib/training-metrics";

type Props = {
  params: Promise<{ tenantId: string; patientId: string }>;
};

export default async function KarteNewPage({ params }: Props) {
  const { tenantId: slug, patientId } = await params;

  // ── テナントをサブドメイン（スラッグ）で解決 ────────────────────
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true, trainingMetricsConfig: true },
  });
  if (!tenant) notFound();

  // ── セキュリティ: 患者を tenantId + patientId で検索 ────────────
  const patient = await prisma.patient.findFirst({
    where:  { id: patientId, tenantId: tenant.id },
    select: { id: true, displayName: true, heightCm: true },
  });
  if (!patient) notFound();

  // ── フィーチャートグル取得 ────────────────────────────────────
  const [karteFeature, trainingFeature] = await Promise.all([
    prisma.tenantSetting.findUnique({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: "karte_mode" } },
      select: { featureValue: true },
    }),
    prisma.tenantSetting.findUnique({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: "training_record" } },
      select: { featureValue: true },
    }),
  ]);

  const isProfessional  = karteFeature?.featureValue === "professional";
  const trainingEnabled = trainingFeature?.featureValue === "true";
  const karteModeSnapshot: KarteMode = isProfessional ? "professional" : "simple";

  // ── Service マスタ（施術内容選択に使用・Simple/Professional 共通）──
  const services = await prisma.service.findMany({
    where:   { tenantId: tenant.id, isActive: true }, // CLAUDE.md 絶対ルール
    select:  { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // ── トレーニング種目マスタ（unit フィールド含む）────────────────
  const exercises =
    isProfessional && trainingEnabled
      ? await prisma.exercise.findMany({
          where:   { tenantId: tenant.id, isActive: true }, // CLAUDE.md 絶対ルール
          select:  { id: true, name: true, category: true, unit: true },
          orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { name: "asc" }],
        })
      : [];

  // ── 前回記録: 各種目の直近の ExerciseRecord を患者ごとに取得 ─────
  // 同一患者・同一種目の最新記録を種目ごとに1件ずつ取得する
  let previousRecords: PreviousRecord[] = [];

  if (exercises.length > 0) {
    const exerciseIds = exercises.map((e) => e.id);

    // kartes → exerciseRecords の結合クエリで種目ごと最新を取得
    const kartes = await prisma.karte.findMany({
      where: {
        tenantId:  tenant.id,  // CLAUDE.md 絶対ルール
        patientId: patient.id,
        exerciseRecords: { some: { exerciseId: { in: exerciseIds } } },
      },
      select: {
        createdAt: true,
        exerciseRecords: {
          where:  { exerciseId: { in: exerciseIds } },
          select: {
            exerciseId:  true,
            sets:        true,
            reps:        true,
            weightKg:    true,
            durationSec: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 種目ごとに最初に見つかった（=最新の）記録を採用
    const seen = new Set<string>();
    for (const karte of kartes) {
      for (const rec of karte.exerciseRecords) {
        if (!seen.has(rec.exerciseId)) {
          seen.add(rec.exerciseId);
          previousRecords.push({
            exerciseId:  rec.exerciseId,
            sets:        rec.sets,
            reps:        rec.reps,
            weightKg:    rec.weightKg ? rec.weightKg.toString() : null,
            durationSec: rec.durationSec,
            recordedAt:  karte.createdAt.toISOString(),
          });
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">

      {/* ── パンくずナビ ── */}
      <div className="flex items-center gap-2">
        <Link
          href={`/${slug}/patients/${patientId}`}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
        >
          <ArrowLeft size={15} />
          患者詳細に戻る
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">カルテ新規登録</span>
      </div>

      {/* ── ページタイトルカード ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-white/70">
                {patient.displayName} さんのカルテ
              </p>
              <h1 className="text-lg font-bold text-white">新規カルテ登録</h1>
            </div>
            <div className="ml-auto">
              <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {isProfessional ? "Professional モード" : "Simple モード"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── フォーム本体 ── */}
      <KarteNewForm
        tenantId={tenant.id}
        tenantSlug={slug}
        patientId={patient.id}
        patientName={patient.displayName}
        karteModeSnapshot={karteModeSnapshot}
        isProfessional={isProfessional}
        trainingEnabled={trainingEnabled}
        services={services}
        exercises={exercises}
        previousRecords={previousRecords}
        metricsConfig={parseMetricsConfig(tenant.trainingMetricsConfig)}
        patientHeightCm={patient.heightCm}
      />
    </div>
  );
}
