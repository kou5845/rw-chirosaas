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

type Props = {
  params: Promise<{ tenantId: string; patientId: string }>;
};

export default async function KarteNewPage({ params }: Props) {
  const { tenantId: slug, patientId } = await params;

  // ── テナントをサブドメイン（スラッグ）で解決 ────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { subdomain: slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  // ── セキュリティ: 患者を tenantId + patientId で検索（クロステナント防止）──
  // CLAUDE.md 絶対ルール: patientId と tenantId の組み合わせで必ず検索すること
  const patient = await prisma.patient.findFirst({
    where: {
      id:       patientId,
      tenantId: tenant.id, // ← 他テナントの患者IDを指定しても必ずここで弾く
    },
    select: { id: true, displayName: true },
  });
  if (!patient) notFound();

  // ── フィーチャートグル取得（CLAUDE.md: 直接DBクエリを最小限に抑える）──
  const [karteFeature, trainingFeature] = await Promise.all([
    prisma.tenantSetting.findUnique({
      where: {
        tenantId_featureKey: { tenantId: tenant.id, featureKey: "karte_mode" },
      },
      select: { featureValue: true },
    }),
    prisma.tenantSetting.findUnique({
      where: {
        tenantId_featureKey: { tenantId: tenant.id, featureKey: "training_record" },
      },
      select: { featureValue: true },
    }),
  ]);

  const isProfessional  = karteFeature?.featureValue === "professional";
  const trainingEnabled = trainingFeature?.featureValue === "true";
  const karteModeSnapshot: KarteMode = isProfessional ? "professional" : "simple";

  // ── トレーニング種目マスタ（professional + training_record ON のみ取得）──
  const exercises =
    isProfessional && trainingEnabled
      ? await prisma.exercise.findMany({
          where: {
            tenantId: tenant.id, // CLAUDE.md 絶対ルール
            isActive: true,
          },
          select: { id: true, name: true, category: true },
          orderBy: [{ category: "asc" }, { name: "asc" }],
        })
      : [];

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
            {/* モードバッジ */}
            <div className="ml-auto">
              {isProfessional ? (
                <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  Professional モード
                </span>
              ) : (
                <span className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  Simple モード
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── フォーム本体（KarteNewForm が mode に応じてフィールドを切り替える）── */}
      <KarteNewForm
        tenantId={tenant.id}
        tenantSlug={slug}
        patientId={patient.id}
        patientName={patient.displayName}
        karteModeSnapshot={karteModeSnapshot}
        isProfessional={isProfessional}
        trainingEnabled={trainingEnabled}
        exercises={exercises}
      />
    </div>
  );
}
