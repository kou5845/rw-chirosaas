"use client";

/**
 * 予約リストビュー — 1枚のカード（クライアントコンポーネント）
 *
 * 編集ボタン・削除ボタン（2段階確認）を持つ。
 * CLAUDE.md 規約: tenantId / tenantSlug はサーバーから Props 経由で渡す。
 */

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, Loader2, UserCheck } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { NewAppointmentDialog, type EditModeData, type BusinessHourData, type ServiceItem, type ExerciseItem } from "@/components/appointments/NewAppointmentDialog";
import { deleteAppointment } from "@/app/[tenantId]/appointments/delete-action";
import { AppointmentConfirmForm } from "@/components/appointments/AppointmentConfirmForm";
import { cn } from "@/lib/utils";
import { getInitial } from "@/lib/format";

type Staff = { id: string; displayName: string };

export type ListAppointment = {
  id:          string;
  status:      AppointmentStatus;
  startAt:     Date;
  endAt:       Date;
  durationMin: number;
  menuName:    string;
  price:       number;
  note:        string | null;
  patientId:   string;
  patientName: string;
  staffName:   string | null;
};

type Props = {
  appt:             ListAppointment;
  index:            number;
  slug:             string;
  tenantId:         string;
  tenantSlug:       string;
  staffList:        Staff[];
  businessHours:    BusinessHourData[];
  lunchStartTime:   string | null;
  lunchEndTime:     string | null;
  slotInterval:     number;
  services?:        ServiceItem[];
  exercises?:       ExerciseItem[];
  isProfessional?:  boolean;
  trainingEnabled?: boolean;
  /** 一括承認モード: チェックボックスを表示する */
  selectable?:      boolean;
  selected?:        boolean;
  onToggleSelect?:  (id: string) => void;
};

