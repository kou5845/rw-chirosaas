"use client";

/**
 * カルテ編集ダイアログ
 *
 * - 開いた際に /api/karte-media/signed-urls を fetch して既存メディアを取得
 * - KarteNewForm を mode="edit" で表示
 * - PatientActions の EditDialog と同じモーダルパターンを踏襲
 * - 保存完了後は onSaved() → router.refresh() で RSC を再実行
 *
 * CLAUDE.md 規約:
 *   - tenantId は Server Component（page.tsx）から Props 経由で受け取る
 *   - 直接 DB クエリは行わず API 経由でメディア取得
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, FileText, Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { KarteNewForm, type ExistingMediaItem, type KarteInitialValues } from "@/components/karte/KarteNewForm";
import type { ExerciseMaster, ExerciseRow } from "@/components/karte/TrainingRecordSection";
import type { ConditionStatus, KarteMode, KarteType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export type KarteForEdit = {
  id:                string;
  karteType:         KarteType;
  karteModeSnapshot: KarteMode;
  conditionNote:     string | null;
  progressNote:      string | null;
  conditionStatus:   ConditionStatus | null;
  bodyParts:         string[];
  treatments:        string[];
  exerciseRecords: {
    exerciseId:  string;
    sets:        number | null;
    reps:        number | null;
    weightKg:    { toString(): string } | null;
    durationSec: number | null;
    memo:        string | null;
  }[];
};

type Props = {
  karte:          KarteForEdit;
  tenantId:       string;
  tenantSlug:     string;
  patientId:      string;
  patientName:    string;
  isProfessional: boolean;
  trainingEnabled: boolean;
  exercises:      ExerciseMaster[];
  onClose:        () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function KarteEditDialog({
  karte,
  tenantId,
  tenantSlug,
  patientId,
  patientName,
  isProfessional,
  trainingEnabled,
  exercises,
  onClose,
}: Props) {
  const router = useRouter();
  const [existingMedia, setExistingMedia] = useState<ExistingMediaItem[]>([]);
  const [mediaLoading,  setMediaLoading]  = useState(false);

  // ── 既存メディアを署名付きURLで取得 ────────────────────────────
  useEffect(() => {
    if (!isProfessional) return; // Professional モードのみメディアあり

    setMediaLoading(true);
    fetch(
      `/api/karte-media/signed-urls?karteId=${encodeURIComponent(karte.id)}&tenantId=${encodeURIComponent(tenantId)}`
    )
      .then((res) => res.json())
      .then((data: { media?: ExistingMediaItem[] }) => {
        setExistingMedia(data.media ?? []);
      })
      .catch((err) => {
        console.error("[KarteEditDialog] メディア取得エラー:", err);
      })
      .finally(() => setMediaLoading(false));
  }, [karte.id, tenantId, isProfessional]);

  // ── ESC キーで閉じる ────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── 保存完了コールバック ─────────────────────────────────────────
  const handleSuccess = useCallback(() => {
    toast.success("カルテを更新しました", { duration: 3000 });
    onClose();
    router.refresh();
  }, [onClose, router]);

  // ── initialValues を KarteNewForm 用に変換 ───────────────────────
  const initialValues: KarteInitialValues = {
    karteType:       karte.karteType,
    conditionNote:   karte.conditionNote,
    progressNote:    karte.progressNote,
    conditionStatus: karte.conditionStatus ?? "",
    bodyParts:       karte.bodyParts,
    treatments:      karte.treatments,
    exerciseRows:    karte.exerciseRecords.map((rec): ExerciseRow => ({
      rowId:       crypto.randomUUID(),
      exerciseId:  rec.exerciseId,
      sets:        rec.sets        != null ? String(rec.sets)        : "",
      reps:        rec.reps        != null ? String(rec.reps)        : "",
      weightKg:    rec.weightKg    != null ? rec.weightKg.toString() : "",
      durationSec: rec.durationSec != null ? String(rec.durationSec): "",
      memo:        rec.memo ?? "",
    })),
  };

  const isTraining = karte.karteType === "TRAINING";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* ダイアログ本体 */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col max-h-[92dvh] overflow-hidden rounded-2xl border border-gray-100 bg-[var(--background)] shadow-2xl">

        {/* ── ヘッダー（固定）── */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-white",
              isTraining ? "bg-amber-400" : "bg-[var(--brand)]"
            )}>
              {isTraining
                ? <Dumbbell size={15} />
                : <FileText size={15} />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">
                カルテを編集
              </p>
              <p className="text-xs text-[var(--brand-dark)]/70">
                {isTraining ? "トレーニングカルテ" : "施術カルテ"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── コンテンツ（スクロール可能）── */}
        <div className="overflow-y-auto p-6">
          {/* メディアロード中スケルトン */}
          {isProfessional && mediaLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-[var(--brand-medium)]" />
              <span className="ml-3 text-sm text-gray-400">メディアを読み込み中...</span>
            </div>
          ) : (
            <KarteNewForm
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              patientId={patientId}
              patientName={patientName}
              karteModeSnapshot={karte.karteModeSnapshot}
              isProfessional={isProfessional}
              trainingEnabled={trainingEnabled}
              exercises={exercises}
              previousRecords={[]}
              mode="edit"
              karteId={karte.id}
              initialValues={initialValues}
              existingMedia={existingMedia}
              onSuccess={handleSuccess}
            />
          )}
        </div>
      </div>
    </div>
  );
}
