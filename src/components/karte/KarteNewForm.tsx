"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, AlertCircle, Save } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createKarte } from "@/app/[tenantId]/patients/[patientId]/kartes/actions";
import {
  BODY_PARTS,
  TREATMENTS,
  CONDITION_STATUS_OPTIONS,
} from "@/lib/karte-constants";
import type { KarteMode } from "@prisma/client";

// ── 型定義 ────────────────────────────────────────────────────────
type ExerciseMaster = { id: string; name: string; category: string | null };

type ExerciseRow = {
  rowId:       string;
  exerciseId:  string;
  sets:        string;
  reps:        string;
  weightKg:    string;
  durationSec: string;
  memo:        string;
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
};

// ── 送信ボタン（useFormStatus で pending 状態を取得）─────────────
function SubmitButton() {
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
        <>
          <Save size={16} />
          カルテを保存
        </>
      )}
    </button>
  );
}

// ── セクションカード ──────────────────────────────────────────────
function SectionCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
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

// ── メインフォームコンポーネント ─────────────────────────────────
export function KarteNewForm({
  tenantId,
  tenantSlug,
  patientId,
  patientName,
  karteModeSnapshot,
  isProfessional,
  trainingEnabled,
  exercises,
}: KarteNewFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(createKarte, null);

  // ── クライアント状態 ───────────────────────────────────────────
  const [conditionStatus, setConditionStatus]       = useState<string>("");
  const [selectedBodyParts, setSelectedBodyParts]   = useState<Set<string>>(new Set());
  const [selectedTreatments, setSelectedTreatments] = useState<Set<string>>(new Set());
  const [exerciseRows, setExerciseRows]             = useState<ExerciseRow[]>([]);

  // ── トグル関数 ─────────────────────────────────────────────────
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

  // ── トレーニング行操作 ─────────────────────────────────────────
  function addExerciseRow() {
    setExerciseRows((prev) => [
      ...prev,
      {
        rowId:       crypto.randomUUID(),
        exerciseId:  exercises[0]?.id ?? "",
        sets:        "3",
        reps:        "10",
        weightKg:    "",
        durationSec: "",
        memo:        "",
      },
    ]);
  }

  function removeExerciseRow(rowId: string) {
    setExerciseRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  function updateExerciseRow(
    rowId: string,
    field: keyof Omit<ExerciseRow, "rowId">,
    value: string
  ) {
    setExerciseRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r))
    );
  }

  // 送信前に exerciseRows を JSON にシリアライズ
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

  return (
    <form action={formAction} className="space-y-5">
      {/* ── 隠しフィールド群 ── */}
      <input type="hidden" name="tenantId"            value={tenantId} />
      <input type="hidden" name="patientId"           value={patientId} />
      <input type="hidden" name="tenantSlug"          value={tenantSlug} />
      <input type="hidden" name="karteModeSnapshot"   value={karteModeSnapshot} />
      <input type="hidden" name="conditionStatus"     value={conditionStatus} />
      <input type="hidden" name="exerciseRecordsJson" value={exerciseRecordsJson} />
      {/* 選択中の部位・施術内容を hidden input として送信 */}
      {Array.from(selectedBodyParts).map((part) => (
        <input key={part} type="hidden" name="bodyParts" value={part} />
      ))}
      {Array.from(selectedTreatments).map((t) => (
        <input key={t} type="hidden" name="treatments" value={t} />
      ))}

      {/* ── エラーバナー ── */}
      {state?.error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </div>
      )}

      {/* ══ 1. 症状・主訴（全モード共通）══ */}
      <SectionCard title="症状・主訴">
        <Textarea
          name="conditionNote"
          placeholder={`${patientName} さんの本日の症状・訴えを記入してください`}
          rows={4}
          className="resize-none rounded-xl border-gray-200 text-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
        />
      </SectionCard>

      {/* ══ Professional モード専用セクション ══ */}
      {isProfessional && (
        <>
          {/* 2. 状態評価 */}
          <SectionCard
            title="状態評価"
            badge={
              <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand-dark)]">
                Professional
              </span>
            }
          >
            <div className="flex flex-wrap gap-3">
              {CONDITION_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setConditionStatus((prev) =>
                      prev === opt.value ? "" : opt.value
                    )
                  }
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
                <button
                  type="button"
                  onClick={() => setConditionStatus("")}
                  className="self-center text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
                >
                  選択解除
                </button>
              )}
            </div>
          </SectionCard>

          {/* 3. 施術部位（複数選択）*/}
          <SectionCard
            title={
              selectedBodyParts.size > 0
                ? `施術部位（${selectedBodyParts.size}箇所選択中）`
                : "施術部位"
            }
          >
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.map((part) => {
                const active = selectedBodyParts.has(part);
                return (
                  <button
                    key={part}
                    type="button"
                    onClick={() => toggleBodyPart(part)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all active:scale-95",
                      active
                        ? "border-[var(--brand)] bg-[var(--brand-bg)] text-[var(--brand-dark)] shadow-sm"
                        : "border-gray-200 text-gray-600 hover:border-[var(--brand-border)] hover:bg-[var(--brand-hover)]"
                    )}
                  >
                    {part}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* 4. 施術内容（複数選択）*/}
          <SectionCard
            title={
              selectedTreatments.size > 0
                ? `施術内容（${selectedTreatments.size}項目選択中）`
                : "施術内容"
            }
          >
            <div className="flex flex-wrap gap-2">
              {TREATMENTS.map((t) => {
                const active = selectedTreatments.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTreatment(t)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all active:scale-95",
                      active
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm"
                        : "border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/60"
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </SectionCard>
        </>
      )}

      {/* ══ 5. 経過・所見（全モード共通）══ */}
      <SectionCard title="経過・所見">
        <Textarea
          name="progressNote"
          placeholder="施術後の変化、次回への申し送りなどを記入してください"
          rows={4}
          className="resize-none rounded-xl border-gray-200 text-sm focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
        />
      </SectionCard>

      {/* ══ 6. トレーニング記録（A院 + training_record ON のみ）══ */}
      {isProfessional && trainingEnabled && (
        <SectionCard
          title={
            exerciseRows.length > 0
              ? `トレーニング記録（${exerciseRows.length}種目）`
              : "トレーニング記録"
          }
          badge={
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
              A院専用
            </span>
          }
        >
          <div className="space-y-3">
            {exerciseRows.length > 0 && (
              <>
                {/* カラムヘッダー */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  <span>種目</span>
                  <span className="text-center">セット</span>
                  <span className="text-center">レップ</span>
                  <span className="text-center">重量(kg)</span>
                  <span>メモ</span>
                  <span />
                </div>

                {exerciseRows.map((row, index) => (
                  <div
                    key={row.rowId}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3"
                  >
                    {/* 種目セレクト */}
                    <div className="relative">
                      <select
                        value={row.exerciseId}
                        onChange={(e) =>
                          updateExerciseRow(row.rowId, "exerciseId", e.target.value)
                        }
                        className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]/20"
                      >
                        {exercises.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.name}
                            {ex.category ? ` (${ex.category})` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                    </div>

                    {/* セット数 */}
                    <input
                      type="number" min="1" max="99"
                      placeholder="3"
                      value={row.sets}
                      onChange={(e) => updateExerciseRow(row.rowId, "sets", e.target.value)}
                      className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-center text-sm outline-none focus:border-[var(--brand)]"
                    />

                    {/* レップ数 */}
                    <input
                      type="number" min="1" max="999"
                      placeholder="10"
                      value={row.reps}
                      onChange={(e) => updateExerciseRow(row.rowId, "reps", e.target.value)}
                      className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-center text-sm outline-none focus:border-[var(--brand)]"
                    />

                    {/* 重量 */}
                    <input
                      type="number" min="0" step="0.5"
                      placeholder="0"
                      value={row.weightKg}
                      onChange={(e) => updateExerciseRow(row.rowId, "weightKg", e.target.value)}
                      className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-center text-sm outline-none focus:border-[var(--brand)]"
                    />

                    {/* メモ */}
                    <input
                      type="text"
                      placeholder="フォーム注意点など"
                      value={row.memo}
                      onChange={(e) => updateExerciseRow(row.rowId, "memo", e.target.value)}
                      className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[var(--brand)]"
                    />

                    {/* 削除 */}
                    <button
                      type="button"
                      onClick={() => removeExerciseRow(row.rowId)}
                      aria-label={`${index + 1}行目を削除`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </>
            )}

            {exercises.length > 0 ? (
              <button
                type="button"
                onClick={addExerciseRow}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand-border)] text-sm font-medium text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-bg)]"
              >
                <Plus size={15} />
                種目を追加
              </button>
            ) : (
              <p className="text-center text-xs text-gray-400">
                トレーニング種目マスタが未登録です
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {/* ══ フッター ══ */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100"
        >
          キャンセル
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}
