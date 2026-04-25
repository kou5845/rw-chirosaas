"use client";

/**
 * 施術マスタ管理 — クライアントコンポーネント
 *
 * 一覧表示 + 新規作成 / 編集 / 論理削除 / 並び替えをモーダルダイアログで実装。
 */

import { useState, useActionState, useEffect, useTransition } from "react";
import {
  Plus, Pencil, X, Loader2, AlertCircle,
  Syringe, Clock, Banknote, FileText, ChevronUp, ChevronDown, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  createService, updateService, toggleServiceStatus, reorderServices,
  type ServiceFormState,
} from "./actions";

// ─────────────────────────────────────────────────────────────────────────────

export type ServiceRow = {
  id:          string;
  name:        string;
  duration:    number;
  intervalMin: number;
  price:       number;
  description: string | null;
  sortOrder:   number;
  isActive:    boolean;
};

type Props = {
  services:   ServiceRow[];
  tenantId:   string;
  tenantSlug: string;
};

// ─────────────────────────────────────────────────────────────────────────────

const inputBase =
  "mt-1.5 block w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const inputNormal  = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputErrorCls = "border-red-300 bg-red-50/50";

// ─────────────────────────────────────────────────────────────────────────────

export function ServicesClient({ services: initialServices, tenantId, tenantSlug }: Props) {
  const [services, setServices]    = useState<ServiceRow[]>(initialServices);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<ServiceRow | null>(null);
  const [, startReorder] = useTransition();

  // サーバーからの再レンダ時に同期
  useEffect(() => { setServices(initialServices); }, [initialServices]);

  const visible = services; // スイッチで直接切替するため全件表示
  const inactiveCount = services.filter((s) => !s.isActive).length;

  function openCreate() { setEditTarget(null); setDialogMode("create"); }
  function openEdit(s: ServiceRow) { setEditTarget(s); setDialogMode("edit"); }
  function closeDialog() { setDialogMode(null); setEditTarget(null); }

  function moveService(id: string, direction: "up" | "down") {
    const idx = visible.findIndex((s) => s.id === id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === visible.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newVisible = [...visible];
    [newVisible[idx], newVisible[swapIdx]] = [newVisible[swapIdx], newVisible[idx]];

    const updates = newVisible.map((s, i) => ({ id: s.id, sortOrder: i * 10 }));
    const updateMap = new Map(updates.map((u) => [u.id, u.sortOrder]));

    // 楽観的更新
    const updated = services
      .map((s) => ({ ...s, sortOrder: updateMap.get(s.id) ?? s.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    setServices(updated);

    startReorder(async () => {
      const result = await reorderServices(updates, tenantId, tenantSlug);
      if (!result.success) toast.error(result.error ?? "並び替えに失敗しました");
    });
  }

  function handleToggle(id: string, next: boolean) {
    setServices((prev) =>
      prev.map((s) => s.id === id ? { ...s, isActive: next } : s)
    );
  }

  return (
    <div className="space-y-5">
      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">施術メニュー管理</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            施術メニューの一覧・登録・編集・停止・並び替えを管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
              停止中 {inactiveCount}件
            </span>
          )}
          <button
            type="button"
            onClick={openCreate}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--brand-medium)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)]"
          >
            <Plus size={15} />
            施術を追加
          </button>
        </div>
      </div>

      {/* ── テーブル ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {visible.length === 0 ? (
          <EmptyState onAdd={openCreate} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="w-16 px-3 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">順番</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">施術名</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <span className="flex items-center gap-1"><Clock size={11} />所要時間</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden lg:table-cell">
                    <span className="flex items-center gap-1"><Timer size={11} />インターバル</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <span className="flex items-center gap-1"><Banknote size={11} />料金</span>
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden md:table-cell">説明</th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">状態</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map((svc, idx) => (
                  <ServiceTableRow
                    key={svc.id}
                    svc={svc}
                    tenantId={tenantId}
                    tenantSlug={tenantSlug}
                    isFirst={idx === 0}
                    isLast={idx === visible.length - 1}
                    onEdit={() => openEdit(svc)}
                    onMove={(dir) => moveService(svc.id, dir)}
                    onToggle={handleToggle}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ダイアログ ── */}
      {dialogMode && (
        <ServiceDialog
          mode={dialogMode}
          initial={editTarget}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// テーブル行
// ─────────────────────────────────────────────────────────────────────────────

function ServiceTableRow({
  svc, tenantId, tenantSlug, isFirst, isLast, onEdit, onMove, onToggle,
}: {
  svc:        ServiceRow;
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
      const result = await toggleServiceStatus(svc.id, checked, tenantId, tenantSlug);
      if (!result.success) {
        toast.error(result.error ?? "状態の更新に失敗しました");
      } else {
        onToggle(svc.id, checked);
        toast.success("状態を更新しました");
      }
    });
  }

  return (
    <tr className={cn("group transition-colors hover:bg-gray-50/60", !svc.isActive && "opacity-50")}>
      {/* 並び替えボタン */}
      <td className="px-3 py-4">
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={isFirst}
            aria-label="上に移動"
            className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-20"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={isLast}
            aria-label="下に移動"
            className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-20"
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-bg)]">
            <Syringe size={14} className="text-[var(--brand-dark)]" />
          </div>
          <span className="font-medium text-gray-800">{svc.name}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-gray-600">{svc.duration}分</td>
      <td className="hidden px-5 py-4 text-gray-500 lg:table-cell">
        {svc.intervalMin > 0 ? `+${svc.intervalMin}分` : "—"}
      </td>
      <td className="px-5 py-4 font-medium text-gray-800">¥{svc.price.toLocaleString()}</td>
      <td className="hidden px-5 py-4 text-gray-500 md:table-cell max-w-[200px]">
        <span className="line-clamp-1">{svc.description ?? "—"}</span>
      </td>
      <td className="px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          {isPending ? (
            <Loader2 size={13} className="animate-spin text-gray-400" />
          ) : (
            <Switch
              checked={svc.isActive}
              onCheckedChange={handleSwitch}
              disabled={isPending}
              aria-label={svc.isActive ? "有効 — クリックで停止" : "停止中 — クリックで有効化"}
            />
          )}
          <span className={cn(
            "text-xs font-medium",
            svc.isActive ? "text-emerald-600" : "text-gray-400"
          )}>
            {svc.isActive ? "有効" : "停止"}
          </span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            aria-label="編集"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]"
          >
            <Pencil size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 作成 / 編集 ダイアログ
