"use client";

/**
 * 週間スケジュールカレンダー
 *
 * CLAUDE.md 規約:
 *   - モバイルファースト（横スクロール対応）
 *   - デザインコンセプト: 「信頼」「清潔」「静謐」
 *   - 曜日別営業時間・昼休みを動的に表示する
 *   - DnD: DraggableApptCard で予約ドラッグ移動対応
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  UserCheck,
  X,
  ChevronsRight,
  CalendarOff,
  CalendarPlus,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

// ─── 型定義 ─────────────────────────────────────────────────────────────────

type ApptStatus = "pending" | "confirmed" | "cancelled" | "no_show" | "completed";

export type SerializedAppointment = {
  id:          string;
  status:      ApptStatus;
  startAt:     string; // ISO string
  endAt:       string; // ISO string
  menuName:    string;
  durationMin: number;
  price:       number;
  patientId:   string;
  patientName: string;
  staffName:   string | null;
  note:        string | null;
};

export type BusinessHourData = {
  dayOfWeek: number;   // 0=日, 1=月, ..., 6=土
  isOpen:    boolean;
  openTime:  string;   // "HH:mm"
  closeTime: string;   // "HH:mm"
};

export type Props = {
  weekStartStr:   string; // "YYYY-MM-DD" (月曜日)
  appointments:   SerializedAppointment[];
  slug:           string;
  pendingCount:   number;
  businessHours:  BusinessHourData[];
  lunchStartTime: string | null;
  lunchEndTime:   string | null;
  /** グリッドの空き枠クリック時に日付と時刻を返す */
  onSlotClick?:  (date: string, time: string) => void;
  /** ナビバーの「新規予約」ボタンを有効化するコールバック */
  onNewAppt?:    () => void;
  /** DnD: 予約ドロップ完了時に呼ばれる（楽観的更新は AppointmentsWeekView 側で処理） */
  onApptDragEnd?: (apptId: string, dayIdx: number, snappedMin: number) => void;
  /** DnD: 時間グリッド本体の ref（座標計算に使用） */
  calGridRef?:   React.RefObject<HTMLDivElement | null>;
  /** DnD: スクロール領域の ref（Y座標補正に使用） */
  scrollAreaRef?: React.RefObject<HTMLDivElement | null>;
  /** DnD: 現在ドラッグ中の予約ID（ゴースト表示に使用） */
  draggingId?:   string | null;
  /** 予約スロットの刻み幅（分）: 15 | 20 | 30 | 60 */
  slotInterval?: number;
};

// ─── 定数 ───────────────────────────────────────────────────────────────────

export const HOUR_HEIGHT  = 72; // px / 1時間（AppointmentsWeekView からも参照）
const JA_WEEKDAYS  = ["月", "火", "水", "木", "金", "土", "日"] as const;

// ─── ステータス設定 ──────────────────────────────────────────────────────────

const STATUS_CFG: Record<ApptStatus, {
  bg: string; border: string; text: string; label: string; pill: string; accent: string;
}> = {
  pending:   {
    bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900",
    label: "仮受付", pill: "bg-amber-100 text-amber-800 border-amber-200", accent: "bg-amber-400",
  },
  confirmed: {
    bg: "bg-[#E8F7F8]", border: "border-[#91D2D9]", text: "text-[#1a6a72]",
    label: "確定",   pill: "bg-[#C8EDF0] text-[#1a6a72] border-[#A8DCE2]",   accent: "bg-[#91D2D9]",
  },
  completed: {
    bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-900",
    label: "完了",   pill: "bg-emerald-100 text-emerald-700 border-emerald-200", accent: "bg-emerald-400",
  },
  cancelled: {
    bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-400",
    label: "取消",   pill: "bg-gray-100 text-gray-500 border-gray-200",          accent: "bg-gray-300",
  },
  no_show: {
    bg: "bg-red-50", border: "border-red-200", text: "text-red-400",
    label: "欠席",   pill: "bg-red-50 text-red-500 border-red-200",              accent: "bg-red-300",
  },
};

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMondayStr(d: Date): string {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return formatDateStr(addDays(d, diff));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth()  === b.getMonth()
    && a.getDate()   === b.getDate();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── 営業時間マップ ──────────────────────────────────────────────────────────

function buildBhMap(businessHours: BusinessHourData[]): Map<number, BusinessHourData> {
  const map = new Map<number, BusinessHourData>();
  for (const bh of businessHours) map.set(bh.dayOfWeek, bh);
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    if (!map.has(d)) {
      map.set(d, { dayOfWeek: d, isOpen: d !== 0, openTime: "09:00", closeTime: "20:00" });
    }
  }
  return map;
}

