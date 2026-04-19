"use client";

/**
 * ダッシュボード「直近の予約」リスト — クライアントコンポーネント
 *
 * 各行に編集・削除ボタンを持ち、チェックボックスによる一括削除も可能。
 * CLAUDE.md 規約: tenantId / tenantSlug はサーバーから Props 経由で渡す。
 */

import { useState, useCallback } from "react";
import {
  CalendarDays, Clock, Pencil, Trash2, CheckSquare, Square,
  Loader2, AlertCircle,
} from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { NewAppointmentDialog, type EditModeData, type BusinessHourData, type ServiceItem, type ExerciseItem } from "@/components/appointments/NewAppointmentDialog";
import { deleteAppointment, bulkDeleteAppointments } from "@/app/[tenantId]/appointments/delete-action";
import { cn } from "@/lib/utils";

type Staff = { id: string; displayName: string };

export type DashboardAppointment = {
  id:          string;
  status:      AppointmentStatus;
  startAt:     string; // ISO string
  durationMin: number;
  menuName:    string;
  price:       number;
  patientId:   string;
  patientName: string;
  staffName:   string | null;
  note:        string | null;
};

type Props = {
  tenantId:         string;
  tenantSlug:       string;
  appointments:     DashboardAppointment[];
  staffList:        Staff[];
  businessHours:    BusinessHourData[];
  lunchStartTime:   string | null;
  lunchEndTime:     string | null;
  slotInterval:     number;
  services?:        ServiceItem[];
  exercises?:       ExerciseItem[];
  isProfessional?:  boolean;
  trainingEnabled?: boolean;
};

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; cls: string }> = {
  pending:   { label: "承認待ち", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmed: { label: "確定",     cls: "bg-[var(--brand-bg)] text-[var(--brand-dark)] border-[var(--brand-border)]" },
  cancelled: { label: "キャンセル", cls: "bg-gray-50 text-gray-500 border-gray-200" },
  rejected:  { label: "予約不可",   cls: "bg-red-50 text-red-600 border-red-300" },
  no_show:   { label: "無断欠席", cls: "bg-red-50 text-red-600 border-red-200" },
  completed: { label: "完了",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function formatRelativeTime(isoStr: string): string {
  const date = new Date(isoStr);
  const now   = new Date();
  const diffMs    = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays  = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 0)  return "終了";
  if (diffHours < 1)  return "まもなく";
  if (diffHours < 24) return `${diffHours}時間後`;
  if (diffDays === 1) return "明日";
  return `${diffDays}日後`;
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function toEditModeData(appt: DashboardAppointment): EditModeData {
  const start = new Date(appt.startAt);
  return {
    appointmentId: appt.id,
    patientId:     appt.patientId,
    patientName:   appt.patientName,
    date: [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, "0"),
      String(start.getDate()).padStart(2, "0"),
    ].join("-"),
    time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
    menuName:    appt.menuName,
    durationMin: appt.durationMin,
    price:       appt.price,
    staffId:     null,
    note:        appt.note,
  };
}

export function DashboardUpcomingList({
  tenantId,
  tenantSlug,
  appointments: initialAppointments,
  staffList,
  businessHours,
  lunchStartTime,
  lunchEndTime,
  slotInterval,
  services,
  exercises,
  isProfessional,
  trainingEnabled,
}: Props) {
  const [appts,          setAppts]         = useState(initialAppointments);
  const [editTarget,     setEditTarget]    = useState<EditModeData | null>(null);
  const [deletingId,     setDeletingId]    = useState<string | null>(null);
  const [confirmId,      setConfirmId]     = useState<string | null>(null);
  const [selectedIds,    setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkDeleting,   setBulkDeleting]  = useState(false);
  const [error,          setError]         = useState<string | null>(null);

  const editableStatuses: AppointmentStatus[] = ["pending", "confirmed"];

  // ── 1件削除 ──
  const handleDelete = useCallback(async (apptId: string) => {
    setDeletingId(apptId);
    setError(null);
    const prev = appts;
    setAppts((a) => a.filter((x) => x.id !== apptId));
    const result = await deleteAppointment(apptId, tenantSlug);
    if (!result.success) {
      setAppts(prev);
      setError(result.error ?? "削除に失敗しました。");
    }
    setDeletingId(null);
    setConfirmId(null);
    setSelectedIds((s) => { const n = new Set(s); n.delete(apptId); return n; });
  }, [appts, tenantSlug]);

  // ── 一括削除 ──
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setError(null);
    const ids  = Array.from(selectedIds);
    const prev = appts;
    setAppts((a) => a.filter((x) => !selectedIds.has(x.id)));
    const result = await bulkDeleteAppointments(ids, tenantSlug);
    if (!result.success) {
      setAppts(prev);
      setError(result.error ?? "一括削除に失敗しました。");
    }
    setSelectedIds(new Set());
    setBulkDeleting(false);
  }, [appts, selectedIds, tenantSlug]);

  // ── チェックボックス ──
  const toggleSelect = (id: string) => {
    setSelectedIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectableAppts = appts.filter((a) => editableStatuses.includes(a.status));
  const allSelected = selectableAppts.length > 0 && selectableAppts.every((a) => selectedIds.has(a.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAppts.map((a) => a.id)));
    }
  };

  if (appts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CalendarDays size={40} className="text-gray-200" />
        <p className="mt-3 text-sm font-medium text-gray-400">直近の予約はありません</p>
        <p className="mt-1 text-xs text-gray-300">予約一覧から新規予約を作成してください</p>
      </div>
    );
  }

  return (
    <>
      {/* エラーバナー */}
      {error && (
        <div className="mx-6 mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 一括操作バー */}
      {selectedIds.size > 0 && (
        <div className="mx-6 mb-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="text-sm font-medium text-amber-700">
            {selectedIds.size}件を選択中
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            {bulkDeleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            一括削除
          </button>
        </div>
      )}

      {/* リスト */}
      <div className="divide-y divide-gray-50">
        {appts.map((appt) => {
          const isEditable  = editableStatuses.includes(appt.status);
          const isConfirm   = confirmId === appt.id;
          const isDeleting  = deletingId === appt.id;
          const isSelected  = selectedIds.has(appt.id);
          const badge       = STATUS_CONFIG[appt.status];

          return (
            <div
              key={appt.id}
              className={cn(
                "flex items-center gap-3 px-6 py-4 transition-colors",
                isSelected ? "bg-amber-50/50" : "hover:bg-[var(--brand-hover)]"
              )}
            >
              {/* チェックボックス（編集可能ステータスのみ）*/}
              <div className="shrink-0">
                {isEditable ? (
                  <button
                    type="button"
                    onClick={() => toggleSelect(appt.id)}
                    aria-label={isSelected ? "選択解除" : "選択"}
                    className="flex h-5 w-5 items-center justify-center text-gray-400 hover:text-[var(--brand)]"
                  >
                    {isSelected
                      ? <CheckSquare size={16} className="text-[var(--brand)]" />
                      : <Square size={16} />
                    }
                  </button>
                ) : (
                  <div className="h-5 w-5" />
                )}
              </div>

              {/* 日時 */}
              <div className="w-20 shrink-0 text-center">
                <p className="text-xs font-semibold text-[var(--brand-dark)]">
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

              {/* ステータスバッジ */}
              <span className={cn("shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", badge.cls)}>
                {badge.label}
              </span>

              {/* 操作ボタン（編集可能ステータスのみ）*/}
              {isEditable && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditTarget(toEditModeData(appt))}
                    aria-label="編集"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]"
                  >
                    <Pencil size={14} />
                  </button>

                  {isConfirm ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(appt.id)}
                      disabled={isDeleting}
                      aria-label="削除確認"
                      className="flex h-8 items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
                    >
                      {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      削除
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(appt.id)}
                      aria-label="削除"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      onBlur={() => setConfirmId((c) => c === appt.id ? null : c)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 全選択コントロール */}
      {selectableAppts.length > 1 && (
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

      {/* 編集ダイアログ */}
      {editTarget && (
        <NewAppointmentDialog
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          staffList={staffList}
          businessHours={businessHours}
          lunchStartTime={lunchStartTime}
          lunchEndTime={lunchEndTime}
          slotInterval={slotInterval}
          editMode={editTarget}
          services={services}
          exercises={exercises}
          isProfessional={isProfessional}
          trainingEnabled={trainingEnabled}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  );
}