// ─────────────────────────────────────────────────────────────────────────────

function ServiceDialog({
  mode, initial, tenantId, tenantSlug, onClose,
}: {
  mode:      "create" | "edit";
  initial:   ServiceRow | null;
  tenantId:  string;
  tenantSlug: string;
  onClose:   () => void;
}) {
  const action = mode === "create" ? createService : updateService;
  const [state, formAction, isPending] = useActionState<ServiceFormState, FormData>(action, null);
  const errors = state?.errors;

  useEffect(() => {
    if (state?.success) {
      toast.success(mode === "create" ? "施術を登録しました" : "施術情報を更新しました");
      onClose();
    }
  }, [state?.success, mode, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <Syringe size={15} />
            </div>
            <p className="text-sm font-semibold text-[var(--brand-darker)]">
              {mode === "create" ? "施術を追加" : "施術を編集"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <form action={formAction} className="divide-y divide-gray-50 px-6">
          {initial && <input type="hidden" name="serviceId" value={initial.id} />}

          {errors?.general && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mt-4 text-sm text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{errors.general}</span>
            </div>
          )}

          {/* 施術名 */}
          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700">
              施術名 <span className="text-xs text-red-500">必須</span>
            </label>
            <input name="name" type="text" defaultValue={initial?.name ?? ""}
              placeholder="例: 整体コース" className={cn(inputBase, errors?.name ? inputErrorCls : inputNormal)} />
            {errors?.name && <FieldError msg={errors.name} />}
          </div>

          {/* 所要時間 + インターバル + 料金 */}
          <div className="py-4 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                所要時間（分） <span className="text-xs text-red-500">必須</span>
              </label>
              <div className="relative">
                <input name="duration" type="number" min="1" max="480"
                  defaultValue={initial?.duration ?? ""}
                  placeholder="60"
                  className={cn(inputBase, "pr-8", errors?.duration ? inputErrorCls : inputNormal)} />
                <span className="absolute right-3 top-1/2 mt-0.5 translate-y-0 text-xs text-gray-400">分</span>
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
                <span className="absolute right-3 top-1/2 mt-0.5 translate-y-0 text-xs text-gray-400">分</span>
              </div>
              {errors?.intervalMin && <FieldError msg={errors.intervalMin} />}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                料金（円） <span className="text-xs text-red-500">必須</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 text-xs text-gray-400">¥</span>
                <input name="price" type="number" min="0"
                  defaultValue={initial?.price ?? ""}
                  placeholder="5000"
                  className={cn(inputBase, "pl-7", errors?.price ? inputErrorCls : inputNormal)} />
              </div>
              {errors?.price && <FieldError msg={errors.price} />}
            </div>
          </div>

          {/* インターバル説明 */}
          <p className="pb-2 -mt-2 text-xs text-gray-400">
            ※ インターバルは「次の予約までの準備時間」です。予約枠の計算に含まれますが、お客様への表示には含まれません。
          </p>

          {/* 説明 */}
          <div className="py-4">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <FileText size={13} className="text-gray-400" />
              説明 <span className="text-xs text-gray-400">任意</span>
            </label>
            <textarea name="description" rows={3}
              defaultValue={initial?.description ?? ""}
              placeholder="患者向けの施術説明・注意事項など"
              className={cn(inputBase, inputNormal, "resize-none")} />
          </div>

          {/* ボタン */}
          <div className="flex items-center justify-end gap-3 py-4">
            <button type="button" onClick={onClose}
              className="flex h-10 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 hover:bg-gray-50">
              キャンセル
            </button>
            <button type="submit" disabled={isPending}
              className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-dark)] disabled:opacity-60">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Syringe size={14} />}
              {mode === "create" ? "追加する" : "保存する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-bg)]">
        <Syringe size={24} className="text-[var(--brand-medium)]" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">施術メニューが登録されていません</p>
      <p className="mt-1 text-xs text-gray-400">「施術を追加」ボタンから最初のメニューを登録してください</p>
      <button type="button" onClick={onAdd}
        className="mt-5 flex h-9 items-center gap-1.5 rounded-xl bg-[var(--brand-medium)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
        <Plus size={14} />施術を追加
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
