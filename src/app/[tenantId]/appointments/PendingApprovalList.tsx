"use client";

/**
 * 承認待ちリスト — 一括承認UI（Client Component）
 *
 * - チェックボックスによる複数選択
 * - 「すべて選択」「選択件数を承認」「全件一括承認」ボタン
 * - 承認完了後に Sonner toast で件数フィードバック
 */

import { useState, useTransition } from "react";
import { CheckSquare, Square, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppointmentListCard, type ListAppointment } from "./AppointmentListCard";
import { bulkApproveAppointments } from "./actions";
import type { BusinessHourData } from "@/components/appointments/WeeklyCalendar";

type Staff = { id: string; displayName: string };

type Props = {
  appointments:   ListAppointment[];
  slug:           string;
  tenantId:       string;
  staffList:      Staff[];
  businessHours:  BusinessHourData[];
  slotInterval:   number;
};

export function PendingApprovalList({
  appointments,
  slug,
  tenantId,
  staffList,
  businessHours,
  slotInterval,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending,   startTransition] = useTransition();

  const allIds      = appointments.map((a) => a.id);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(isAllSelected ? new Set() : new Set(allIds));
  }

  function handleBulkApprove(ids: string[]) {
    if (ids.length === 0) return;

    startTransition(async () => {
      const result = await bulkApproveAppointments(ids, tenantId, slug);

      if (result.success) {
        setSelectedIds(new Set());
        toast.success(`${result.approvedCount}件の予約を承認しました`, {
          description: "患者へ確定通知が送信されます",
          duration:    4000,
        });
      } else {
        toast.error("一括承認に失敗しました", {
          description: result.error,
          duration:    5000,
        });
      }
    });
  }

  if (appointments.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* ── アクションバー ── */}
      <div className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm",
        selectedCount > 0 ? "border-emerald-200 bg-emerald-50/60" : "border-gray-100"
      )}>
        {/* すべて選択チェックボックス */}
        <button
          type="button"
          onClick={toggleSelectAll}
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
        >
          {isAllSelected
            ? <CheckSquare size={18} className="text-emerald-500" />
            : <Square      size={18} className="text-gray-400" />
          }
          すべて選択
        </button>

        <div className="h-4 w-px bg-gray-200" />

        {/* 選択件数を承認ボタン */}
        <button
          type="button"
          onClick={() => handleBulkApprove([...selectedIds])}
          disabled={selectedCount === 0 || isPending}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
            selectedCount > 0 && !isPending
              ? "bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 active:scale-[0.98]"
              : "cursor-not-allowed bg-gray-100 text-gray-400"
          )}
        >
          {isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CheckCheck size={15} />
          )}
          選択した{selectedCount > 0 ? `${selectedCount}件を` : "項目を"}承認
        </button>

        {/* 全件一括承認ボタン */}
        <button
          type="button"
          onClick={() => handleBulkApprove(allIds)}
          disabled={isPending || appointments.length === 0}
          className={cn(
            "ml-auto flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
            !isPending
              ? "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 active:scale-[0.98]"
              : "cursor-not-allowed border-gray-200 text-gray-400"
          )}
        >
          {isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CheckCheck size={15} />
          )}
          全{appointments.length}件を一括承認
        </button>
      </div>

      {/* ── カードリスト ── */}
      {appointments.map((appt, index) => (
        <AppointmentListCard
          key={appt.id}
          appt={appt}
          index={index}
          slug={slug}
          tenantId={tenantId}
          tenantSlug={slug}
          staffList={staffList}
          businessHours={businessHours}
          slotInterval={slotInterval}
          selectable
          selected={selectedIds.has(appt.id)}
          onToggleSelect={toggleSelect}
        />
      ))}
    </div>
  );
}
