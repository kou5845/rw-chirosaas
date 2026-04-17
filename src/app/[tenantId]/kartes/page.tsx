/**
 * カルテ一覧ページ
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - フィーチャートグル: karte_mode が professional の場合のみ部位・施術内容を表示する
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FileText,
  MapPin,
  CheckSquare,
  ChevronRight,
  Sparkles,
  CalendarDays,
  User,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTimeJa, getInitial } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConditionStatus } from "@prisma/client";

type Props = {
  params: Promise<{ tenantId: string }>;
};

// ── 状態評価バッジ ────────────────────────────────────────────────
const CONDITION_CONFIG: Record<
  ConditionStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  good:   { label: "良好",     bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  fair:   { label: "普通",     bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200" },
  pain:   { label: "痛い",     bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
  severe: { label: "強い痛み", bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200" },
};

export default async function KartesPage({ params }: Props) {
  const { tenantId: slug } = await params;

  // ── テナント解決 ──────────────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  // ── フィーチャートグル取得 ─────────────────────────────────────
  const karteFeature = await prisma.tenantSetting.findUnique({
    where: {
      tenantId_featureKey: { tenantId: tenant.id, featureKey: "karte_mode" },
    },
    select: { featureValue: true },
  });
  const isProfessional = karteFeature?.featureValue === "professional";

  // ── カルテ一覧取得（CLAUDE.md 絶対ルール: tenantId フィルタ必須）──
  const kartes = await prisma.karte.findMany({
    where: {
      tenantId: tenant.id, // 他テナントのデータを完全排除
    },
    select: {
      id:                 true,
      createdAt:          true,
      karteModeSnapshot:  true,
      conditionNote:      true,
      progressNote:       true,
      conditionStatus:    true,
      bodyParts:          true,
      treatments:         true,
      patient: {
        select: { id: true, displayName: true },
      },
      staff: {
        select: { name: true },
      },
      _count: {
        select: { exerciseRecords: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalCount = kartes.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── ページヘッダー ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">カルテ管理</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            全{" "}
            <span className="font-semibold text-gray-700">{totalCount}</span>{" "}
            件のカルテ記録
            {isProfessional && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-dark)]">
                <Sparkles size={10} />
                Professional
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── カルテリスト ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* テーブルヘッダー */}
        <div
          className={cn(
            "grid items-center gap-4 border-b border-gray-100 bg-gray-50/60 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400",
            isProfessional
              ? "grid-cols-[1.8fr_1.4fr_1.6fr_1.4fr_auto]"
              : "grid-cols-[1.8fr_1.8fr_2fr_auto]"
          )}
        >
          <span className="flex items-center gap-1.5">
            <CalendarDays size={11} />
            日付
          </span>
          <span className="flex items-center gap-1.5">
            <User size={11} />
            患者名
          </span>
          {isProfessional && (
            <span className="flex items-center gap-1.5">
              <MapPin size={11} />
              施術部位
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <CheckSquare size={11} />
            {isProfessional ? "施術内容" : "症状・所見"}
          </span>
          <span />
        </div>

        {/* ── Empty State ── */}
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <FileText size={32} className="text-gray-200" />
            </div>
            <p className="mt-4 text-sm font-medium text-gray-400">
              まだ記録がありません
            </p>
            <p className="mt-1 text-xs text-gray-300">
              患者の施術後にカルテを入力してください
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {kartes.map((karte, index) => {
              const avatarColors = [
                "bg-[var(--brand-bg)] text-[var(--brand-dark)]",
                "bg-indigo-50 text-indigo-600",
                "bg-amber-50 text-amber-600",
                "bg-emerald-50 text-emerald-600",
              ];

              // 症状/所見の抜粋（30文字）
              const excerpt =
                karte.conditionNote?.slice(0, 30) ??
                karte.progressNote?.slice(0, 30) ??
                null;

              // 施術部位（最大3件 + 残り件数）
              const bodyPartsPreview = karte.bodyParts.slice(0, 3);
              const bodyPartsRest    = karte.bodyParts.length - bodyPartsPreview.length;

              // 施術内容（最大2件 + 残り件数）
              const treatmentsPreview = karte.treatments.slice(0, 2);
              const treatmentsRest    = karte.treatments.length - treatmentsPreview.length;

              return (
                <Link
                  key={karte.id}
                  href={`/${slug}/patients/${karte.patient.id}`}
                  className={cn(
                    "grid items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--brand-hover)]",
                    isProfessional
                      ? "grid-cols-[1.8fr_1.4fr_1.6fr_1.4fr_auto]"
                      : "grid-cols-[1.8fr_1.8fr_2fr_auto]"
                  )}
                >
                  {/* 日付 + モードバッジ */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {formatDateTimeJa(karte.createdAt)}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {karte.karteModeSnapshot === "professional" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-dark)]">
                          <Sparkles size={9} />
                          Pro
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                          Simple
                        </span>
                      )}
                      {/* 状態評価バッジ */}
                      {karte.conditionStatus && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            CONDITION_CONFIG[karte.conditionStatus].bg,
                            CONDITION_CONFIG[karte.conditionStatus].text,
                            CONDITION_CONFIG[karte.conditionStatus].border
                          )}
                        >
                          {CONDITION_CONFIG[karte.conditionStatus].label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 患者名（アバター付き）*/}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        avatarColors[index % 4]
                      )}
                    >
                      {getInitial(karte.patient.displayName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {karte.patient.displayName}
                      </p>
                      {karte.staff && (
                        <p className="truncate text-[11px] text-gray-400">
                          担当: {karte.staff.name}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 施術部位（Professional のみ）*/}
                  {isProfessional && (
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {bodyPartsPreview.length > 0 ? (
                        <>
                          {bodyPartsPreview.map((part) => (
                            <span
                              key={part}
                              className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-dark)]"
                            >
                              {part}
                            </span>
                          ))}
                          {bodyPartsRest > 0 && (
                            <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-400">
                              +{bodyPartsRest}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  )}

                  {/* 施術内容 / 症状抜粋 */}
                  <div className="min-w-0">
                    {isProfessional ? (
                      <div className="flex flex-wrap gap-1">
                        {treatmentsPreview.length > 0 ? (
                          <>
                            {treatmentsPreview.map((t) => (
                              <span
                                key={t}
                                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600"
                              >
                                {t}
                              </span>
                            ))}
                            {treatmentsRest > 0 && (
                              <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-400">
                                +{treatmentsRest}
                              </span>
                            )}
                            {treatmentsPreview.length === 0 && (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    ) : (
                      // Simple モード: 症状/所見テキスト抜粋
                      <p className="truncate text-sm text-gray-600">
                        {excerpt ? (
                          <>
                            {excerpt}
                            {(karte.conditionNote?.length ?? 0) > 30 && "…"}
                          </>
                        ) : (
                          <span className="text-gray-300">記載なし</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* 詳細矢印 */}
                  <ChevronRight size={16} className="text-gray-300" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 件数フッター */}
      {totalCount > 0 && (
        <p className="text-center text-xs text-gray-400">
          全 {totalCount} 件を表示中
        </p>
      )}
    </div>
  );
}