// ─── グリッド範囲計算 ────────────────────────────────────────────────────────

function calcGridRange(businessHours: BusinessHourData[]): { gridStartHour: number; gridEndHour: number } {
  const openDays = businessHours.filter((bh) => bh.isOpen);
  if (openDays.length === 0) return { gridStartHour: 9, gridEndHour: 20 };
  const startMin = Math.min(...openDays.map((bh) => timeToMin(bh.openTime)));
  const endMin   = Math.max(...openDays.map((bh) => timeToMin(bh.closeTime)));
  return {
    gridStartHour: Math.floor(startMin / 60),
    gridEndHour:   Math.ceil(endMin / 60),
  };
}

// ─── レイアウト計算 ─────────────────────────────────────────────────────────

type LayoutAppt = SerializedAppointment & { colIndex: number; totalCols: number };

function layoutDayAppointments(appts: SerializedAppointment[]): LayoutAppt[] {
  const sorted = [...appts].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  const columns: Date[] = [];
  const result: LayoutAppt[] = [];

  for (const appt of sorted) {
    const start = new Date(appt.startAt);
    const end   = new Date(appt.endAt);
    let colIndex = -1;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] <= start) { colIndex = i; columns[i] = end; break; }
    }
    if (colIndex === -1) { colIndex = columns.length; columns.push(end); }
    result.push({ ...appt, colIndex, totalCols: 0 });
  }

  for (let i = 0; i < result.length; i++) {
    const si = new Date(result[i].startAt).getTime();
    const ei = new Date(result[i].endAt).getTime();
    let maxCol = result[i].colIndex;
    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      const sj = new Date(result[j].startAt).getTime();
      const ej = new Date(result[j].endAt).getTime();
      if (sj < ei && ej > si) maxCol = Math.max(maxCol, result[j].colIndex);
    }
    result[i].totalCols = maxCol + 1;
  }
  return result;
}

function calcApptStyle(
  appt: SerializedAppointment,
  colIndex: number,
  totalCols: number,
  gridStartHour: number,
) {
  const start    = new Date(appt.startAt);
  const startMin = start.getHours() * 60 + start.getMinutes() - gridStartHour * 60;
  const top      = (startMin / 60) * HOUR_HEIGHT;
  const height   = Math.max((appt.durationMin / 60) * HOUR_HEIGHT - 4, 28);
  const widthPct = 100 / totalCols;
  const leftPct  = colIndex * widthPct;
  return {
    top:    `${top}px`,
    height: `${height}px`,
    left:   `calc(${leftPct}% + 2px)`,
    width:  `calc(${widthPct}% - 4px)`,
  };
}

// ─── シェードオーバーレイ計算 ────────────────────────────────────────────────

function calcShade(fromMin: number, toMin: number, gridStartMin: number): React.CSSProperties {
  const top    = Math.max(0, ((fromMin - gridStartMin) / 60) * HOUR_HEIGHT);
  const bottom = Math.max(0, ((toMin - gridStartMin) / 60) * HOUR_HEIGHT);
  return { top: `${top}px`, height: `${Math.max(0, bottom - top)}px` };
}

// ─── 現在時刻インジケータ ────────────────────────────────────────────────────

