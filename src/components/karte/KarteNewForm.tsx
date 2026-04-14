"use client";

/**
 * カルテ新規登録 / 編集フォーム（クライアントコンポーネント）
 *
 * mode="create" (default): createKarte アクションを使用
 * mode="edit":             updateKarte アクションを使用
 *   - initialValues で既存データを初期値としてセット
 *   - existingMedia で既存メディアを表示・削除マーク可能
 *   - onSuccess コールバックで閉じる処理を呼び出す
 */

import { useState, useCallback, useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, Save, FileText, Dumbbell, X, ImageIcon, Video } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createKarte, updateKarte } from "@/app/[tenantId]/patients/[patientId]/kartes/actions";
import {
  BODY_PARTS,
  TREATMENTS,
  CONDITION_STATUS_OPTIONS,
} from "@/lib/karte-constants";
import type { KarteMode } from "@prisma/client";
import {
  MediaUploadSection,
  type UploadedMedia,
} from "./MediaUploadSection";
import {
  TrainingRecordSection,
  type ExerciseMaster,
  type PreviousRecord,
  type ExerciseRow,
} from "./TrainingRecordSection";

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export type ExistingMediaItem = {
  id:          string;
  signedUrl:   string;
  mediaType:   "image" | "video";
  fileSizeKb:  number | null;
};

export type KarteInitialValues = {
  karteType:       "MEDICAL" | "TRAINING";
  conditionNote:   string | null;
  progressNote:    string | null;
  conditionStatus: string;
  bodyParts:       string[];
  treatments:      string[];
  exerciseRows:    ExerciseRow[];
};

