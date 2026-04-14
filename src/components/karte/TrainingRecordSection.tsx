"use client";

/**
 * トレーニング記録入力セクション
 *
 * - 種目マスタから選択
 * - 負荷(kg) × 回数 × セット数を動的に追加
 * - 前回同種目の記録を「前回: 10kg × 10回 × 3set」で表示
 */

import { useState, useCallback } from "react";
import { Plus, Trash2, ChevronDown, TrendingUp, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

export type ExerciseMaster = {
  id:       string;
  name:     string;
  category: string | null;
  unit:     string | null;
};

/** 種目ごとの直近記録（Server Component から渡す） */
export type PreviousRecord = {
  exerciseId:  string;
  sets:        number | null;
  reps:        number | null;
  weightKg:    string | null; // Decimal は string として渡す
  durationSec: number | null;
  recordedAt:  string; // ISO string
};

export type ExerciseRow = {
  rowId:       string;
  exerciseId:  string;
  sets:        string;
  reps:        string;
  weightKg:    string;
  durationSec: string;
  memo:        string;
};

type Props = {
  exercises:       ExerciseMaster[];
  previousRecords: PreviousRecord[];
  rows:            ExerciseRow[];
  onRowsChange:    (rows: ExerciseRow[]) => void;
};

// ─────────────────────────────────────────────────────────────────────────────

export function TrainingRecordSection({
  exercises, previousRecords, rows, onRowsChange,
}: Props) {
  function addRow() {
    const first = exercises[0];
    if (!first) return;
    const prev = previousRecords.find((r) => r.exerciseId === first.id);
    onRowsChange([
      ...rows,
      {
        rowId:       crypto.randomUUID(),
        exerciseId:  first.id,
        sets:        prev?.sets  ? String(prev.sets)  : "3",
        reps:        prev?.reps  ? String(prev.reps)  : "10",
        weightKg:    prev?.weightKg ?? "",
        durationSec: prev?.durationSec ? String(prev.durationSec) : "",
        memo:        "",
      },
    ]);
  }

  function removeRow(rowId: string) {
    onRowsChange(rows.filter((r) => r.rowId !== rowId));
  }

  function updateRow(
    rowId: string,
    field: keyof Omit<ExerciseRow, "rowId">,
    value: string
  ) {
    onRowsChange(rows.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)));
  }

  function onExerciseChange(rowId: string, exerciseId: string) {
    const prev = previousRecords.find((r) => r.exerciseId === exerciseId);
    onRowsChange(rows.map((r) =>
      r.rowId === rowId
        ? {
            ...r,
            exerciseId,
            // 種目が変わったら前回値をプリセット
            sets:        prev?.sets        ? String(prev.sets)        : r.sets,
            reps:        prev?.reps        ? String(prev.reps)        : r.reps,
            weightKg:    prev?.weightKg    ?? r.weightKg,
            durationSec: prev?.durationSec ? String(prev.durationSec) : r.durationSec,
          }
        : r
    ));
  }

  if (exercises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-10 text-center">
        <Dumbbell size={28} className="text-gray-200" />
        <p className="mt-2 text-sm text-gray-400">トレーニング種目マスタが未登録です</p>
        <p className="text-xs text-gray-300">設定 → トレーニング管理から種目を追加してください</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <>
          {/* カラムヘッダー（モバイルでは非表示）*/}
          <div className="hidden grid-cols-[2fr_1fr_1fr_1.2fr_auto] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:grid">
            <span>種目</span>
            <span className="text-center">セット</span>
            <span className="text-center">回数</span>
            <span className="text-center">負荷</span>
            <span />
          </div>

          {rows.map((row) => {
            const prev = previousRecords.find((r) => r.exerciseId === row.exerciseId);
            const exercise = exercises.find((e) => e.id === row.exerciseId);
            const unit = exercise?.unit;

            return (
              <ExerciseRowCard
                key={row.rowId}
                row={row}
                exercises={exercises}
                previousRecord={prev}
                unit={unit ?? null}
                onChange={(field, value) => updateRow(row.rowId, field, value)}
                onExerciseChange={(eid) => onExerciseChange(row.rowId, eid)}
                onRemove={() => removeRow(row.rowId)}
              />
            );
          })}
        </>
      )}

      {/* 追加ボタン */}
      <button
        type="button"
        onClick={addRow}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand-border)] text-sm font-medium text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-bg)]"
      >
        <Plus size={15} />
        種目を追加
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1行コンポーネント
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseRowCard({
  row, exercises, previousRecord, unit,
  onChange, onExerciseChange, onRemove,
}: {
  row:            ExerciseRow;
  exercises:      ExerciseMaster[];
  previousRecord: PreviousRecord | undefined;
  unit:           string | null;
  onChange:       (field: keyof Omit<ExerciseRow, "rowId">, value: string) => void;
  onExerciseChange: (exerciseId: string) => void;
  onRemove:       () => void;
}) {
  const [memoOpen, setMemoOpen] = useState(false);

  const prevLabel = previousRecord
    ? [
        previousRecord.weightKg && Number(previousRecord.weightKg) > 0
          ? `${previousRecord.weightKg}${unit ?? "kg"}`
          : null,
        previousRecord.reps
          ? `${previousRecord.reps}回`
          : null,
        previousRecord.sets
          ? `${previousRecord.sets}set`
          : null,
        previousRecord.durationSec
          ? `${previousRecord.durationSec}秒`
          : null,
      ]
        .filter(Boolean)
        .join(" × ")
    : null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      {/* 前回記録バナー */}
      {prevLabel && (
        <div className="flex items-center gap-1.5 border-b border-gray-50 bg-emerald-50/60 px-3 py-1.5">
          <TrendingUp size={11} className="shrink-0 text-emerald-500" />
          <span className="text-[11px] text-emerald-700">
            前回: <span className="font-semibold">{prevLabel}</span>
          </span>
        </div>
      )}

      <div className="p-3">
        {/* 種目セレクト */}
        <div className="relative mb-2">
          <select
            value={row.exerciseId}
            onChange={(e) => onExerciseChange(e.target.value)}
            className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]/20"
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}{ex.category ? ` (${ex.category})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        {/* セット × 回数 × 負荷 */}
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="セット"
            placeholder="3"
            value={row.sets}
            suffix="set"
            onChange={(v) => onChange("sets", v)}
          />
          <NumberField
            label="回数"
            placeholder="10"
            value={row.reps}
            suffix="回"
            onChange={(v) => onChange("reps", v)}
          />
          <NumberField
            label={unit ?? "負荷"}
            placeholder="0"
            value={row.weightKg}
            suffix={unit ?? "kg"}
            step="0.5"
            onChange={(v) => onChange("weightKg", v)}
          />
        </div>

        {/* メモ（展開式）*/}
        <div className="mt-2">
          {memoOpen ? (
            <input
              type="text"
              placeholder="フォーム注意点など"
              value={row.memo}
              onChange={(e) => onChange("memo", e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs outline-none focus:border-[var(--brand)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setMemoOpen(true)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              + メモを追加
            </button>
          )}
        </div>

        {/* 削除ボタン */}
        <button
          type="button"
          onClick={onRemove}
          aria-label="この種目を削除"
          className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 group-hover:flex"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 削除（インライン配置） */}
      <div className="flex justify-end border-t border-gray-50 px-3 py-1.5">
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-red-500"
        >
          <Trash2 size={11} />
          削除
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label, placeholder, value, suffix, step, onChange,
}: {
  label:       string;
  placeholder: string;
  value:       string;
  suffix:      string;
  step?:       string;
  onChange:    (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium text-gray-500">{label}</p>
      <div className="relative">
        <input
          type="number"
          min="0"
          step={step ?? "1"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pr-8 text-center text-sm outline-none focus:border-[var(--brand)]"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
          {suffix}
        </span>
      </div>
    </div>
  );
}
