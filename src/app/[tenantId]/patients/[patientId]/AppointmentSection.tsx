"use client";

/**
 * 予約履歴セクション + 新規予約ダイアログ起動ボタン
 *
 * 【変更点】
 * - 「これから（Upcoming）」と「通院履歴（Past）」のタブ切替
 * - マイページと同じパステルカラーステータスバッジ
 * - 左側にカレンダー風バッジを配置したカード型デザイン
 */

import { useState } from "react";
import {
  CalendarPlus, CalendarDays, Clock, CheckCircle2,
  XCircle, HourglassIcon, User, ChevronRight,
} from "lucide-react";
import { NewAppointmentDialog, type BusinessHourData, type ServiceItem, type ExerciseItem } from "@/components/appointments/NewAppointmentDialog";
import { cn } from "@/lib/utils";

type Staff = { id: string; displayName: string };

export type Appointment = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "rejected" | "no_show" | "completed";
  startAt: Date;
  menuName: string;
  durationMin: number;
  price: number;
  staff: {
    name: string;
  } | null;
};

type Props = {
  tenantId:         string;
  tenantSlug:       string;
  patientId:        string;
  staffList:        Staff[];
  appointments:     Appointment[];
  businessHours:    BusinessHourData[];
  lunchStartTime:   string | null;
  lunchEndTime:     string | null;
  slotInterval:     number;
  services?:        ServiceItem[];
  exercises?:       ExerciseItem[];
  isProfessional?:  boolean;
  trainingEnabled?: boolean;
};

