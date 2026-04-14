"use client";

/**
 * トレーニング種目マスタ管理 — クライアントコンポーネント
 */

import { useState, useActionState, useEffect, useTransition } from "react";
import {
  Plus, Pencil, Trash2, RefreshCcw, X, Loader2, AlertCircle,
  Dumbbell, Tag, Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  createExercise, updateExercise, deactivateExercise, reactivateExercise,
  type ExerciseFormState,
} from "./actions";

// ─────────────────────────────────────────────────────────────────────────────

export type ExerciseRow = {
  id:       string;
  name:     string;
  category: string | null;
  unit:     string | null;
  isActive: boolean;
};

type Props = {
  exercises:  ExerciseRow[];
  tenantId:   string;
  tenantSlug: string;
};

const CATEGORY_PRESETS = ["上半身", "下半身", "体幹", "有酸素", "柔軟・ストレッチ", "その他"];
const UNIT_PRESETS     = ["kg", "回", "秒", "分", "m", "セット"];

const inputBase =
  "mt-1.5 block w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const inputNormal   = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputErrorCls = "border-red-300 bg-red-50/50";

// ─────────────────────────────────────────────────────────────────────────────

export function TrainingsClient({ exercises: initial, tenantId, tenantSlug }: Props) {
  const [exercises, setExercises]   = useState<ExerciseRow[]>(initial);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<ExerciseRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("");

  useEffect(() => { setExercises(initial); }, [initial]);

  // カテゴリ一覧（データ由来 + プリセットのマージ）
  const existingCategories = [...new Set(exercises.map((e) => e.category).filter(Boolean))] as string[];
  const allCategories = [...new Set([...CATEGORY_PRESETS, ...existingCategories])].sort();

  const visible = exercises
    .filter((e) => showInactive || e.isActive)
    .filter((e) => !filterCategory || e.category === filterCategory);

  const inactiveCount = exercises.filter((e) => !e.isActive).length;

  return (
    <div className="space-y-5">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">トレーニング管理</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            トレーニング種目マスタの一覧・登録・編集・停止を管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <button type="button" onClick={() => setShowInactive((v) => !v)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
                showInactive
                  ? "border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand-dark)]"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              )}>
              <RefreshCcw size={13} />
              停止中を{showInactive ? "隠す" : `表示 (${inactiveCount})`}
            </button>
          )}
          <button type="button" onClick={() => { setEditTarget(null); setDialogMode("create"); }}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--brand-medium)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-dark)]">
            <Plus size={15} />種目を追加
          </button>
        </div>
      </div>

      {/* ── カテゴリフィルタ ── */}
      <div className="flex flex-wrap gap-2">
        {["", ...allCategories].map((cat) => (
          <button
            key={cat || "__all"}
            type="button"
            onClick={() => setFilterCategory(cat)}
            className={cn(
              "flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              filterCategory === cat
                ? "border-[var(--brand)] bg-[var(--brand-bg)] text-[var(--brand-dark)]"
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            )}
          >
            {cat || "すべて"}
            {cat && (
              <span className="ml-1.5 text-[10px] text-gray-400">
                {exercises.filter((e) => e.category === cat && (showInactive || e.isActive)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── テーブル ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {visible.length === 0 ? (
          <EmptyState onAdd={() => { setEditTarget(null); setDialogMode("create"); }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">種目名</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <span className="flex items-center gap-1"><Tag size={11} />カテゴリ</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <span className="flex items-center gap-1"><Ruler size={11} />単位</span>
                  </th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">状態</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map((ex) => (
                  <ExRow
                    key={ex.id}
                    ex={ex}
                    tenantId={tenantId}
                    tenantSlug={tenantSlug}
                    onEdit={() => { setEditTarget(ex); setDialogMode("edit"); }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 件数表示 ── */}
      {visible.length > 0 && (
        <p className="text-center text-xs text-gray-400">{visible.length}件を表示中</p>
      )}

      {/* ── ダイアログ ── */}
      {dialogMode && (
        <ExerciseDialog
          mode={dialogMode}
          initial={editTarget}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          categoryOptions={allCategories}
          onClose={() => { setDialogMode(null); setEditTarget(null); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// テーブル行
// ─────────────────────────────────────────────────────────────────────────────

function ExRow({
  ex, tenantId, tenantSlug, onEdit,
}: {
  ex: ExerciseRow;
  tenantId: string;
  tenantSlug: string;
  onEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const action = ex.isActive ? deactivateExercise : reactivateExercise;
      const result = await action(ex.id, tenantId, tenantSlug);
      if (!result.success) toast.error(result.error ?? "操作に失敗しました");
      else toast.success(ex.isActive ? `「${ex.name}」を停止しました` : `「${ex.name}」を再開しました`);
    });
  }

  return (
    <tr className={cn("group transition-colors hover:bg-gray-50/60", !ex.isActive && "opacity-50")}>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-bg)]">
            <Dumbbell size={14} className="text-[var(--brand-dark)]" />
          </div>
          <span className="font-medium text-gray-800">{ex.name}</span>
        </div>
      </td>
      <td className="px-5 py-4">
        {ex.category ? (
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {ex.category}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-5 py-4">
        {ex.unit ? (
          <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
            {ex.unit}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-5 py-4 text-center">
        {ex.isActive ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">有効</span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">停止中</span>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={onEdit} aria-label="編集"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={handleToggle} disabled={isPending}
            aria-label={ex.isActive ? "停止" : "再開"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50",
              ex.isActive ? "text-gray-400 hover:bg-red-50 hover:text-red-500"
                          : "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
            )}>
            {isPending ? <Loader2 size={13} className="animate-spin" />
              : ex.isActive ? <Trash2 size={13} /> : <RefreshCcw size={13} />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ダイアログ
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseDialog({
  mode, initial, tenantId, tenantSlug, categoryOptions, onClose,
}: {
  mode:             "create" | "edit";
  initial:          ExerciseRow | null;
  tenantId:         string;
  tenantSlug:       string;
  categoryOptions:  string[];
  onClose:          () => void;
}) {
  const action = mode === "create" ? createExercise : updateExercise;
  const [state, formAction, isPending] = useActionState<ExerciseFormState, FormData>(action, null);
  const errors = state?.errors;

  useEffect(() => {
    if (state?.success) {
      toast.success(mode === "create" ? "種目を登録しました" : "種目情報を更新しました");
      onClose();
    }
  }, [state?.success, mode, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <Dumbbell size={15} />
            </div>
            <p className="text-sm font-semibold text-[var(--brand-darker)]">
              {mode === "create" ? "種目を追加" : "種目を編集"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <form action={formAction} className="divide-y divide-gray-50 px-6">
          <input type="hidden" name="tenantId"   value={tenantId} />
          <input type="hidden" name="tenantSlug" value={tenantSlug} />
          {initial && <input type="hidden" name="exerciseId" value={initial.id} />}

          {errors?.general && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mt-4 text-sm text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{errors.general}</span>
            </div>
          )}

          {/* 種目名 */}
          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700">
              種目名 <span className="text-xs text-red-500">必須</span>
            </label>
            <input name="name" type="text" defaultValue={initial?.name ?? ""}
              placeholder="例: スクワット"
              className={cn(inputBase, errors?.name ? inputErrorCls : inputNormal)} />
            {errors?.name && <FieldError msg={errors.name} />}
          </div>

          {/* カテゴリ + 単位 */}
          <div className="py-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                カテゴリ <span className="text-xs text-gray-400">任意</span>
              </label>
              <input name="category" type="text" list="category-options"
                defaultValue={initial?.category ?? ""}
                placeholder="下半身"
                className={cn(inputBase, inputNormal)} />
              <datalist id="category-options">
                {categoryOptions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                単位 <span className="text-xs text-gray-400">任意</span>
              </label>
              <input name="unit" type="text" list="unit-options"
                defaultValue={initial?.unit ?? ""}
                placeholder="kg"
                className={cn(inputBase, inputNormal)} />
              <datalist id="unit-options">
                {UNIT_PRESETS.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>

          {/* ボタン */}
          <div className="flex items-center justify-end gap-3 py-4">
            <button type="button" onClick={onClose}
              className="flex h-10 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              キャンセル
            </button>
            <button type="submit" disabled={isPending}
              className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-dark)] disabled:opacity-60">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Dumbbell size={14} />}
              {mode === "create" ? "追加する" : "保存する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-bg)]">
        <Dumbbell size={24} className="text-[var(--brand-medium)]" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">トレーニング種目が登録されていません</p>
      <p className="mt-1 text-xs text-gray-400">「種目を追加」から最初の種目を登録してください</p>
      <button type="button" onClick={onAdd}
        className="mt-5 flex h-9 items-center gap-1.5 rounded-xl bg-[var(--brand-medium)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
        <Plus size={14} />種目を追加
      </button>
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
      <AlertCircle size={12} />{msg}
    </p>
  );
}