function NowIndicator({ gridStartHour }: { gridStartHour: number }) {
  const [topPx, setTopPx] = useState<number | null>(null);

  useEffect(() => {
    function update() {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes() - gridStartHour * 60;
      setTopPx(min >= 0 ? (min / 60) * HOUR_HEIGHT : null);
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [gridStartHour]);

  if (topPx === null) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
      style={{ top: `${topPx}px` }}
    >
      <div className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
      <div className="h-px flex-1 bg-red-400/70" />
    </div>
  );
}

// ─── 予約詳細モーダル ─────────────────────────────────────────────────────────

function ApptDetailModal({
  appt, slug, onClose,
}: {
  appt: SerializedAppointment;
  slug: string;
  onClose: () => void;
}) {
  const cfg = STATUS_CFG[appt.status];

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className={cn("flex items-center justify-between px-5 py-3.5", cfg.bg)}>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", cfg.pill)}>
              {cfg.label}
            </span>
            <span className={cn("text-sm font-semibold", cfg.text)}>
              {fmtTime(appt.startAt)} 〜 {fmtTime(appt.endAt)}
            </span>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-black/5" aria-label="閉じる">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)] text-sm font-bold text-[var(--brand-dark)]">
              {appt.patientName.slice(0, 1)}
            </div>
            <div>
              <p className="font-semibold text-gray-800">{appt.patientName}</p>
              <p className="text-sm text-gray-500">{appt.menuName}</p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Clock size={13} className="text-gray-400" />
              {fmtTime(appt.startAt)} 〜 {fmtTime(appt.endAt)}（{appt.durationMin}分）
            </div>
            {appt.staffName && (
              <div className="flex items-center gap-2 text-gray-600">
                <UserCheck size={13} className="text-gray-400" />
                {appt.staffName}
              </div>
            )}
            <div className="flex items-center gap-2 font-semibold text-gray-800">
              <span className="text-xs font-normal text-gray-400">¥</span>
              {appt.price.toLocaleString()}円
            </div>
          </div>

          {appt.note && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500">
              <span className="font-semibold text-gray-400">備考: </span>{appt.note}
            </div>
          )}

          <Link
            href={`/${slug}/patients/${appt.patientId}`}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] text-sm font-medium text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-hover)]"
            onClick={onClose}
          >
            <User size={14} />
            患者詳細を見る
            <ChevronsRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── スロットクリック計算 ────────────────────────────────────────────────────

