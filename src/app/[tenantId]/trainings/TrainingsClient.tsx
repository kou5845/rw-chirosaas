"use client";

/**
 * トレーニング種目マスタ管理 — クライアントコンポーネント
 *
 * - 種目の CRUD + ↑/↓ 並び替え
 * - DB ベースのカテゴリ管理モーダル（カテゴリ CRUD + 並び替え）
 */

import { useState, useActionState, useEffect, useTransition, useRef } from "react";
import {
  Plus, Pencil, X, Loader2, AlertCircle,
  Dumbbell, Tag, Ruler, ChevronUp, ChevronDown, FolderCog, Check, Trash2,
  Clock, Banknote, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  createExercise, updateExercise, toggleExerciseStatus,
  reorderExercises, createCategory, updateCategory, deleteCategory, reorderCategories,
  type ExerciseFormState, type CategoryFormState,
} from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export type ExerciseRow = {
  id:          string;
  name:        string;
  category:    string | null;
  categoryId:  string | null;
  unit:        string | null;
  duration:    number;
  intervalMin: number;
  price:       number;
  sortOrder:   number;
  isActive:    boolean;
};

export type CategoryRow = {
  id:        string;
  name:      string;
  sortOrder: number;
};

type Props = {
  exercises:  ExerciseRow[];
  categories: CategoryRow[];
  tenantId:   string;
  tenantSlug: string;
};

// ─────────────────────────────────────────────────────────────────────────────

const UNIT_PRESETS = ["kg", "回", "秒", "分", "m", "セット"];

