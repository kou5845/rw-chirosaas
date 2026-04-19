"use client";

/**
 * ダッシュボード「承認待ち」リスト — クライアントコンポーネント
 *
 * 機能:
 *   - 承認待ち予約の一覧表示
 *   - 個別承認・個別削除
 *   - チェックボックスによる複数選択 → 一括承認 / 一括削除
 *   - ヘッダーの「一括承認」ボタン（全件一気に承認）
 */

import { useState, useCallback, useTransition } from "react";
import {
  CheckCircle2, Trash2, CheckSquare, Square,
  Loader2, AlertCircle, CheckCheck, X,
} from "lucide-react";
import { bulkApproveAppointments, rejectAppointment } from "@/app/[tenantId]/appointments/actions";
import { deleteAppointment, bulkDeleteAppointments } from "@/app/[tenantId]/appointments/delete-action";
import { cn } from "@/lib/utils";

export type PendingAppointment = {
  id:          string;
  startAt:     string; // ISO string
  durationMin: number;
  menuName:    string;
  patientId:   string;
  patientName: string;
  staffName:   string | null;
};

type Props = {
  tenantId:   string;
  tenantSlug: string;
  appointments: PendingAppointment[];
};

function formatRelativeTime(isoStr: string): string {
  const date     = new Date(isoStr);
  const now      = new Date();
  const diffMs   = date.getTime() - now.getTime();
  const diffH    = Math.round(diffMs / (1000 * 60 * 60));
  const diffD    = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffH < 0)  return "終了";
  if (diffH < 1)  return "まもなく";
  if (diffH < 24) return `${diffH}時間後`;
  if (diffD === 1) return "明日";
  return `${diffD}日後`;
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function DashboardPendingList({ tenantId, tenantSlug, appointments: initial }: Props) {
  const [appts,        setAppts]       = useState(initial);
  const [selectedIds,  setSelectedIds] = useState<Set<string>>(new Set());
  const [approvingId,  setApprovingId] = useState<string | null>(null);
  const [rejectingId,  setRejectingId] = useState<string | null>(null);
  const [deletingId,   setDeletingId]  = useState<string | null>(null);
  const [confirmId,    setConfirmId]   = useState<string | null>(null);
  const [error,        setError]       = useState<string | null>(null);

  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkDeleting,  setBulkDeleting]  = useState(false);
  const [, startTransition] = useTransition();

  // ── 個別承認 ──────────────────────────────────────────────────────
  const handleApprove = useCallback(async (apptId: string) => {
    setApprovingId(apptId);
    setError(null);
    const prev = appts;
    setAppts((a) => a.filter((x) => x.id !== apptId));
    setSelectedIds((s) => { const n = new Set(s); n.delete(apptId); return n; });

    const result = await bulkApproveAppointments([apptId], tenantId, tenantSlug);
    if (!result.success) {
      setAppts(prev);
      setError("error" in result ? result.error : "承認に失敗しました。");
    }
    setApprovingId(null);
  }, [appts, tenantId, tenantSlug]);

  // ── お断り ────────────────────────────────────────────────────────
  const handleReject = useCallback(async (apptId: string) => {
    const ok = window.confirm("この予約をお断りしますか？\n患者へお断りの通知が送信されます。");
    if (!ok) return;
    setRejectingId(apptId);
    setError(null);
    const fd = new FormData();
    fd.set("appointmentId", apptId);
    fd.set("tenantId",      tenantId);
    fd.set("tenantSlug",    tenantSlug);
    startTransition(async () => {
      const result = await rejectAppointment(null, fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setAppts((a) => a.filter((x) => x.id !== apptId));
        setSelectedIds((s) => { const n = new Set(s); n.delete(apptId); return n; });
      }
      setRejectingId(null);
    });
  }, [tenantId, tenantSlug]);

  // ── 個別削除 ──────────────────────────────────────────────────────
  const handleDelete = useCallback(async (apptId: string) => {
    setDeletingId(apptId);
    setError(null);
    const prev = appts;
    setAppts((a) => a.filter((x) => x.id !== apptId));
    setSelectedIds((s) => { const n = new Set(s); n.delete(apptId); return n; });

    const result = await deleteAppointment(apptId, tenantSlug);
    if (!result.success) {
      setAppts(prev);
      setError(result.error ?? "削除に失敗しました。");
    }
    setDeletingId(null);
    setConfirmId(null);
  }, [appts, tenantSlug]);

  // ── 選択一括承認 ─────────────────────────────────────────────────
  const handleBulkApprove = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setBulkApproving(true);
    setError(null);
    const prev = appts;
    const idSet = new Set(ids);
    setAppts((a) => a.filter((x) => !idSet.has(x.id)));
    setSelectedIds(new Set());

    const result = await bulkApproveAppointments(ids, tenantId, tenantSlug);
    if (!result.success) {
      setAppts(prev);
      setError("error" in result ? result.error : "一括承認に失敗しました。");
    }
    setBulkApproving(false);
  }, [appts, tenantId, tenantSlug]);

  // ── 選択一括削除 ─────────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setError(null);
    const ids  = Array.from(selectedIds);
    const prev = appts;
    setAppts((a) => a.filter((x) => !selectedIds.has(x.id)));
    setSelectedIds(new Set());

    const result = await bulkDeleteAppointments(ids, tenantSlug);
    if (!result.success) {
      setAppts(prev);
      setError(result.error ?? "一括削除に失敗しました。");
    }
    setBulkDeleting(false);
  }, [appts, selectedIds, tenantSlug]);

  // ── チェックボックス ─────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const allSelected = appts.length > 0 && appts.every((a) => selectedIds.has(a.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(appts.map((a) => a.id)));
    }
  };

  if (appts.length === 0) return null;

  const selectedArray = Array.from(selectedIds);
  const hasSelection  = selectedArray.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">

      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/60 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <AlertCircle size={16} className="text-amber-600" />
          <h2 className="text-sm font-semibold text-amber-800">承認待ち</h2>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
            {appts.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => handleBulkApprove(appts.map((a) => a.id))}
          disabled={bulkApproving || bulkDeleting}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          {bulkApproving && !hasSelection ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCheck size={12} />
          )}
          一括承認
        </button>
      </div>

      {/* エラーバナー */}
      {error && (
        <div className="mx-6 mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 選択中の一括操作バー */}
      {hasSelection && (
        <div className="mx-6 mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="text-sm font-medium text-amber-700">
            {selectedArray.length}件を選択中
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkApprove(selectedArray)}
              disabled={bulkApproving || bulkDeleting}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-bg)] disabled:opacity-60"
            >
              {bulkApproving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              選択を承認
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkApproving || bulkDeleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
            >
              {bulkDeleting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              選択を削除
            </button>
          </div>
        </div>
      )}

      {/* リスト */}
      <div className="divide-y divide-gray-50">
        {appts.map((appt) => {
          const isApproving = approvingId === appt.id;
          const isRejecting = rejectingId === appt.id;
          const isDeleting  = deletingId  === appt.id;
          const isConfirm   = confirmId   === appt.id;
          const isSelected  = selectedIds.has(appt.id);
          const isLoading   = isApproving || isRejecting || isDeleting;

          return (
            <div
              key={appt.id}
              className={cn(
                "flex items-center gap-3 px-6 py-4 transition-colors",
                isSelected ? "bg-amber-50/50" : "hover:bg-gray-50/60"
              )}
            >
              {/* チェックボックス */}
              <button
                type="button"
                onClick={() => toggleSelect(appt.id)}
                aria-label={isSelected ? "選択解除" : "選択"}
                disabled={isLoading}
                className="shrink-0 flex h-5 w-5 items-center justify-center text-gray-400 hover:text-[var(--brand)] disabled:opacity-40"
              >
                {isSelected
                  ? <CheckSquare size={16} className="text-[var(--brand)]" />
                  : <Square size={16} />
                }
              </button>

              {/* 日時 */}
              <div className="w-20 shrink-0 text-center">
                <p className="text-xs font-semibold text-amber-600">
                  {formatRelativeTime(appt.startAt)}
                </p>
                <p className="mt-0.5 text-lg font-bold text-gray-800">
                  {formatTime(appt.startAt)}
                </p>
                <p className="text-[10px] text-gray-400">{appt.durationMin}分</p>
              </div>

              {/* 区切り線 */}
              <div className="h-10 w-px shrink-0 bg-gray-100" />

              {/* 患者・メニュー */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800">{appt.patientName}</p>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {appt.menuName}
                  {appt.staffName && (
                    <span className="ml-2 text-gray-400">/ {appt.staffName}</span>
                  )}
                </p>
              </div>

              {/* 承認ボタン */}
              <button
                type="button"
                onClick={() => handleApprove(appt.id)}
                disabled={isLoading || bulkApproving || bulkDeleting}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand)] hover:text-white disabled:opacity-50"
              >
                {isApproving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                承認
              </button>

              {/* お断りボタン */}
              <button
                type="button"
                onClick={() => handleReject(appt.id)}
                disabled={isLoading || bulkApproving || bulkDeleting}
                aria-label="お断り"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                {isRejecting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <X size={12} strokeWidth={2.5} />
                )}
                お断り
              </button>

              {/* 削除ボタン */}
              {isConfirm ? (
                <button
                  type="button"
                  onClick={() => handleDelete(appt.id)}
                  disabled={isLoading}
                  aria-label="削除確認"
                  className="flex shrink-0 h-8 items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
                >
                  {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  削除
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(appt.id)}
                  disabled={isLoading || bulkApproving || bulkDeleting}
                  aria-label="削除"
                  className="flex shrink-0 h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  onBlur={() => setConfirmId((c) => c === appt.id ? null : c)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 全選択コントロール */}
      {appts.length > 1 && (
        <div className="flex items-center justify-end border-t border-gray-50 px-6 py-3">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
          >
            {allSelected ? <CheckSquare size={13} className="text-[var(--brand)]" /> : <Square size={13} />}
            {allSelected ? "全選択解除" : "全て選択"}
          </button>
        </div>
      )}
    </div>
  );
}