function calcSlot(y: number, gridStartHour: number, slotInterval: number): { top: number; timeStr: string } {
  const minutesFromTop = (y / HOUR_HEIGHT) * 60;
  const absoluteMin    = gridStartHour * 60 + minutesFromTop;
  const snapped        = Math.round(absoluteMin / slotInterval) * slotInterval;
  const clamped        = Math.max(gridStartHour * 60, snapped);
  const offsetMin      = clamped - gridStartHour * 60;
  const top            = (offsetMin / 60) * HOUR_HEIGHT;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return { top, timeStr: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

// ─── DraggableApptCard ──────────────────────────────────────────────────────
// pending / confirmed のみドラッグ可能。その他は disabled。

const DRAGGABLE_STATUSES: ApptStatus[] = ["pending", "confirmed"];

function DraggableApptCard({
  appt,
  style,
  isDraggingThis,
  onCardClick,
}: {
  appt: LayoutAppt;
  style: React.CSSProperties;
  isDraggingThis: boolean;
  onCardClick: (appt: SerializedAppointment) => void;
}) {
  const isDraggable = DRAGGABLE_STATUSES.includes(appt.status);
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id:       appt.id,
    data:     { appt },
    disabled: !isDraggable,
  });

  const cfg     = STATUS_CFG[appt.status];
  const isShort = appt.durationMin <= 30;

  // ドラッグ中は元位置を半透明ゴーストとして残す
  const ghostOpacity = (isDragging || isDraggingThis) ? "opacity-30" : "opacity-100";

  return (
    <button
      ref={setNodeRef}
      {...(isDraggable ? listeners : {})}
      {...(isDraggable ? attributes : {})}
      onClick={(e) => {
        e.stopPropagation();
        // ドラッグ後のクリックイベントを無視（5px 以上動いたらドラッグとみなす）
        if (isDragging) return;
        onCardClick(appt);
      }}
      className={cn(
        "absolute z-10 overflow-hidden rounded-lg border text-left shadow-sm",
        "transition-opacity",
        // ドラッグ可能なカードにはカーソルとホバーを追加
        isDraggable
          ? "cursor-grab hover:z-20 hover:shadow-md hover:brightness-95 active:cursor-grabbing"
          : "cursor-default",
        cfg.bg, cfg.border,
        ghostOpacity,
      )}
      style={style}
      aria-label={`${appt.patientName} ${fmtTime(appt.startAt)} - ${isDraggable ? "ドラッグして移動" : ""}`}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l", cfg.accent)} />
      <div className={cn("pl-2 pr-1", isShort ? "py-0.5" : "py-1")}>
        <p className={cn("truncate font-semibold leading-tight", cfg.text, isShort ? "text-[10px]" : "text-[11px]")}>
          {appt.patientName}
        </p>
        {!isShort && (
          <p className="truncate text-[10px] leading-tight text-gray-500">
            {appt.menuName}
          </p>
        )}
        {!isShort && (
          <p className={cn("mt-0.5 text-[10px] leading-none opacity-70", cfg.text)}>
            {fmtTime(appt.startAt)}〜
          </p>
        )}
      </div>
      {/* ドラッグ可能バッジ（pending/confirmed のみ、カード上部に細いインジケータ） */}
      {isDraggable && !isShort && (
        <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-current opacity-20" />
      )}
    </button>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function WeeklyCalendar({
  weekStartStr,
  appointments,
  slug,
  pendingCount,
  businessHours,
  lunchStartTime,
  lunchEndTime,
  onSlotClick,
  onNewAppt,
  calGridRef,
  scrollAreaRef,
  draggingId,
  slotInterval = 30,
}: Props) {
  const bhMap = buildBhMap(businessHours);
  const { gridStartHour, gridEndHour } = calcGridRange(businessHours);
  const gridStartMin = gridStartHour * 60;
  const gridEndMin   = gridEndHour   * 60;

  const hours       = Array.from({ length: gridEndHour - gridStartHour }, (_, i) => gridStartHour + i);
  const totalHeight = hours.length * HOUR_HEIGHT;

  const weekStart   = parseDateStr(weekStartStr);
  const days        = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today       = new Date();
  const prevWeekStr = formatDateStr(addDays(weekStart, -7));
  const nextWeekStr = formatDateStr(addDays(weekStart,  7));
  const todayStr    = getMondayStr(today);

  const [selectedAppt, setSelectedAppt] = useState<SerializedAppointment | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ dayIdx: number; top: number; timeStr: string } | null>(null);

  // 内部スクロール ref（外部から渡されなければ内部で管理）
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef: React.RefObject<HTMLDivElement | null> = scrollAreaRef ?? internalScrollRef;

  // 初期スクロール: 現在時刻付近へ
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now    = new Date();
    const min    = now.getHours() * 60 + now.getMinutes() - gridStartHour * 60;
    const target = Math.max(0, (min / 60) * HOUR_HEIGHT - 80);
    el.scrollTop = target;
  }, [weekStartStr, gridStartHour, scrollRef]);

  // 表示月ラベル
  const monthLabel = (() => {
    const s = days[0], e = days[6];
    return s.getMonth() === e.getMonth()
      ? `${s.getFullYear()}年${s.getMonth() + 1}月`
      : `${s.getFullYear()}年${s.getMonth() + 1}月〜${e.getMonth() + 1}月`;
  })();

  // 日別レイアウト
  const dayLayouts = days.map((day) =>
    layoutDayAppointments(appointments.filter((a) => isSameDay(new Date(a.startAt), day)))
  );

  const handleClose = useCallback(() => setSelectedAppt(null), []);

  // DnD中はホバースロットを非表示にする
  const isDnDActive = !!draggingId;

  return (
    <div className="flex flex-col gap-4">

      {/* ── ナビゲーションバー ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">{monthLabel}</p>

        <div className="flex items-center gap-1.5">
          <Link
            href={`/${slug}/appointments?view=week&week=${todayStr}`}
            className="flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
          >
            今週
          </Link>
          <Link
            href={`/${slug}/appointments?view=week&week=${prevWeekStr}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
            aria-label="前週"
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href={`/${slug}/appointments?view=week&week=${nextWeekStr}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
            aria-label="次週"
          >
            <ChevronRight size={16} />
          </Link>
        </div>

        {/* 凡例 + 新規予約ボタン */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            {(["pending", "confirmed", "completed"] as ApptStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={cn("h-2.5 w-2.5 rounded-full border", STATUS_CFG[s].border, STATUS_CFG[s].bg)} />
                {STATUS_CFG[s].label}
              </span>
            ))}
            {pendingCount > 0 && (
              <Link
                href={`/${slug}/appointments?view=list&tab=pending`}
                className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-200"
              >
                承認待ち {pendingCount}件 →
              </Link>
            )}
          </div>
          {onNewAppt && (
            <button
              onClick={onNewAppt}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--brand-medium)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-dark)]"
            >
              <CalendarPlus size={13} />
              新規予約
            </button>
          )}
        </div>
      </div>

      {/* ── カレンダーグリッド ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* 曜日ヘッダー（固定）*/}
        <div
          className="grid border-b border-gray-100 bg-gray-50/80"
          style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}
        >
          <div className="border-r border-gray-100 py-3" />

          {days.map((day, i) => {
            const isToday   = isSameDay(day, today);
            const jsDay     = day.getDay();
            const bh        = bhMap.get(jsDay)!;
            const isHoliday = !bh.isOpen;
            const isSat     = jsDay === 6;
            const isSun     = jsDay === 0;

            return (
              <div
                key={i}
                className={cn(
                  "border-r border-gray-100 px-2 py-2.5 text-center last:border-r-0",
                  isToday   && "bg-[var(--brand-bg)]",
                  isHoliday && !isToday && "bg-gray-50",
                )}
              >
                <p className={cn(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  isSun ? "text-red-400" : isSat ? "text-blue-400" : "text-gray-400",
                  isHoliday && "opacity-50",
                )}>
                  {JA_WEEKDAYS[i]}
                </p>
                <p className={cn(
                  "mt-0.5 text-lg font-bold leading-none",
                  isToday   ? "text-[var(--brand-dark)]"
                  : isSun   ? "text-red-500"
                  : isSat   ? "text-blue-500"
                  : "text-gray-700",
                  isHoliday && !isToday && "opacity-40",
                )}>
                  {day.getDate()}
                </p>
                {isToday && (
                  <div className="mx-auto mt-1 h-1 w-1 rounded-full bg-[var(--brand)]" />
                )}
                {isHoliday && !isToday && (
                  <p className="mt-1 text-[9px] font-medium text-gray-400">定休</p>
                )}
              </div>
            );
          })}
        </div>

        {/* 時間グリッド（スクロール可）*/}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "600px" }}>
          {/* DnD座標計算のためのグリッド本体 ref */}
          <div
            ref={calGridRef}
            className="grid"
            style={{ gridTemplateColumns: "56px repeat(7, 1fr)", height: `${totalHeight}px` }}
          >
            {/* 時間ラベル列 */}
            <div className="relative border-r border-gray-100">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-gray-100"
                  style={{ top: `${(h - gridStartHour) * HOUR_HEIGHT}px` }}
                >
                  <span className="block px-2 pt-1 text-[10px] font-medium leading-none text-gray-400">
                    {h}:00
                  </span>
                </div>
              ))}
            </div>

            {/* 各日の列 */}
            {days.map((day, dayIdx) => {
              const isToday   = isSameDay(day, today);
              const jsDay     = day.getDay();
              const bh        = bhMap.get(jsDay)!;
              const isHoliday = !bh.isOpen;
              const layoutted = dayLayouts[dayIdx];

              // シェード計算
              const preOpenStyle  = !isHoliday && timeToMin(bh.openTime) > gridStartMin
                ? calcShade(gridStartMin, timeToMin(bh.openTime), gridStartMin)
                : null;
              const postCloseStyle = !isHoliday && timeToMin(bh.closeTime) < gridEndMin
                ? calcShade(timeToMin(bh.closeTime), gridEndMin, gridStartMin)
                : null;
              const lunchStyle = !isHoliday && lunchStartTime && lunchEndTime
                ? calcShade(timeToMin(lunchStartTime), timeToMin(lunchEndTime), gridStartMin)
                : null;

              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "relative border-r border-gray-100 last:border-r-0",
                    isToday && "bg-[var(--brand-hover)]/40",
                    onSlotClick && !isHoliday && !isDnDActive && "cursor-pointer",
                  )}
                  style={{ height: `${totalHeight}px` }}
                  onClick={(e) => {
                    if (!onSlotClick || isHoliday || isDnDActive) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const { timeStr } = calcSlot(y, gridStartHour, slotInterval);
                    onSlotClick(formatDateStr(day), timeStr);
                  }}
                  onMouseMove={onSlotClick && !isHoliday && !isDnDActive ? (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const { top, timeStr } = calcSlot(y, gridStartHour, slotInterval);
                    setHoverSlot({ dayIdx, top, timeStr });
                  } : undefined}
                  onMouseLeave={onSlotClick && !isDnDActive ? () => setHoverSlot(null) : undefined}
                >
                  {/* グリッド線（毎時）*/}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute left-0 right-0 border-t border-gray-100"
                      style={{ top: `${(h - gridStartHour) * HOUR_HEIGHT}px` }}
                    />
                  ))}
                  {/* グリッド線（slotInterval ごとの補助線）*/}
                  {hours.flatMap((h) =>
                    Array.from({ length: Math.floor(60 / slotInterval) - 1 }, (_, i) => {
                      const offsetMin = (i + 1) * slotInterval;
                      if (offsetMin >= 60) return null;
                      return (
                        <div
                          key={`${h}-sub-${i}`}
                          className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-gray-100/60"
                          style={{ top: `${(h - gridStartHour) * HOUR_HEIGHT + (offsetMin / 60) * HOUR_HEIGHT}px` }}
                        />
                      );
                    }).filter(Boolean)
                  )}

                  {/* 休診日オーバーレイ */}
                  {isHoliday && (
                    <div className="pointer-events-none absolute inset-0 bg-gray-50/80 flex flex-col items-center justify-center gap-1">
                      <CalendarOff size={18} className="text-gray-200" />
                      <span className="text-[10px] font-medium text-gray-300">定休日</span>
                    </div>
                  )}

                  {/* 営業時間外（開始前）*/}
                  {preOpenStyle && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 bg-gray-100/60"
                      style={preOpenStyle}
                    />
                  )}

                  {/* 営業時間外（終了後）*/}
                  {postCloseStyle && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 bg-gray-100/60"
                      style={postCloseStyle}
                    />
                  )}

                  {/* 昼休みシェード */}
                  {lunchStyle && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 bg-amber-50/50 border-y border-amber-100/60"
                      style={lunchStyle}
                    />
                  )}

                  {/* 現在時刻インジケータ */}
                  {isToday && <NowIndicator gridStartHour={gridStartHour} />}

                  {/* ホバースロットインジケータ（DnD中は非表示）*/}
                  {onSlotClick && !isHoliday && !isDnDActive && hoverSlot?.dayIdx === dayIdx && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                      style={{ top: `${hoverSlot.top}px` }}
                    >
                      <div className="h-px flex-1 border-t border-dashed border-[var(--brand)]/50" />
                      <span className="ml-1 rounded bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                        {hoverSlot.timeStr}
                      </span>
                    </div>
                  )}

                  {/* 予約カード（DraggableApptCard） */}
                  {layoutted.map((appt) => {
                    const style = calcApptStyle(appt, appt.colIndex, appt.totalCols, gridStartHour);
                    return (
                      <DraggableApptCard
                        key={appt.id}
                        appt={appt}
                        style={style}
                        isDraggingThis={draggingId === appt.id}
                        onCardClick={setSelectedAppt}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 予約詳細モーダル */}
      {selectedAppt && (
        <ApptDetailModal appt={selectedAppt} slug={slug} onClose={handleClose} />
      )}
    </div>
  );
}