const inputBase =
  "mt-1.5 block w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const inputNormal   = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputErrorCls = "border-red-300 bg-red-50/50";

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function TrainingsClient({ exercises: initial, categories: initialCategories, tenantId, tenantSlug }: Props) {
  const [exercises,   setExercises]   = useState<ExerciseRow[]>(initial);
  const [categories,  setCategories]  = useState<CategoryRow[]>(initialCategories);
  const [dialogMode,  setDialogMode]  = useState<"create" | "edit" | null>(null);
  const [editTarget,  setEditTarget]  = useState<ExerciseRow | null>(null);
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [showCatManager,   setShowCatManager]   = useState(false);
  const [, startReorder] = useTransition();

  useEffect(() => { setExercises(initial); },           [initial]);
  useEffect(() => { setCategories(initialCategories); }, [initialCategories]);

  const visible = exercises
    .filter((e) => !filterCategoryId || e.categoryId === filterCategoryId);

  const inactiveCount = exercises.filter((e) => !e.isActive).length;

  function moveExercise(id: string, direction: "up" | "down") {
    const idx = visible.findIndex((e) => e.id === id);
    if (direction === "up"   && idx === 0)               return;
    if (direction === "down" && idx === visible.length - 1) return;

    const swapIdx  = direction === "up" ? idx - 1 : idx + 1;
    const newVis   = [...visible];
    [newVis[idx], newVis[swapIdx]] = [newVis[swapIdx], newVis[idx]];

    const updates   = newVis.map((e, i) => ({ id: e.id, sortOrder: i * 10 }));
    const updateMap = new Map(updates.map((u) => [u.id, u.sortOrder]));

    const updated = exercises
      .map((e) => ({ ...e, sortOrder: updateMap.get(e.id) ?? e.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    setExercises(updated);

    startReorder(async () => {
      const result = await reorderExercises(updates, tenantId, tenantSlug);
      if (!result.success) toast.error(result.error ?? "並び替えに失敗しました");
    });
  }

  function handleToggle(id: string, next: boolean) {
    setExercises((prev) =>
      prev.map((e) => e.id === id ? { ...e, isActive: next } : e)
    );
  }

  return (
    <div className="space-y-5">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">トレーニングメニュー管理</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            トレーニング種目マスタの一覧・登録・編集・停止・並び替えを管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
              停止中 {inactiveCount}件
            </span>
          )}
          <button type="button" onClick={() => setShowCatManager(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
            <FolderCog size={14} />
            カテゴリを管理
          </button>
          <button type="button" onClick={() => { setEditTarget(null); setDialogMode("create"); }}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--brand-medium)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-dark)]">
            <Plus size={15} />種目を追加
          </button>
        </div>
      </div>

      {/* ── カテゴリフィルタ ── */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[{ id: "", name: "すべて" }, ...categories].map((cat) => (
            <button
              key={cat.id || "__all"}
              type="button"
              onClick={() => setFilterCategoryId(cat.id)}
              className={cn(
                "flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                filterCategoryId === cat.id
                  ? "border-[var(--brand)] bg-[var(--brand-bg)] text-[var(--brand-dark)]"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              )}
            >
              {cat.name}
              {cat.id && (
                <span className="ml-1.5 text-[10px] text-gray-400">
                  {exercises.filter((e) => e.categoryId === cat.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── テーブル ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {visible.length === 0 ? (
          <EmptyState onAdd={() => { setEditTarget(null); setDialogMode("create"); }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="w-16 px-3 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">順番</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">種目名</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <span className="flex items-center gap-1"><Tag size={11} />カテゴリ</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <span className="flex items-center gap-1"><Ruler size={11} />単位</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden lg:table-cell">
                    <span className="flex items-center gap-1"><Clock size={11} />所要時間</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden xl:table-cell">
                    <span className="flex items-center gap-1"><Timer size={11} />インターバル</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden lg:table-cell">
                    <span className="flex items-center gap-1"><Banknote size={11} />料金</span>
                  </th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">状態</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map((ex, idx) => (
                  <ExRow
                    key={ex.id}
                    ex={ex}
                    tenantId={tenantId}
                    tenantSlug={tenantSlug}
                    isFirst={idx === 0}
                    isLast={idx === visible.length - 1}
                    onEdit={() => { setEditTarget(ex); setDialogMode("edit"); }}
                    onMove={(dir) => moveExercise(ex.id, dir)}
                    onToggle={handleToggle}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <p className="text-center text-xs text-gray-400">{visible.length}件を表示中</p>
      )}

      {/* ── 種目ダイアログ ── */}
      {dialogMode && (
        <ExerciseDialog
          mode={dialogMode}
          initial={editTarget}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          categories={categories}
          onClose={() => { setDialogMode(null); setEditTarget(null); }}
        />
      )}

      {/* ── カテゴリ管理モーダル ── */}
      {showCatManager && (
        <CategoryManagerModal
          categories={categories}
          setCategories={setCategories}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          onClose={() => setShowCatManager(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// テーブル行
// ─────────────────────────────────────────────────────────────────────────────

function ExRow({
  ex, tenantId, tenantSlug, isFirst, isLast, onEdit, onMove, onToggle,
}: {
  ex:         ExerciseRow;
  tenantId:   string;
  tenantSlug: string;
  isFirst:    boolean;
  isLast:     boolean;
  onEdit:     () => void;
  onMove:     (dir: "up" | "down") => void;
  onToggle:   (id: string, next: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSwitch(checked: boolean) {
    startTransition(async () => {
      const result = await toggleExerciseStatus(ex.id, checked, tenantId, tenantSlug);
      if (!result.success) {
        toast.error(result.error ?? "状態の更新に失敗しました");
      } else {
        onToggle(ex.id, checked);
        toast.success("状態を更新しました");
      }
    });
  }

  return (
    <tr className={cn("group transition-colors hover:bg-gray-50/60", !ex.isActive && "opacity-50")}>
      {/* 並び替えボタン */}
      <td className="px-3 py-4">
        <div className="flex flex-col items-center gap-0.5">
          <button type="button" onClick={() => onMove("up")} disabled={isFirst}
            aria-label="上に移動"
            className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-20">
            <ChevronUp size={13} />
          </button>
          <button type="button" onClick={() => onMove("down")} disabled={isLast}
            aria-label="下に移動"
            className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-20">
            <ChevronDown size={13} />
          </button>
        </div>
      </td>
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
      <td className="hidden px-5 py-4 text-gray-600 lg:table-cell">
        {ex.duration > 0 ? `${ex.duration}分` : <span className="text-gray-400">—</span>}
      </td>
      <td className="hidden px-5 py-4 text-gray-500 xl:table-cell">
        {ex.intervalMin > 0 ? `+${ex.intervalMin}分` : <span className="text-gray-400">—</span>}
      </td>
      <td className="hidden px-5 py-4 font-medium text-gray-800 lg:table-cell">
        {ex.price > 0 ? `¥${ex.price.toLocaleString()}` : <span className="font-normal text-gray-400">—</span>}
      </td>
      <td className="px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          {isPending ? (
            <Loader2 size={13} className="animate-spin text-gray-400" />
          ) : (
            <Switch
              checked={ex.isActive}
              onCheckedChange={handleSwitch}
              disabled={isPending}
              aria-label={ex.isActive ? "有効 — クリックで停止" : "停止中 — クリックで有効化"}
            />
          )}
          <span className={cn(
            "text-xs font-medium",
            ex.isActive ? "text-emerald-600" : "text-gray-400"
          )}>
            {ex.isActive ? "有効" : "停止"}
          </span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={onEdit} aria-label="編集"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]">
            <Pencil size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 種目 作成 / 編集 ダイアログ
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseDialog({
  mode, initial, tenantId, tenantSlug, categories, onClose,
}: {
  mode:       "create" | "edit";
  initial:    ExerciseRow | null;
  tenantId:   string;
  tenantSlug: string;
  categories: CategoryRow[];
  onClose:    () => void;
}) {
  const action = mode === "create" ? createExercise : updateExercise;
  const [state, formAction, isPending] = useActionState<ExerciseFormState, FormData>(action, null);
  const errors = state?.errors;

  // 選択中のカテゴリID（select の value として制御）
  const [selectedCatId, setSelectedCatId] = useState(initial?.categoryId ?? "");
  const selectedCat = categories.find((c) => c.id === selectedCatId);

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
          {/* カテゴリ名スナップショット（後方互換） */}
          <input type="hidden" name="category" value={selectedCat?.name ?? ""} />

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
              {categories.length > 0 ? (
                <select
                  name="categoryId"
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className={cn(inputBase, inputNormal, "cursor-pointer")}
                >
                  <option value="">未分類</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input name="categoryId" type="hidden" value="" />
                  <p className="mt-2 text-xs text-gray-400">カテゴリ未登録</p>
                </>
              )}
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

          {/* 所要時間 + インターバル + 料金 */}
          <div className="py-4 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                所要時間（分） <span className="text-xs text-gray-400">任意</span>
              </label>
              <div className="relative">
                <input name="duration" type="number" min="0" max="480"
                  defaultValue={initial?.duration && initial.duration > 0 ? initial.duration : ""}
                  placeholder="60"
                  className={cn(inputBase, "pr-8", errors?.duration ? inputErrorCls : inputNormal)} />
                <span className="absolute right-3 top-1/2 mt-0.5 text-xs text-gray-400">分</span>
              </div>
              {errors?.duration && <FieldError msg={errors.duration} />}
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700">
                <Timer size={13} className="text-gray-400" />
                インターバル
                <span className="text-xs text-gray-400">任意</span>
              </label>
              <div className="relative">
                <input name="intervalMin" type="number" min="0" max="120"
                  defaultValue={initial?.intervalMin ?? 0}
                  placeholder="0"
                  className={cn(inputBase, "pr-8", errors?.intervalMin ? inputErrorCls : inputNormal)} />
                <span className="absolute right-3 top-1/2 mt-0.5 text-xs text-gray-400">分</span>
              </div>
              {errors?.intervalMin && <FieldError msg={errors.intervalMin} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                料金（円） <span className="text-xs text-gray-400">任意</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 text-xs text-gray-400">¥</span>
                <input name="price" type="number" min="0"
                  defaultValue={initial?.price && initial.price > 0 ? initial.price : ""}
                  placeholder="3000"
                  className={cn(inputBase, "pl-7", errors?.price ? inputErrorCls : inputNormal)} />
              </div>
              {errors?.price && <FieldError msg={errors.price} />}
            </div>
          </div>

          <p className="pb-2 -mt-2 text-xs text-gray-400">
            ※ インターバルは次の予約までの準備時間です。予約ブロック計算に含まれますが、お客様への表示には含まれません。
          </p>

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

// ─────────────────────────────────────────────────────────────────────────────
// カテゴリ管理モーダル
// ─────────────────────────────────────────────────────────────────────────────

function CategoryManagerModal({
  categories, setCategories, tenantId, tenantSlug, onClose,
}: {
  categories:    CategoryRow[];
  setCategories: React.Dispatch<React.SetStateAction<CategoryRow[]>>;
  tenantId:      string;
  tenantSlug:    string;
  onClose:       () => void;
}) {
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [, startTransition] = useTransition();

  // 新規追加フォーム
  const [addState, addAction, addPending] =
    useActionState<CategoryFormState, FormData>(createCategory, null);
  const addFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addState?.success) {
      addFormRef.current?.reset();
      toast.success("カテゴリを追加しました");
    }
  }, [addState?.success]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function startEdit(cat: CategoryRow) {
    setEditingId(cat.id);
    setEditingName(cat.name);
  }

  function commitEdit(id: string) {
    const name = editingName.trim();
    if (!name) { setEditingId(null); return; }

    // 楽観的更新
    setCategories((prev) =>
      prev.map((c) => c.id === id ? { ...c, name } : c)
    );
    setEditingId(null);

    startTransition(async () => {
      const result = await updateCategory(id, name, tenantId, tenantSlug);
      if (!result.success) {
        toast.error(result.error ?? "更新に失敗しました");
        // ロールバック（revalidate で再取得される）
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`カテゴリ「${name}」を削除しますか？\n紐づく種目のカテゴリは「未分類」になります。`)) return;

    // 楽観的更新
    setCategories((prev) => prev.filter((c) => c.id !== id));

    startTransition(async () => {
      const result = await deleteCategory(id, tenantId, tenantSlug);
      if (!result.success) {
        toast.error(result.error ?? "削除に失敗しました");
      } else {
        toast.success(`「${name}」を削除しました`);
      }
    });
  }

  function moveCategory(id: string, direction: "up" | "down") {
    const idx = categories.findIndex((c) => c.id === id);
    if (direction === "up"   && idx === 0)                  return;
    if (direction === "down" && idx === categories.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newCats = [...categories];
    [newCats[idx], newCats[swapIdx]] = [newCats[swapIdx], newCats[idx]];

    const updates = newCats.map((c, i) => ({ id: c.id, sortOrder: i * 10 }));
    setCategories(newCats.map((c, i) => ({ ...c, sortOrder: i * 10 })));

    startTransition(async () => {
      const result = await reorderCategories(updates, tenantId, tenantSlug);
      if (!result.success) toast.error(result.error ?? "並び替えに失敗しました");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <FolderCog size={15} />
            </div>
            <p className="text-sm font-semibold text-[var(--brand-darker)]">カテゴリを管理</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto">
          {/* カテゴリ一覧 */}
          {categories.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              カテゴリがまだ登録されていません
            </p>
          ) : (
            <ul className="divide-y divide-gray-50 px-4 py-2">
              {categories.map((cat, idx) => (
                <li key={cat.id} className="flex items-center gap-2 py-2.5">
                  {/* 並び替えボタン */}
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveCategory(cat.id, "up")} disabled={idx === 0}
                      aria-label="上に移動"
                      className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-20">
                      <ChevronUp size={12} />
                    </button>
                    <button type="button" onClick={() => moveCategory(cat.id, "down")} disabled={idx === categories.length - 1}
                      aria-label="下に移動"
                      className="flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-20">
                      <ChevronDown size={12} />
                    </button>
                  </div>

                  {/* 名前 (インライン編集) */}
                  {editingId === cat.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(cat.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 rounded-lg border border-[var(--brand)] bg-white px-2.5 py-1 text-sm text-gray-800 outline-none ring-2 ring-[var(--brand)]/30"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-800">{cat.name}</span>
                  )}

                  {/* アクションボタン */}
                  {editingId === cat.id ? (
                    <button type="button" onClick={() => commitEdit(cat.id)}
                      aria-label="確定"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                      <Check size={13} />
                    </button>
                  ) : (
                    <button type="button" onClick={() => startEdit(cat)}
                      aria-label="編集"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]">
                      <Pencil size={12} />
                    </button>
                  )}
                  <button type="button" onClick={() => handleDelete(cat.id, cat.name)}
                    aria-label="削除"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 新規追加フォーム */}
          <div className="border-t border-gray-100 px-4 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">カテゴリを追加</p>
            <form ref={addFormRef} action={addAction} className="flex items-start gap-2">
              <input type="hidden" name="tenantId"   value={tenantId} />
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <div className="flex-1">
                <input
                  name="name"
                  type="text"
                  placeholder="例: 上半身"
                  className={cn(
                    "block w-full rounded-xl border px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent",
                    addState?.errors?.name ? inputErrorCls : inputNormal
                  )}
                />
                {addState?.errors?.name && (
                  <p className="mt-1 text-xs text-red-600">{addState.errors.name}</p>
                )}
              </div>
              <button type="submit" disabled={addPending}
                className="flex h-9 items-center gap-1 rounded-xl bg-[var(--brand-medium)] px-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60 shrink-0">
                {addPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                追加
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
