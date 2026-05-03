"use client";

/**
 * 月間カレンダービュー
 *
 * - 月単位で予約を俯瞰する読み取り専用ビュー
 * - 予約チップをクリックすると、その週の週間ビューへ遷移
 * - 日付セルをクリックすると、その週の週間ビューへ遷移（新規予約しやすい）
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SerializedAppointment } from "./WeeklyCalendar";

const STATUS_CFG = {
  pending:   { bg: "bg-amber-50",   text: "text-amber-800",  dot: "bg-amber-400"         },
  confirmed: { bg: "bg-[#E8F7F8]",  text: "text-[#1a6a72]",  dot: "bg-[var(--brand)]"   },
  completed: { bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-300"          },
  cancelled: { bg: "bg-red-50",     text: "text-red-400",    dot: "bg-red-300"           },
  no_show:   { bg: "bg-red-50",     text: "text-red-400",    dot: "bg-red-300"           },
  rejected:  { bg: "bg-gray-50",    text: "text-gray-400",   dot: "bg-gray-200"          },
} as const;

const DOW = ["月", "火", "水", "木", "金", "土", "日"];

type Props = {
  monthStr:     string; // "YYYY-MM"
  appointments: SerializedAppointment[];
  slug:         string;
};

export function MonthlyCalendar({ monthStr, appointments, slug }: Props) {
  const currentMonth = useMemo(() => {
    const [y, m] = monthStr.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [monthStr]);

  const prevMonthStr  = format(subMonths(currentMonth, 1), "yyyy-MM");
  const nextMonthStr  = format(addMonths(currentMonth, 1), "yyyy-MM");
  const todayMonthStr = format(new Date(), "yyyy-MM");

  // カレンダーグリッド日付一覧（月曜始まり、前後の週パディング含む）
  const calDays = useMemo(() => {
    const mStart = startOfMonth(currentMonth);
    const mEnd   = endOfMonth(currentMonth);
    const gStart = startOfWeek(mStart, { weekStartsOn: 1 });
    const gEnd   = endOfWeek(mEnd,     { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gStart, end: gEnd });
  }, [currentMonth]);

  // 日付文字列 → 予約リストのマップ
  const apptsByDay = useMemo(() => {
    const map = new Map<string, SerializedAppointment[]>();
    for (const appt of appointments) {
      const key = format(new Date(appt.startAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    }
    return map;
  }, [appointments]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-800">
            {format(currentMonth, "yyyy年M月", { locale: ja })}
          </h2>
          {monthStr !== todayMonthStr && (
            <Link
              href={`/${slug}/appointments?view=month&month=${todayMonthStr}`}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              今月
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/${slug}/appointments?view=month&month=${prevMonthStr}`}
            aria-label="前月"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href={`/${slug}/appointments?view=month&month=${nextMonthStr}`}
            aria-label="翌月"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      {/* ── 曜日ヘッダー ── */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={cn(
              "py-2 text-center text-[11px] font-semibold tracking-wide",
              i === 5 ? "text-blue-500" : i === 6 ? "text-red-500" : "text-gray-400",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── 日付グリッド ── */}
      <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
        {calDays.map((day) => {
          const dayStr   = format(day, "yyyy-MM-dd");
          const dayAppts = apptsByDay.get(dayStr) ?? [];
          const inMonth  = isSameMonth(day, currentMonth);
          const today    = isToday(day);
          const dow      = day.getDay(); // 0=日, 6=土
          const MAX_SHOW = 3;
          const shown    = dayAppts.slice(0, MAX_SHOW);
          const overflow = dayAppts.length - MAX_SHOW;

          // 週間ビューへのリンク用に、その週の月曜を計算
          const weekMon = format(startOfWeek(day, { weekStartsOn: 1 }), "yyyy-MM-dd");
          const weekHref = `/${slug}/appointments?view=week&week=${weekMon}`;

          return (
            <div
              key={dayStr}
              className={cn(
                "min-h-[80px] p-1 md:min-h-[110px] md:p-1.5",
                !inMonth && "bg-gray-50/40",
                today    && "bg-[var(--brand-hover)]",
              )}
            >
              {/* 日付番号 */}
              <Link
                href={weekHref}
                className={cn(
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors hover:opacity-80",
                  today
                    ? "bg-[var(--brand)] text-white font-bold"
                    : !inMonth
                      ? "text-gray-300 hover:bg-gray-100"
                      : dow === 0
                        ? "text-red-500 hover:bg-red-50"
                        : dow === 6
                          ? "text-blue-500 hover:bg-blue-50"
                          : "text-gray-700 hover:bg-gray-100",
                )}
              >
                {format(day, "d")}
              </Link>

              {/* 予約チップ */}
              <div className="space-y-0.5">
                {shown.map((appt) => {
                  const cfg      = STATUS_CFG[appt.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.completed;
                  const startTime = format(new Date(appt.startAt), "H:mm");
                  return (
                    <Link
                      key={appt.id}
                      href={weekHref}
                      className={cn(
                        "flex w-full items-center gap-1 rounded px-1 py-0.5",
                        "text-[10px] leading-tight transition-opacity hover:opacity-70",
                        cfg.bg, cfg.text,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cfg.dot)} />
                      <span className="truncate font-medium">
                        <span className="mr-0.5 opacity-70">{startTime}</span>
                        {appt.patientName}
                      </span>
                    </Link>
                  );
                })}
                {overflow > 0 && (
                  <Link
                    href={weekHref}
                    className="block px-1 text-[10px] text-gray-400 hover:text-gray-600"
                  >
                    +{overflow}件
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 凡例 ── */}
      <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2.5">
        {([
          { key: "pending",   label: "仮受付" },
          { key: "confirmed", label: "確定" },
          { key: "completed", label: "完了" },
        ] as const).map(({ key, label }) => (
          <span key={key} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className={cn("h-2 w-2 rounded-full", STATUS_CFG[key].dot)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