// ── 定数 ─────────────────────────────────────────────────────────────

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const STATUS_CONFIG = {
  confirmed: { label: "確定",       icon: CheckCircle2,  cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  pending:   { label: "仮受付",     icon: HourglassIcon, cls: "text-amber-700 bg-amber-50 border-amber-200" },
  completed: { label: "完了",       icon: CheckCircle2,  cls: "text-gray-500 bg-gray-50 border-gray-200" },
  cancelled: { label: "キャンセル", icon: XCircle,       cls: "text-red-500 bg-red-50 border-red-200" },
  rejected:  { label: "予約不可",   icon: XCircle,       cls: "text-red-600 bg-red-50 border-red-300" },
  no_show:   { label: "無断欠席",   icon: XCircle,       cls: "text-rose-600 bg-rose-50 border-rose-200" },
} as const;

// ── メインコンポーネント ───────────────────────────────────────────────

export function AppointmentSection({
  tenantId, tenantSlug, patientId, staffList, appointments,
  businessHours, lunchStartTime, lunchEndTime, slotInterval,
  services, exercises, isProfessional, trainingEnabled,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // 今日の日時基準で仕分け
  const now = new Date();
  
  const upcoming = appointments
    .filter((a) => a.startAt >= now && a.status !== "cancelled" && a.status !== "no_show")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime()); // 直近が一番上

  const past = appointments
    .filter((a) => a.startAt < now || a.status === "cancelled" || a.status === "no_show")
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime()); // 最近終わったものが一番上

  const [tab, setTab] = useState<"upcoming" | "past">(upcoming.length > 0 ? "upcoming" : "past");
  const displayItems = tab === "upcoming" ? upcoming : past;

  return (
    <>
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
        <div className="space-y-4">
          {/* タブ切り替え */}
          <nav className="flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
            <TabButton
              active={tab === "upcoming"}
              label="これから"
              count={upcoming.length}
              onClick={() => setTab("upcoming")}
            />
            <TabButton
              active={tab === "past"}
              label="通院履歴"
              count={past.length}
              onClick={() => setTab("past")}
            />
          </nav>

          {/* リスト表示 */}
          {displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-12 text-center shadow-sm">
              <CalendarDays size={24} className="text-gray-200" />
              <p className="mt-3 text-sm text-gray-400">
                {tab === "upcoming" ? "予定されている予約はありません" : "通院履歴はありません"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayItems.map((appt, i) => (
                <AppointmentCard
                  key={appt.id}
                  appt={appt}
                  isFirstUpcoming={tab === "upcoming" && i === 0}
                />
              ))}
            </div>
          )}
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
          services={services}
          exercises={exercises}
          isProfessional={isProfessional}
          trainingEnabled={trainingEnabled}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

// ── サブコンポーネント ──────────────────────────────────────────────

function TabButton({
  active, label, count, onClick,
}: {
  active: boolean; label: string; count: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-all",
        active
          ? "bg-white text-[var(--brand-dark)] shadow-sm"
          : "text-gray-500 hover:text-gray-700"
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 py-px text-[10px] font-bold",
            active ? "bg-[var(--brand-bg)] text-[var(--brand-darker)]" : "bg-gray-200 text-gray-500"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function AppointmentCard({
  appt, isFirstUpcoming,
}: {
  appt: Appointment; isFirstUpcoming: boolean;
}) {
  const startAt = new Date(appt.startAt);
  const endAt   = new Date(startAt.getTime() + appt.durationMin * 60000);

  const month = startAt.getMonth() + 1;
  const day   = startAt.getDate();
  const dow   = DOW_JA[startAt.getDay()];
  const pad   = (n: number) => String(n).padStart(2, "0");
  const time  = `${pad(startAt.getHours())}:${pad(startAt.getMinutes())}`;
  const endTm = `${pad(endAt.getHours())}:${pad(endAt.getMinutes())}`;

  const cfg = STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.completed;
  const StatusIcon = cfg.icon;

  return (
    <div
      className={cn(
        "group flex overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md",
        isFirstUpcoming
          ? "border-[var(--brand-border)] ring-1 ring-[var(--brand-border)]/50"
          : "border-gray-100"
      )}
    >
      {/* ── 左側: カレンダーバッジ ── */}
      <div
        className={cn(
          "flex w-[72px] shrink-0 flex-col items-center justify-center border-r p-2",
          isFirstUpcoming
            ? "border-[var(--brand-border)] bg-[var(--brand-bg)]/30"
            : "border-gray-50 bg-gray-50/50"
        )}
      >
        <span
          className={cn(
            "text-[10px] font-bold",
            isFirstUpcoming ? "text-[var(--brand-darker)]" : "text-gray-400"
          )}
        >
          {month}月
        </span>
        <span
          className={cn(
            "my-0.5 text-2xl font-black leading-none tracking-tight",
            isFirstUpcoming ? "text-[var(--brand-dark)]" : "text-gray-700"
          )}
        >
          {day}
        </span>
        <span
          className={cn(
            "text-[10px] font-semibold",
            isFirstUpcoming ? "text-[var(--brand-dark)]" : "text-gray-400"
          )}
        >
          {dow}
        </span>
      </div>

      {/* ── 右側: 詳細 ── */}
      <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
        {/* 上段: ステータスと料金 */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              cfg.cls
            )}
          >
            <StatusIcon size={10} />
            {cfg.label}
          </div>
          {appt.price > 0 && (
            <span className="shrink-0 text-sm font-bold tabular-nums text-gray-700">
              ¥{appt.price.toLocaleString()}
            </span>
          )}
        </div>

        {/* 中段: メニュー名 */}
        <p
          className={cn(
            "truncate font-bold text-gray-800",
            isFirstUpcoming ? "text-base" : "text-sm"
          )}
        >
          {appt.menuName}
        </p>

        {/* 下段: 時間とスタッフ */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-gray-400" />
            <span className="font-mono font-medium text-gray-600">
              {time} <span className="text-gray-400">〜</span> {endTm}
            </span>
          </div>
          {appt.staff && (
            <div className="flex items-center gap-1.5">
              <User size={12} className="text-gray-400" />
              <span className="font-medium text-gray-600">{appt.staff.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
