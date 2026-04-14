"use client";

/**
 * 予約履歴セクション + 新規予約ダイアログ起動ボタン
 */

import { useState } from "react";
import { CalendarPlus, CalendarDays, Clock, ChevronRight } from "lucide-react";
import { NewAppointmentDialog, type BusinessHourData } from "@/components/appointments/NewAppointmentDialog";
import { cn } from "@/lib/utils";

type Staff = { id: string; displayName: string };

type Appointment = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "no_show" | "completed";
  startAt: Date;
  menuName: string;
  durationMin: number;
  price: number;
  staff: { displayName: string } | null;
};

type Props = {
  tenantId:       string;
  tenantSlug:     string;
  patientId:      string;
  staffList:      Staff[];
  appointments:   Appointment[];
  businessHours:  BusinessHourData[];
  lunchStartTime: string | null;
  lunchEndTime:   string | null;
  slotInterval:   number;
};

const STATUS_CONFIG: Record<
  Appointment["status"],
  { label: string; bg: string; text: string; border: string }
> = {
  pending:   { label: "仮受付",     bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
  confirmed: { label: "確定",       bg: "bg-[var(--brand-bg)]", text: "text-[var(--brand-dark)]", border: "border-[var(--brand-border)]" },
  completed: { label: "完了",       bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  cancelled: { label: "キャンセル", bg: "bg-gray-50",    text: "text-gray-500",    border: "border-gray-200" },
  no_show:   { label: "無断欠席",   bg: "bg-red-50",     text: "text-red-600",     border: "border-red-200" },
};

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "short", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

export function AppointmentSection({
  tenantId,
  tenantSlug,
  patientId,
  staffList,
  appointments,
  businessHours,
  lunchStartTime,
  lunchEndTime,
  slotInterval,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      {/* セクションヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-[var(--brand-medium)]" />
          <h2 className="text-sm font-semibold text-gray-800">
            予約履歴
            <span className="ml-2 font-normal text-gray-400">({appointments.length}件)</span>
          </h2>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 text-xs font-medium text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-hover)]"
        >
          <CalendarPlus size={13} />
          新規予約を追加
        </button>
      </div>

      {/* 予約リスト */}
      {appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-10 text-center">
          <CalendarDays size={32} className="text-gray-200" />
          <p className="mt-3 text-sm font-medium text-gray-400">予約はまだありません</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--brand-dark)] underline-offset-2 hover:underline"
          >
            <CalendarPlus size={12} />
            最初の予約を追加する
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="divide-y divide-gray-50">
            {appointments.map((appt) => {
              const s = STATUS_CONFIG[appt.status];
              return (
                <div key={appt.id} className="flex items-center gap-4 px-5 py-3.5">
                  {/* ステータスバッジ */}
                  <span className={cn(
                    "shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    s.bg, s.text, s.border
                  )}>
                    {s.label}
                  </span>

                  {/* 日時・メニュー */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{appt.menuName}</p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {formatDateTime(appt.startAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {appt.durationMin}分
                      </span>
                    </div>
                  </div>

                  {appt.staff && (
                    <span className="shrink-0 text-xs text-gray-400">{appt.staff.displayName}</span>
                  )}
                  <span className="shrink-0 text-sm font-semibold text-gray-700">
                    ¥{appt.price.toLocaleString()}
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-gray-300" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ダイアログ */}
      {dialogOpen && (
        <NewAppointmentDialog
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          patientId={patientId}
          staffList={staffList}
          businessHours={businessHours}
          lunchStartTime={lunchStartTime}
          lunchEndTime={lunchEndTime}
          slotInterval={slotInterval}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
