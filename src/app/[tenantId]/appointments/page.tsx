/**
 * 予約管理ページ
 *
 * view=week  → 週間スケジュールカレンダー（デフォルト）
 * view=list  → タブ別リスト（承認操作はこちら）
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - URL searchParams で状態管理（SSR・直リンク対応）
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  Archive,
  Inbox,
  UserCheck,
  CalendarDays,
  List,
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  parseISO,
  isValid,
  format,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { getInitial } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AppointmentConfirmForm } from "@/components/appointments/AppointmentConfirmForm";
import { type SerializedAppointment, type BusinessHourData } from "@/components/appointments/WeeklyCalendar";
import { AppointmentsWeekView } from "@/components/appointments/AppointmentsWeekView";
import type { AppointmentStatus } from "@prisma/client";

type Props = {
  params:       Promise<{ tenantId: string }>;
  searchParams: Promise<{ view?: string; tab?: string; week?: string }>;
};

type Tab = "pending" | "confirmed" | "archive";

// ── 日時フォーマット ──────────────────────────────────────────────
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// ── ステータスバッジ設定 ──────────────────────────────────────────
const STATUS_BADGE: Record<AppointmentStatus, { label: string; cls: string }> = {
  pending:   { label: "承認待ち", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmed: { label: "確定",     cls: "bg-[var(--brand-bg)] text-[var(--brand-dark)] border-[var(--brand-border)]" },
  cancelled: { label: "キャンセル", cls: "bg-red-50 text-red-600 border-red-200" },
  no_show:   { label: "無断欠席", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  completed: { label: "完了",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const AVATAR_COLORS = [
  "bg-[var(--brand-bg)] text-[var(--brand-dark)]",
  "bg-indigo-50 text-indigo-600",
  "bg-amber-50 text-amber-600",
  "bg-emerald-50 text-emerald-600",
] as const;

function leftAccent(status: AppointmentStatus): string {
  if (status === "pending")   return "bg-amber-400";
  if (status === "confirmed") return "bg-[var(--brand)]";
  if (status === "completed") return "bg-emerald-400";
  return "bg-gray-200";
}

export default async function AppointmentsPage({ params, searchParams }: Props) {
  const { tenantId: slug }       = await params;
  const { view, tab, week }      = await searchParams;

  const isWeekView = view !== "list";
  const activeTab: Tab =
    tab === "confirmed" ? "confirmed" :
    tab === "archive"   ? "archive"   : "pending";

  // ── テナント解決（営業時間・昼休みも取得）────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: {
      id:             true,
      name:           true,
      lunchStartTime: true,
      lunchEndTime:   true,
      slotInterval:   true,
      maxCapacity:    true,
    },
  });
  if (!tenant) notFound();

  // 曜日別営業時間
  const rawHours = await prisma.businessHour.findMany({
    where:  { tenantId: tenant.id },
    select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
  });
  const businessHours: BusinessHourData[] = rawHours;

  // 週間ビュー用: スタッフ + 患者一覧（新規予約モーダルで使用）
  const [staffList, patientList] = isWeekView
    ? await Promise.all([
        prisma.profile.findMany({
          where:   { tenantId: tenant.id, isActive: true },
          select:  { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        }),
        prisma.patient.findMany({
          where:   { tenantId: tenant.id },
          select:  { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        }),
      ])
    : [[], []];

  // ── 承認待ちカウント（ビュー共通で使用）────────────────────────
  const pendingCount = await prisma.appointment.count({
    where: { tenantId: tenant.id, status: "pending" },
  });

  // ── 週間ビュー用データ ────────────────────────────────────────
  let weekStartStr = "";
  let weeklyAppointments: SerializedAppointment[] = [];

  if (isWeekView) {
    // week パラメータから月曜日を決定（未指定 or 不正値 → 今週の月曜）
    const baseDate =
      week && isValid(parseISO(week)) ? parseISO(week) : new Date();
    const wStart = startOfWeek(baseDate, { weekStartsOn: 1 });
    const wEnd   = endOfWeek(baseDate,   { weekStartsOn: 1 });
    weekStartStr  = format(wStart, "yyyy-MM-dd");

    const rawAppts = await prisma.appointment.findMany({
      where: {
        tenantId: tenant.id, // CLAUDE.md 絶対ルール
        startAt:  { gte: wStart, lte: addDays(wEnd, 1) },
        status:   { in: ["pending", "confirmed", "completed"] },
      },
      include: {
        patient: { select: { id: true, displayName: true } },
        staff:   { select: { displayName: true } },
      },
      orderBy: { startAt: "asc" },
    });

    weeklyAppointments = rawAppts.map((a) => ({
      id:          a.id,
      status:      a.status,
      startAt:     a.startAt.toISOString(),
      endAt:       a.endAt.toISOString(),
      menuName:    a.menuName,
      durationMin: a.durationMin,
      price:       a.price,
      patientId:   a.patient.id,
      patientName: a.patient.displayName,
      staffName:   a.staff?.displayName ?? null,
      note:        a.note ?? null,
    }));
  }

  // ── リストビュー用データ ──────────────────────────────────────
  let listAppointments: Awaited<ReturnType<typeof prisma.appointment.findMany<{
    include: { patient: { select: { id: true; displayName: true } }; staff: { select: { displayName: true } } };
  }>>> = [];
  let confirmedCount = 0;
  let archiveCount   = 0;

  if (!isWeekView) {
    [confirmedCount, archiveCount] = await Promise.all([
      prisma.appointment.count({ where: { tenantId: tenant.id, status: "confirmed" } }),
      prisma.appointment.count({ where: { tenantId: tenant.id, status: { in: ["completed", "cancelled", "no_show"] } } }),
    ]);

    const whereStatus: AppointmentStatus[] =
      activeTab === "pending"   ? ["pending"] :
      activeTab === "confirmed" ? ["confirmed"] :
      ["completed", "cancelled", "no_show"];

    listAppointments = await prisma.appointment.findMany({
      where: {
        tenantId: tenant.id, // CLAUDE.md 絶対ルール
        status:   { in: whereStatus },
      },
      include: {
        patient: { select: { id: true, displayName: true } },
        staff:   { select: { displayName: true } },
      },
      orderBy: { startAt: activeTab === "archive" ? "desc" : "asc" },
    });
  }

  return (
    <div className={cn("mx-auto space-y-5", isWeekView ? "max-w-full" : "max-w-3xl")}>

      {/* ── ページヘッダー ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">予約管理</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {pendingCount > 0 ? (
              <span className="font-semibold text-amber-600">
                {pendingCount}件の承認待ちがあります
              </span>
            ) : (
              "承認待ちはありません"
            )}
          </p>
        </div>

        {/* ビュー切り替えトグル */}
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <Link
            href={`/${slug}/appointments?view=week&week=${weekStartStr || format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")}`}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all",
              isWeekView
                ? "bg-[var(--brand-bg)] text-[var(--brand-dark)] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <CalendarDays size={14} />
            <span className="hidden sm:inline">週間</span>
          </Link>
          <Link
            href={`/${slug}/appointments?view=list`}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all",
              !isWeekView
                ? "bg-[var(--brand-bg)] text-[var(--brand-dark)] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <List size={14} />
            <span className="hidden sm:inline">リスト</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-700">
                {pendingCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* ══ 週間カレンダービュー ══ */}
      {isWeekView && (
        <AppointmentsWeekView
          weekStartStr={weekStartStr}
          appointments={weeklyAppointments}
          slug={slug}
          pendingCount={pendingCount}
          tenantId={tenant.id}
          businessHours={businessHours}
          lunchStartTime={tenant.lunchStartTime}
          lunchEndTime={tenant.lunchEndTime}
          slotInterval={tenant.slotInterval}
          maxCapacity={tenant.maxCapacity}
          staffList={staffList}
          patientList={patientList}
        />
      )}

      {/* ══ リストビュー ══ */}
      {!isWeekView && (
        <>
          {/* タブバー */}
          <nav className="flex gap-1 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
            {([
              { key: "pending"   as Tab, label: "承認待ち",   count: pendingCount,   Icon: Clock },
              { key: "confirmed" as Tab, label: "確定済み",   count: confirmedCount, Icon: CheckCircle2 },
              { key: "archive"   as Tab, label: "完了・過去", count: archiveCount,   Icon: Archive },
            ]).map(({ key, label, count, Icon }) => {
              const isActive = activeTab === key;
              const isAlert  = key === "pending" && count > 0;
              return (
                <Link
                  key={key}
                  href={`/${slug}/appointments?view=list&tab=${key}`}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? isAlert
                        ? "bg-amber-50 text-amber-700 shadow-sm"
                        : "bg-[var(--brand-bg)] text-[var(--brand-dark)] shadow-sm"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  )}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "min-w-[20px] rounded-full px-1.5 py-px text-center text-[11px] font-bold",
                      isActive
                        ? isAlert
                          ? "bg-amber-100 text-amber-800"
                          : "bg-[var(--brand-light)] text-[var(--brand-darker)]"
                        : "bg-gray-100 text-gray-500"
                    )}>
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* 予約リスト */}
          {listAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-20 text-center">
              <Inbox size={40} className="text-gray-200" />
              <p className="mt-3 text-sm font-medium text-gray-400">
                {activeTab === "pending"   && "承認待ちの予約はありません"}
                {activeTab === "confirmed" && "確定済みの予約はありません"}
                {activeTab === "archive"   && "完了・過去の予約はありません"}
              </p>
              {activeTab === "pending" && (
                <p className="mt-1 text-xs text-gray-300">
                  患者からの予約申込があると、ここに表示されます
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {listAppointments.map((appt, index) => {
                const isPending = appt.status === "pending";
                const badge     = STATUS_BADGE[appt.status];
                return (
                  <div
                    key={appt.id}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md",
                      isPending ? "border-amber-200" : "border-gray-100"
                    )}
                  >
                    <div className={cn("absolute left-0 top-0 h-full w-1", leftAccent(appt.status))} />
                    <div className="p-4 pl-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
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
                          <div>
                            <p className="text-lg font-bold tracking-tight text-gray-800">
                              {fmtTime(appt.startAt)}
                              <span className="mx-1.5 text-sm font-normal text-gray-400">〜</span>
                              {fmtTime(appt.endAt)}
                            </p>
                            <p className="text-xs text-gray-400">{appt.durationMin}分間</p>
                          </div>
                        </div>
                        <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", badge.cls)}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="my-3 h-px bg-gray-50" />

                      <div className="flex items-center gap-3">
                        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", AVATAR_COLORS[index % AVATAR_COLORS.length])}>
                          {getInitial(appt.patient.displayName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <p className="text-sm font-semibold text-gray-800">{appt.patient.displayName}</p>
                            <Link href={`/${slug}/patients/${appt.patient.id}`} className="text-[11px] text-[var(--brand-dark)] underline-offset-2 hover:underline">
                              患者詳細 →
                            </Link>
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                            <span>{appt.menuName}</span>
                            <span className="text-gray-300">|</span>
                            <span className="font-semibold text-gray-700">¥{appt.price.toLocaleString()}</span>
                            {appt.staff && (
                              <>
                                <span className="text-gray-300">|</span>
                                <span className="inline-flex items-center gap-1">
                                  <UserCheck size={11} className="text-gray-400" />
                                  {appt.staff.displayName}
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
                            tenantId={tenant.id}
                            tenantSlug={slug}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {listAppointments.length > 0 && (
            <p className="pb-2 text-center text-xs text-gray-400">
              {listAppointments.length}件を表示中
            </p>
          )}
        </>
      )}
    </div>
  );
}