export type KarteNewFormProps = {
  tenantId:          string;
  tenantSlug:        string;
  patientId:         string;
  patientName:       string;
  karteModeSnapshot: KarteMode;
  isProfessional:    boolean;
  trainingEnabled:   boolean;
  exercises:         ExerciseMaster[];
  previousRecords:   PreviousRecord[];
  // edit mode
  mode?:             "create" | "edit";
  karteId?:          string;
  initialValues?:    KarteInitialValues;
  existingMedia?:    ExistingMediaItem[];
  onSuccess?:        () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Submit ボタン
// ─────────────────────────────────────────────────────────────────────────────

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold shadow-sm transition-all",
        pending
          ? "cursor-not-allowed bg-gray-200 text-gray-400"
          : "bg-[var(--brand)] text-white hover:bg-[var(--brand-medium)] active:scale-95"
      )}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          保存中...
        </>
      ) : (
        <><Save size={16} />{label}</>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// セクションカード
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  title, badge, children,
}: {
  title:    string;
  badge?:   React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {badge}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 既存メディアグリッド（編集時の既存ファイル表示 + 削除マーク）
// ─────────────────────────────────────────────────────────────────────────────

function ExistingMediaGrid({
  media,
  deletedIds,
  onToggleDelete,
}: {
  media:          ExistingMediaItem[];
  deletedIds:     Set<string>;
  onToggleDelete: (id: string) => void;
}) {
  if (media.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        既存のファイル（{media.length}件）
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {media.map((m) => {
          const isDeleted = deletedIds.has(m.id);
          return (
            <div
              key={m.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all",
                isDeleted ? "border-red-200 opacity-50" : "border-gray-100"
              )}
            >
              {/* メディアプレビュー */}
              <div className="relative aspect-video overflow-hidden bg-gray-100">
                {m.mediaType === "video" ? (
                  <video
                    src={m.signedUrl}
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.signedUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {/* 削除マークオーバーレイ */}
                {isDeleted && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-500/30">
                    <X size={24} className="text-red-600" />
                  </div>
                )}
                {/* 削除トグルボタン */}
                <button
                  type="button"
                  onClick={() => onToggleDelete(m.id)}
                  aria-label={isDeleted ? "削除を取り消す" : "削除する"}
                  className={cn(
                    "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white transition-all",
                    isDeleted
                      ? "bg-red-500 opacity-100"
                      : "bg-black/60 opacity-0 hover:bg-red-500 group-hover:opacity-100"
                  )}
                >
                  <X size={13} />
                </button>
              </div>
              {/* ファイル情報 */}
              <div className="flex items-center gap-1.5 px-2.5 py-2">
                {m.mediaType === "video"
                  ? <Video size={11} className="shrink-0 text-gray-400" />
                  : <ImageIcon size={11} className="shrink-0 text-gray-400" />
                }
                <p className="truncate text-xs text-gray-500">
                  {m.mediaType === "video" ? "動画" : "画像"}
                  {m.fileSizeKb && (
                    <span className="ml-1 text-gray-400">
                      {m.fileSizeKb < 1024
                        ? `${m.fileSizeKb}KB`
                        : `${(m.fileSizeKb / 1024).toFixed(1)}MB`}
                    </span>
                  )}
                </p>
                {isDeleted && (
                  <span className="ml-auto shrink-0 rounded text-[10px] font-semibold text-red-500">
                    削除
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {deletedIds.size > 0 && (
        <p className="text-xs text-red-500">
          {deletedIds.size}件のファイルが保存時に削除されます
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function KarteNewForm({
  tenantId,
  tenantSlug,
  patientId,
  patientName,
  karteModeSnapshot,
  isProfessional,
  trainingEnabled,
  exercises,
  previousRecords,
  mode = "create",
  karteId,
  initialValues,
  existingMedia = [],
  onSuccess,
}: KarteNewFormProps) {
  const router = useRouter();

  // mode に応じてアクションを切り替え
  // createKarte は redirect() で終了するため success を返さないが、
  // useActionState に渡す型を統一するため共通型にキャストする
  type UnifiedState = { error?: string; success?: boolean } | null;
  type UnifiedAction = (state: UnifiedState, formData: FormData) => Promise<UnifiedState>;
  const action = (mode === "edit" ? updateKarte : createKarte) as UnifiedAction;
  const [state, formAction] = useActionState(action, null);

  // 編集成功時: onSuccess コールバックを呼ぶ
  useEffect(() => {
    if (mode === "edit" && state && "success" in state && state.success) {
      onSuccess?.();
    }
  }, [mode, state, onSuccess]);

  // ── カルテ種別 ────────────────────────────────────────────────
  type KarteTypeUI = "MEDICAL" | "TRAINING";
  const [karteType, setKarteType] = useState<KarteTypeUI>(
    initialValues?.karteType ?? "MEDICAL"
  );

  // ── Professional モード状態 ────────────────────────────────────
  const [conditionStatus, setConditionStatus] = useState<string>(
    initialValues?.conditionStatus ?? ""
  );
  const [selectedBodyParts, setSelectedBodyParts] = useState<Set<string>>(
    new Set(initialValues?.bodyParts ?? [])
  );
  const [selectedTreatments, setSelectedTreatments] = useState<Set<string>>(
    new Set(initialValues?.treatments ?? [])
  );

  // ── トレーニング記録行 ─────────────────────────────────────────
  const [exerciseRows, setExerciseRows] = useState<ExerciseRow[]>(
    initialValues?.exerciseRows ?? []
  );

  // ── 新規メディア ──────────────────────────────────────────────
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([]);
  const handleMediaChange = useCallback((media: UploadedMedia[]) => {
    setUploadedMedia(media);
  }, []);

  // ── 既存メディアの削除マーク ─────────────────────────────────
  const [deletedMediaIds, setDeletedMediaIds] = useState<Set<string>>(new Set());

  function toggleDeleteMedia(id: string) {
    setDeletedMediaIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleBodyPart(part: string) {
    setSelectedBodyParts((prev) => {
      const next = new Set(prev);
      next.has(part) ? next.delete(part) : next.add(part);
      return next;
    });
  }

  function toggleTreatment(t: string) {
    setSelectedTreatments((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  // ── シリアライズ ───────────────────────────────────────────────
  const exerciseRecordsJson = JSON.stringify(
    exerciseRows.map((r) => ({
      exerciseId:  r.exerciseId,
      sets:        r.sets        ? parseInt(r.sets)        : null,
      reps:        r.reps        ? parseInt(r.reps)        : null,
      weightKg:    r.weightKg    ? parseFloat(r.weightKg)  : null,
      durationSec: r.durationSec ? parseInt(r.durationSec) : null,
      memo:        r.memo,
    }))
  );

  const mediaJson = JSON.stringify(
    uploadedMedia.map((m) => ({
      storagePath: m.storagePath,
      mediaType:   m.mediaType,
      fileSizeKb:  m.fileSizeKb,
    }))
  );

  const deleteMediaIdsJson = JSON.stringify(Array.from(deletedMediaIds));

  const errorMsg = state && "error" in state ? state.error : null;
  const submitLabel = mode === "edit" ? "変更を保存" : "カルテを保存";

  return (
    <form action={formAction} className="space-y-5">
      {/* ── hidden fields ── */}
      <input type="hidden" name="tenantId"            value={tenantId} />
      <input type="hidden" name="patientId"           value={patientId} />
      <input type="hidden" name="tenantSlug"          value={tenantSlug} />
      <input type="hidden" name="karteModeSnapshot"   value={karteModeSnapshot} />
      <input type="hidden" name="karteType"           value={karteType} />
      <input type="hidden" name="conditionStatus"     value={conditionStatus} />
      <input type="hidden" name="exerciseRecordsJson" value={exerciseRecordsJson} />
      <input type="hidden" name="mediaJson"           value={mediaJson} />
      <input type="hidden" name="deleteMediaIdsJson"  value={deleteMediaIdsJson} />
      {mode === "edit" && karteId && (
        <input type="hidden" name="karteId" value={karteId} />
      )}
      {Array.from(selectedBodyParts).map((part) => (
        <input key={part} type="hidden" name="bodyParts" value={part} />
      ))}
      {Array.from(selectedTreatments).map((t) => (
        <input key={t} type="hidden" name="treatments" value={t} />
      ))}

      {/* ── エラーバナー ── */}
      {errorMsg && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* ── カルテ種別タブ（Professional + training_record ON のみ）── */}
      {isProfessional && trainingEnabled && mode === "create" && (
        <div className="flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
          {([
            { key: "MEDICAL"  as KarteTypeUI, label: "施術カルテ",         icon: FileText },
            { key: "TRAINING" as KarteTypeUI, label: "トレーニングカルテ", icon: Dumbbell },
          ] as { key: KarteTypeUI; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setKarteType(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                karteType === key
                  ? "bg-white text-[var(--brand-dark)] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ══ 施術カルテ コンテンツ ══ */}
      {karteType === "MEDICAL" && (
        <>
          {/* 1. 症状・主訴 */}
          <SectionCard title="症状・主訴">
            <Textarea
              name="conditionNote"
              placeholder={`${patientName} さんの本日の症状・訴えを記入してください`}
              rows={4}
              defaultValue={initialValues?.conditionNote ?? ""}
              className="resize-none rounded-xl border-gray-200 text-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            />
          </SectionCard>

          {/* Professional モード専用 */}
          {isProfessional && (
            <>
              {/* 2. 状態評価 */}
              <SectionCard title="状態評価" badge={<ProfBadge />}>
                <div className="flex flex-wrap gap-3">
                  {CONDITION_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setConditionStatus((prev) => prev === opt.value ? "" : opt.value)}
                      className={cn(
                        "flex h-11 min-w-[104px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                        conditionStatus === opt.value ? opt.active : opt.inactive
                      )}
                    >
                      <span className="text-base leading-none">{opt.emoji}</span>
                      {opt.label}
                    </button>
                  ))}
                  {conditionStatus && (
                    <button type="button" onClick={() => setConditionStatus("")}
                      className="self-center text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline">
                      選択解除
                    </button>
                  )}
                </div>
              </SectionCard>

              {/* 3. 施術部位 */}
              <SectionCard
                title={selectedBodyParts.size > 0
                  ? `施術部位（${selectedBodyParts.size}箇所選択中）`
                  : "施術部位"}
              >
                <div className="flex flex-wrap gap-2">
                  {BODY_PARTS.map((part) => {
                    const active = selectedBodyParts.has(part);
                    return (
                      <button key={part} type="button" onClick={() => toggleBodyPart(part)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all active:scale-95",
                          active
                            ? "border-[var(--brand)] bg-[var(--brand-bg)] text-[var(--brand-dark)] shadow-sm"
                            : "border-gray-200 text-gray-600 hover:border-[var(--brand-border)] hover:bg-[var(--brand-hover)]"
                        )}>
                        {part}
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              {/* 4. 施術内容 */}
              <SectionCard
                title={selectedTreatments.size > 0
                  ? `施術内容（${selectedTreatments.size}項目選択中）`
                  : "施術内容"}
              >
                <div className="flex flex-wrap gap-2">
                  {TREATMENTS.map((t) => {
                    const active = selectedTreatments.has(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleTreatment(t)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all active:scale-95",
                          active
                            ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                            : "border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/60"
                        )}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            </>
          )}

          {/* 5. 経過・所見 */}
          <SectionCard title="経過・所見">
            <Textarea
              name="progressNote"
              placeholder="施術後の変化、次回への申し送りなどを記入してください"
              rows={4}
              defaultValue={initialValues?.progressNote ?? ""}
              className="resize-none rounded-xl border-gray-200 text-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            />
          </SectionCard>

          {/* 6. メディア（Professional のみ）*/}
          {isProfessional && (
            <SectionCard
              title={
                existingMedia.length + uploadedMedia.length > 0
                  ? `写真・動画（${existingMedia.length + uploadedMedia.length}件）`
                  : "写真・動画"
              }
              badge={<ProfBadge />}
            >
              <div className="space-y-4">
                {/* 既存メディア（編集時） */}
                {existingMedia.length > 0 && (
                  <ExistingMediaGrid
                    media={existingMedia}
                    deletedIds={deletedMediaIds}
                    onToggleDelete={toggleDeleteMedia}
                  />
                )}
                {/* 新規アップロード */}
                <div>
                  {existingMedia.length > 0 && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      新しいファイルを追加
                    </p>
                  )}
                  <MediaUploadSection
                    tenantId={tenantId}
                    onChange={handleMediaChange}
                  />
                </div>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ══ トレーニングカルテ コンテンツ ══ */}
      {karteType === "TRAINING" && (
        <>
          {/* トレーニング記録 */}
          <SectionCard
            title={exerciseRows.length > 0
              ? `トレーニング記録（${exerciseRows.length}種目）`
              : "トレーニング記録"}
            badge={
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                <Dumbbell size={10} className="mr-1 inline" />
                トレーニング
              </span>
            }
          >
            <TrainingRecordSection
              exercises={exercises}
              previousRecords={previousRecords}
              rows={exerciseRows}
              onRowsChange={setExerciseRows}
            />
          </SectionCard>

          {/* メモ */}
          <SectionCard title="トレーニングメモ">
            <Textarea
              name="progressNote"
              placeholder="本日のコンディション、フォーム確認事項、次回の目標など"
              rows={3}
              defaultValue={initialValues?.progressNote ?? ""}
              className="resize-none rounded-xl border-gray-200 text-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
            />
          </SectionCard>

          {/* メディアアップロード（Professional のみ）*/}
          {isProfessional && (
            <SectionCard
              title={
                existingMedia.length + uploadedMedia.length > 0
                  ? `フォーム動画・写真（${existingMedia.length + uploadedMedia.length}件）`
                  : "フォーム動画・写真"
              }
              badge={<ProfBadge />}
            >
              <div className="space-y-4">
                {existingMedia.length > 0 && (
                  <ExistingMediaGrid
                    media={existingMedia}
                    deletedIds={deletedMediaIds}
                    onToggleDelete={toggleDeleteMedia}
                  />
                )}
                <div>
                  {existingMedia.length > 0 && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      新しいファイルを追加
                    </p>
                  )}
                  <MediaUploadSection
                    tenantId={tenantId}
                    onChange={handleMediaChange}
                  />
                </div>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ══ フッター ══ */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
        <button
          type="button"
          onClick={() => mode === "edit" ? onSuccess?.() : router.back()}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100"
        >
          キャンセル
        </button>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ProfBadge() {
  return (
    <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand-dark)]">
      Professional
    </span>
  );
}
