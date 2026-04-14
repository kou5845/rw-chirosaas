"use client";

/**
 * カルテ履歴セクション — タブ切り替え対応（Client Component）
 *
 * - "MEDICAL"  タブ: 施術カルテ一覧
 * - "TRAINING" タブ: トレーニングカルテ一覧（trainingEnabled=true の場合のみ表示）
 *
 * 表示ロジック（条件付きフィールド等）は Server Component から Props で受け取る。
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText, Dumbbell, Plus, MapPin, CheckSquare, Sparkles, BarChart2,
  Pencil, Trash2, AlertTriangle, AlertCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateTimeJa } from "@/lib/format";
import type { ConditionStatus, KarteMode, KarteType } from "@prisma/client";
import { TrainingAnalysisTab, type ExerciseChartData } from "./TrainingAnalysisTab";
import { KarteEditDialog, type KarteForEdit } from "./KarteEditDialog";
import { deleteKarte } from "./kartes/actions";
import type { ExerciseMaster } from "@/components/karte/TrainingRecordSection";

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export type KarteForDisplay = {
  id:                 string;
  karteType:          KarteType;
  karteModeSnapshot:  KarteMode;
  conditionNote:      string | null;
  progressNote:       string | null;
  conditionStatus:    ConditionStatus | null;
  bodyParts:          string[];
  treatments:         string[];
  createdAt:          Date;
  staff:              { displayName: string } | null;
  exerciseRecords: {
    id:          string;
    exerciseId:  string;
    sets:        number | null;
    reps:        number | null;
    weightKg:    { toString(): string } | null;
    durationSec: number | null;
    memo:        string | null;
    exercise:    { name: string; category: string | null };
  }[];
  media: {
    id:        string;
    mediaType: string;
    signedUrl: string | null;
  }[];
};

type Props = {
  kartes:             KarteForDisplay[];
  isProfessional:     boolean;
  trainingEnabled:    boolean;
  slug:               string;
  patientId:          string;
  patientName:        string;
  tenantId:           string;
  exercises:          ExerciseMaster[];
  exerciseChartData:  ExerciseChartData[];
};

// ─────────────────────────────────────────────────────────────────────────────
// 状態評価バッジ
// ─────────────────────────────────────────────────────────────────────────────

const CONDITION_CONFIG: Record<ConditionStatus, { label: string; cls: string }> = {
  good:   { label: "良好",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  fair:   { label: "普通",     cls: "bg-sky-50 text-sky-700 border-sky-200" },
  pain:   { label: "痛い",     cls: "bg-orange-50 text-orange-700 border-orange-200" },
  severe: { label: "強い痛み", cls: "bg-red-50 text-red-700 border-red-200" },
};

function ConditionBadge({ status }: { status: ConditionStatus }) {
  const c = CONDITION_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", c.cls)}>
      {c.label}
    </span>
  );
}

function KarteModeBadge({ mode }: { mode: KarteMode }) {
  return mode === "professional" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand-dark)]">
      <Sparkles size={10} />Professional
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
      Simple
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function KarteSection({
  kartes, isProfessional, trainingEnabled, slug, patientId, patientName,
  tenantId, exercises, exerciseChartData,
}: Props) {
  const router = useRouter();
  type Tab = "MEDICAL" | "TRAINING" | "ANALYSIS";
  const [activeTab, setActiveTab] = useState<Tab>("MEDICAL");

  // ── 編集・削除ダイアログ制御 ─────────────────────────────────────
  const [editingKarte,   setEditingKarte]   = useState<KarteForDisplay | null>(null);
  const [deletingKarte,  setDeletingKarte]  = useState<KarteForDisplay | null>(null);
  const [deleteError,    setDeleteError]    = useState<string | null>(null);
  const [isPending,      startTransition]   = useTransition();

  function handleDeleteConfirm() {
    if (!deletingKarte) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteKarte(
        deletingKarte.id,
        tenantId,
        patientId,
        slug,
      );
      if (!result.success) {
        setDeleteError(result.error);
        toast.error("削除に失敗しました", { description: result.error });
      } else {
        toast.success("カルテを削除しました", { duration: 3000 });
        setDeletingKarte(null);
        router.refresh();
      }
    });
  }

  // ── Lightbox状態 ───────────────────────────────────────────────
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: string } | null>(null);


  const medicalKartes  = kartes.filter((k) => k.karteType === "MEDICAL");
  const trainingKartes = kartes.filter((k) => k.karteType === "TRAINING");
  const displayKartes  = activeTab === "MEDICAL" ? medicalKartes : trainingKartes;

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "MEDICAL",  label: "施術カルテ",         icon: FileText,  count: medicalKartes.length },
    ...(trainingEnabled
      ? [
          { key: "TRAINING" as Tab, label: "トレーニング", icon: Dumbbell,  count: trainingKartes.length },
          { key: "ANALYSIS" as Tab, label: "分析",         icon: BarChart2 },
        ]
      : []),
  ];

  return (
    <section className="space-y-4">
      {/* ── セクションヘッダー ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--brand-medium)]" />
          <h2 className="text-sm font-semibold text-gray-800">
            カルテ履歴
            <span className="ml-2 font-normal text-gray-400">({kartes.length}件)</span>
          </h2>
        </div>
        <Link
          href={`/${slug}/patients/${patientId}/kartes/new`}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 text-xs font-medium text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-hover)]"
        >
          <Plus size={13} />カルテを追加
        </Link>
      </div>

      {/* ── タブバー（施術 / トレーニング / 分析）── */}
      {trainingEnabled && (
        <nav className="flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
          {tabs.map(({ key, label, icon: Icon, count }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                  active
                    ? "bg-white text-[var(--brand-dark)] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Icon size={13} />
                {label}
                {count != null && count > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-bold",
                    active ? "bg-[var(--brand-bg)] text-[var(--brand-darker)]" : "bg-gray-200 text-gray-500"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* ── コンテンツエリア ── */}
      {activeTab === "ANALYSIS" ? (
        /* ── 分析タブ ── */
        <TrainingAnalysisTab exerciseChartData={exerciseChartData} />
      ) : displayKartes.length === 0 ? (
        <EmptyKarteState tab={activeTab} slug={slug} patientId={patientId} />
      ) : (
        <div className="relative space-y-4">
          {/* タイムライン縦線 */}
          <div className="absolute left-[22px] top-0 h-full w-px bg-gray-100" />

          {displayKartes.map((karte) => (
            <div key={karte.id} className="relative flex gap-4">
              {/* タイムラインドット */}
              <div className={cn(
                "relative z-10 mt-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm",
                karte.karteType === "TRAINING"
                  ? "bg-amber-50"
                  : "bg-[var(--brand-bg)]"
              )}>
                {karte.karteType === "TRAINING"
                  ? <Dumbbell size={16} className="text-amber-600" />
                  : <FileText size={16} className="text-[var(--brand-dark)]" />
                }
              </div>

              {/* カルテカード */}
              <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                {/* カードヘッダー */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">
                      {formatDateTimeJa(karte.createdAt)}
                    </span>
                    <KarteModeBadge mode={karte.karteModeSnapshot} />
                    {karte.karteType === "TRAINING" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                        <Dumbbell size={10} />トレーニング
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {karte.staff && (
                      <span className="mr-2 text-xs text-gray-500">担当: {karte.staff.displayName}</span>
                    )}
                    {/* 編集ボタン */}
                    <button
                      type="button"
                      onClick={() => setEditingKarte(karte)}
                      aria-label="カルテを編集"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]"
                    >
                      <Pencil size={13} />
                    </button>
                    {/* 削除ボタン */}
                    <button
                      type="button"
                      onClick={() => { setDeleteError(null); setDeletingKarte(karte); }}
                      aria-label="カルテを削除"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* カード本文 */}
                <div className="space-y-4 p-5">
                  {/* 状態評価（professional のみ）*/}
                  {karte.conditionStatus && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">状態評価</span>
                      <ConditionBadge status={karte.conditionStatus} />
                    </div>
                  )}

                  {/* 症状・経過メモ */}
                  {(karte.conditionNote || karte.progressNote) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {karte.conditionNote && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">症状・主訴</p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{karte.conditionNote}</p>
                        </div>
                      )}
                      {karte.progressNote && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">経過・所見</p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{karte.progressNote}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Professional モード専用 */}
                  {isProfessional && (
                    <>
                      {karte.bodyParts.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            <MapPin size={11} />施術部位
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {karte.bodyParts.map((part) => (
                              <span key={part}
                                className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2.5 py-1 text-xs font-medium text-[var(--brand-dark)]">
                                {part}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {karte.treatments.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            <CheckSquare size={11} />施術内容
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {karte.treatments.map((t) => (
                              <span key={t}
                                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* トレーニング記録 */}
                  {trainingEnabled && karte.exerciseRecords.length > 0 && (
                    <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-bg)]/40 p-4">
                      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--brand-dark)]">
                        <Dumbbell size={13} />
                        トレーニング記録（{karte.exerciseRecords.length}種目）
                      </p>
                      <div className="space-y-2">
                        {karte.exerciseRecords.map((rec) => (
                          <div key={rec.id}
                            className="flex items-center justify-between gap-4 rounded-lg bg-white px-4 py-2.5 shadow-sm">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{rec.exercise.name}</p>
                              {rec.exercise.category && (
                                <p className="text-[11px] text-gray-400">{rec.exercise.category}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-right text-xs text-gray-600">
                              {rec.sets && rec.reps && (
                                <span className="font-mono">{rec.sets}set × {rec.reps}rep</span>
                              )}
                              {rec.weightKg && Number(rec.weightKg) > 0 && (
                                <span className="font-mono text-[var(--brand-dark)]">
                                  {rec.weightKg.toString()}kg
                                </span>
                              )}
                              {rec.durationSec && (
                                <span className="font-mono">{rec.durationSec}秒</span>
                              )}
                            </div>
                          </div>
                        ))}
                        {karte.exerciseRecords[0]?.memo && (
                          <p className="mt-2 text-xs italic text-[var(--brand-dark)]">
                            💬 {karte.exerciseRecords[0].memo}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* メディアファイル（professional）*/}
                  {isProfessional && (
                    <div className="rounded-xl border border-dashed border-gray-200 p-3">
                      {karte.media.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            添付ファイル（{karte.media.length}件）
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {karte.media.map((m) => {
                              if (!m.signedUrl) {
                                return (
                                  <span key={m.id} className="flex h-16 w-24 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400">
                                    期限切れ
                                  </span>
                                );
                              }
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setLightboxMedia({ url: m.signedUrl!, type: m.mediaType })}
                                  className="group relative h-16 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-900 transition-transform hover:scale-105 active:scale-95"
                                >
                                  {m.mediaType === "video" ? (
                                    <>
                                      <video
                                        src={`${m.signedUrl}#t=0.1`}
                                        className="h-full w-full object-cover opacity-80"
                                        preload="metadata"
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center pb-1">
                                        <div className="flex items-center justify-center rounded-full bg-black/40 p-1 text-white backdrop-blur-sm group-hover:bg-brand">
                                          <span className="text-[10px]">▶</span>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <img
                                      src={m.signedUrl}
                                      alt="Karte Media"
                                      loading="lazy"
                                      className="h-full w-full object-cover"
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-center text-xs text-gray-300">添付ファイルなし</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* ── 編集ダイアログ ── */}
      {editingKarte && (
        <KarteEditDialog
          karte={editingKarte as KarteForEdit}
          tenantId={tenantId}
          tenantSlug={slug}
          patientId={patientId}
          patientName={patientName}
          isProfessional={isProfessional}
          trainingEnabled={trainingEnabled}
          exercises={exercises}
          onClose={() => setEditingKarte(null)}
        />
      )}

      {/* ── 削除確認ダイアログ ── */}
      {deletingKarte && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !isPending) setDeletingKarte(null); }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl">
            <div className="flex items-start gap-4 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-gray-900">このカルテを削除しますか？</p>
                <p className="mt-1 text-sm text-gray-500">
                  {formatDateTimeJa(deletingKarte.createdAt)} のカルテが削除されます。
                  紐づく写真・動画・トレーニング記録もすべて削除されます。
                  <span className="mt-1 block font-semibold text-red-600">この操作は取り消せません。</span>
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeletingKarte(null)}
                disabled={isPending}
                className="flex h-10 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isPending}
                className="flex h-10 items-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending
                  ? <><Loader2 size={14} className="animate-spin" />削除中…</>
                  : <><Trash2 size={14} />削除する</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ライトボックス (画像・動画拡大表示) ── */}
      {lightboxMedia && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-10"
          onClick={() => setLightboxMedia(null)}
        >
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
          <div className="relative z-10 flex max-h-full max-w-full items-center justify-center">
            {lightboxMedia.type === "video" ? (
              <video 
                src={lightboxMedia.url} 
                controls 
                autoPlay
                className="max-h-[85vh] max-w-full rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img 
                src={lightboxMedia.url} 
                alt="Enlarged media" 
                className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button 
              type="button"
              className="absolute -right-4 -top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:-right-12 sm:top-0"
              onClick={() => setLightboxMedia(null)}
            >
              <Trash2 size={0} className="hidden" /> {/* to fix lucide warnings occasionally */}
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EmptyKarteState({
  tab, slug, patientId,
}: {
  tab:       "MEDICAL" | "TRAINING" | "ANALYSIS";
  slug:      string;
  patientId: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 text-center">
      {tab === "TRAINING"
        ? <Dumbbell size={36} className="text-gray-200" />
        : <FileText  size={36} className="text-gray-200" />
      }
      <p className="mt-3 text-sm font-medium text-gray-400">
        {tab === "TRAINING"
          ? "トレーニングカルテが登録されていません"
          : "カルテが登録されていません"
        }
      </p>
      <p className="mt-1 text-xs text-gray-300">
        {tab === "TRAINING"
          ? "施術完了後にトレーニングカルテを入力してください"
          : "施術完了後にカルテを入力してください"
        }
      </p>
      <Link
        href={`/${slug}/patients/${patientId}/kartes/new`}
        className="mt-4 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 text-xs font-medium text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-hover)]"
      >
        <Plus size={13} />カルテを追加
      </Link>
    </div>
  );
}