const STATUS_BADGE: Record<AppointmentStatus, { label: string; cls: string }> = {
  pending:   { label: "承認待ち", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmed: { label: "確定",     cls: "bg-[var(--brand-bg)] text-[var(--brand-dark)] border-[var(--brand-border)]" },
  cancelled: { label: "キャンセル", cls: "bg-red-50 text-red-600 border-red-200" },
  rejected:  { label: "予約不可",   cls: "bg-red-50 text-red-600 border-red-300" },
  no_show:   { label: "無断欠席", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  completed: { label: "完了",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const AVATAR_COLORS = [
  "bg-[var(--brand-bg)] text-[var(--brand-dark)]",
  "bg-indigo-50 text-indigo-600",
  "bg-amber-50 text-amber-600",
  "bg-emerald-50 text-emerald-600",
] as const;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function leftAccent(status: AppointmentStatus): string {
  if (status === "pending")   return "bg-amber-400";
  if (status === "confirmed") return "bg-[var(--brand)]";
  if (status === "completed") return "bg-emerald-400";
  return "bg-gray-200";
}

export function AppointmentListCard({
  appt,
  index,
  slug,
  tenantId,
  tenantSlug,
  staffList,
  businessHours,
  lunchStartTime,
  lunchEndTime,
  slotInterval,
  services,
  exercises,
  isProfessional,
  trainingEnabled,
  selectable    = false,
  selected      = false,
  onToggleSelect,
}: Props) {
  const [editOpen,       setEditOpen]      = useState(false);
  const [confirmDelete,  setConfirmDelete] = useState(false);
  const [deleting,       setDeleting]      = useState(false);
  const [deleted,        setDeleted]       = useState(false);

  const isPending  = appt.status === "pending";
  const isEditable = appt.status === "pending" || appt.status === "confirmed";
  const badge      = STATUS_BADGE[appt.status];

  const editModeData: EditModeData = {
    appointmentId: appt.id,
    patientId:     appt.patientId,
    patientName:   appt.patientName,
    date: [
      appt.startAt.getFullYear(),
      String(appt.startAt.getMonth() + 1).padStart(2, "0"),
      String(appt.startAt.getDate()).padStart(2, "0"),
    ].join("-"),
    time: `${String(appt.startAt.getHours()).padStart(2, "0")}:${String(appt.startAt.getMinutes()).padStart(2, "0")}`,
    menuName:    appt.menuName,
    durationMin: appt.durationMin,
    price:       appt.price,
    staffId:     null,
    note:        appt.note,
  };

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteAppointment(appt.id, tenantSlug);
    if (result.success) {
      setDeleted(true);
    } else {
      setDeleting(false);
      setConfirmDelete(false);
      alert(result.error ?? "削除に失敗しました。");
    }
  }

  if (deleted) return null;

  return (
    <>
      <div className="flex items-start gap-3">
        {/* チェックボックス（一括承認モード時のみ表示） */}
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(appt.id)}
            aria-label={selected ? "選択を解除" : "選択"}
            className="mt-4 h-5 w-5 shrink-0 self-start cursor-pointer accent-emerald-500"
          />
        )}

      <div
        className={cn(
          "relative flex-1 overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md",
          isPending ? "border-amber-200" : "border-gray-100",
          selected && "ring-2 ring-emerald-400 ring-offset-1"
        )}
      >
        <div className={cn("absolute left-0 top-0 h-full w-1", leftAccent(appt.status))} />
        <div className="p-4 pl-5">
          {/* 上段: 日時 + ステータス + 操作ボタン */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* 日付カレンダー風 */}
              <div className={cn(
                "flex h-[60px] w-[60px] shrink-0 flex-col items-center justify-center rounded-xl border-2 text-center",
                isPending
                  ? "border-amber-300 bg-amber-50"
                  : "border-[var(--brand-border)] bg-[var(--brand-bg)]"
              )}>
                <span className={cn("text-[9px] font-bold uppercase tracking-wider leading-none", isPending ? "text-amber-500" : "text-[var(--brand-medium)]")}>
                  {appt.startAt.getMonth() + 1}月
                </span>
                <span className={cn("text-[28px] font-black leading-tight", isPending ? "text-amber-700" : "text-[var(--brand-darker)]")}>
                  {appt.startAt.getDate()}
                </span>
                <span className={cn("text-[9px] font-semibold leading-none", isPending ? "text-amber-500" : "text-[var(--brand-medium)]")}>
                  {WEEKDAYS[appt.startAt.getDay()]}曜
                </span>
              </div>
              {/* 時刻 */}
              <div>
                <p className="text-lg font-bold tracking-tight text-gray-800">
                  {fmtTime(appt.startAt)}
                  <span className="mx-1.5 text-sm font-normal text-gray-400">〜</span>
                  {fmtTime(appt.endAt)}
                </p>
                <p className="text-xs text-gray-400">{appt.durationMin}分間</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", badge.cls)}>
                {badge.label}
              </span>
              {/* 編集・削除ボタン */}
              {isEditable && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    aria-label="編集"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]"
                  >
                    <Pencil size={14} />
                  </button>
                  {confirmDelete ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex h-8 items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      削除確認
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="削除"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      onBlur={() => setConfirmDelete(false)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="my-3 h-px bg-gray-50" />

          {/* 患者情報 */}
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", AVATAR_COLORS[index % AVATAR_COLORS.length])}>
              {getInitial(appt.patientName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-sm font-semibold text-gray-800">{appt.patientName}</p>
                <Link href={`/${slug}/patients/${appt.patientId}`} className="text-[11px] text-[var(--brand-dark)] underline-offset-2 hover:underline">
                  患者詳細 →
                </Link>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                <span>{appt.menuName}</span>
                <span className="text-gray-300">|</span>
                <span className="font-semibold text-gray-700">¥{appt.price.toLocaleString()}</span>
                {appt.staffName && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="inline-flex items-center gap-1">
                      <UserCheck size={11} className="text-gray-400" />
                      {appt.staffName}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {appt.note && (
            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">
                <span className="mr-1 font-semibold text-gray-400">備考:</span>
                {appt.note}
              </p>
            </div>
          )}

          {isPending && (
            <div className="mt-4">
              <AppointmentConfirmForm
                appointmentId={appt.id}
                tenantId={tenantId}
                tenantSlug={tenantSlug}
              />
            </div>
          )}
        </div>
      </div>
      </div>  {/* flex wrapper (selectable mode) */}

      {/* 編集ダイアログ */}
      {editOpen && (
        <NewAppointmentDialog
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          staffList={staffList}
          businessHours={businessHours}
          lunchStartTime={lunchStartTime}
          lunchEndTime={lunchEndTime}
          slotInterval={slotInterval}
          editMode={editModeData}
          services={services}
          exercises={exercises}
          isProfessional={isProfessional}
          trainingEnabled={trainingEnabled}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
