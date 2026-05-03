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
  CalendarDays,
  CalendarRange,
  List,
  XCircle,
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  parseISO,
  isValid,
  format,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { type SerializedAppointment, type BusinessHourData } from "@/components/appointments/WeeklyCalendar";
import { AppointmentsWeekView } from "@/components/appointments/AppointmentsWeekView";
import { MonthlyCalendar } from "@/components/appointments/MonthlyCalendar";
import { AppointmentListCard, type ListAppointment } from "./AppointmentListCard";
import { PendingApprovalList } from "./PendingApprovalList";
import type { AppointmentStatus } from "@prisma/client";
import type { ServiceItem, ExerciseItem } from "@/components/appointments/NewAppointmentDialog";

type Props = {
  params:       Promise<{ tenantId: string }>;
  searchParams: Promise<{ view?: string; tab?: string; week?: string; month?: string }>;
};

type Tab = "pending" | "confirmed" | "archive" | "rejected";

// ── 日時フォーマット（ビュー切替URLで使用）──────────────────────

export default async function AppointmentsPage({ params, searchParams }: Props) {
  const { tenantId: slug }            = await params;
  const { view, tab, week, month }    = await searchParams;

  const currentView = view === "list" ? "list" : view === "month" ? "month" : "week";
  const isWeekView  = currentView === "week";
  const isMonthView = currentView === "month";
  const activeTab: Tab =
    tab === "confirmed" ? "confirmed" :
    tab === "archive"   ? "archive"   :
    tab === "rejected"  ? "rejected"  : "pending";

  // ── テナント解決（営業時間・昼休みも取得）────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: {
      id:           true,
      name:         true,
      slotInterval: true,
      maxCapacity:  true,
    },
  });
  if (!tenant) notFound();

  // ── バッチ1: フィーチャートグル・マスタデータ・カウントを並列取得 ──────────
  // （tenant.id が判明した時点で全て独立して実行可能）
  const [
    karteFeature,
    trainingFeature,
    servicesRaw,
    rawHours,
    staffListRaw,
    patientListRaw,
    pendingCount,
  ] = await Promise.all([
    prisma.tenantSetting.findUnique({
      where:  { tenantId_featureKey: { tenantId: tenant.id, featureKey: "karte_mode" } },
      select: { featureValue: true },
    }),
    prisma.tenantSetting.findUnique({
      where:  { tenantId_featureKey: { tenantId: tenant.id, featureKey: "training_record" } },
      select: { featureValue: true },
    }),
    // Service マスタ（施術メニュー選択用: 全テナント共通）CLAUDE.md 絶対ルール
    prisma.service.findMany({
      where:   { tenantId: tenant.id, isActive: true },
      select:  { id: true, name: true, duration: true, intervalMin: true, price: true },
      orderBy: { sortOrder: "asc" },
    }),
    // 曜日別営業時間
    prisma.businessHour.findMany({
      where:  { tenantId: tenant.id },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, hasLunchBreak: true, lunchStart: true, lunchEnd: true },
    }),
    // スタッフ一覧（週間ビューの新規予約モーダル + リストビューの編集ダイアログで使用）
    prisma.staff.findMany({
      where:   { tenantId: tenant.id, isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // 患者一覧（週間ビューの新規予約モーダルのみ）
    isWeekView
      ? prisma.patient.findMany({
          where:   { tenantId: tenant.id },
          select:  { id: true, displayName: true, nameKana: true },
          orderBy: { displayName: "asc" },
        })
      : Promise.resolve([]),
    // 承認待ちカウント（ビュー共通で使用）CLAUDE.md 絶対ルール
    prisma.appointment.count({
      where: { tenantId: tenant.id, status: "pending" },
    }),
  ]);

  const isProfessional  = karteFeature?.featureValue === "professional";
  const trainingEnabled = trainingFeature?.featureValue === "true";
  const services: ServiceItem[] = servicesRaw;
  const businessHours: BusinessHourData[] = rawHours;
  const staffList = staffListRaw.map(s => ({ id: s.id, displayName: s.name }));
  const patientList = patientListRaw;

  // ── バッチ2: Exercise マスタ取得（isProfessional && trainingEnabled の結果に依存）──
  // Exercise マスタ取得（training_record 有効テナントのみ）CLAUDE.md 絶対ルール
  const exercisesRaw = isProfessional && trainingEnabled
    ? await prisma.exercise.findMany({
        where:   { tenantId: tenant.id, isActive: true },
        select:  { id: true, name: true, duration: true, intervalMin: true, price: true, category: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const exercises: ExerciseItem[] = exercisesRaw;

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
        staff:   { select: { name: true } },
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
      staffName:   a.staff?.name ?? null,
      note:        a.note ?? null,
    }));
  }

  // ── 月間ビュー用データ ────────────────────────────────────────
  let monthStr = "";
  let monthlyAppointments: SerializedAppointment[] = [];

  if (isMonthView) {
    const baseDate = month && /^\d{4}-\d{2}$/.test(month)
      ? parseISO(month + "-01")
      : new Date();
    const mStart  = startOfMonth(baseDate);
    const mEnd    = endOfMonth(baseDate);
    // カレンダーグリッドはパディング週を含む（月曜始まり）
    const calStart = startOfWeek(mStart, { weekStartsOn: 1 });
    const calEnd   = endOfWeek(mEnd,     { weekStartsOn: 1 });
    monthStr = format(mStart, "yyyy-MM");

    const rawAppts = await prisma.appointment.findMany({
      where: {
        tenantId: tenant.id, // CLAUDE.md 絶対ルール
        startAt:  { gte: calStart, lte: addDays(calEnd, 1) },
        status:   { in: ["pending", "confirmed", "completed"] },
      },
      include: {
        patient: { select: { id: true, displayName: true } },
        staff:   { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    });

    monthlyAppointments = rawAppts.map((a) => ({
      id:          a.id,
      status:      a.status,
      startAt:     a.startAt.toISOString(),
      endAt:       a.endAt.toISOString(),
      menuName:    a.menuName,
      durationMin: a.durationMin,
      price:       a.price,
      patientId:   a.patient.id,
      patientName: a.patient.displayName,
      staffName:   a.staff?.name ?? null,
      note:        a.note ?? null,
    }));
  }

  // ── リストビュー用データ ──────────────────────────────────────
  let listAppointments: Awaited<ReturnType<typeof prisma.appointment.findMany<{
    include: { patient: { select: { id: true; displayName: true } }; staff:   { select: { name: true } } };
  }>>> = [];
  let confirmedCount = 0;
  let archiveCount   = 0;
  let rejectedCount  = 0;

  if (currentView === "list") {
    // endAt は @db.Timestamptz（UTC保存）。new Date() も UTC のため、
    // JST 変換なしに直接比較して正確な時刻判定が可能。
    const now = new Date();

    // 「確定済み」カウント: confirmed かつ endAt が現在より未来
    // 「完了・過去」カウント: completed/cancelled/no_show + 終了済みの confirmed
    // 「お断り済み」カウント: rejected のみ
    [confirmedCount, archiveCount, rejectedCount] = await Promise.all([
      prisma.appointment.count({
        where: { tenantId: tenant.id, status: "confirmed", endAt: { gt: now } },
      }),
      prisma.appointment.count({
        where: {
          tenantId: tenant.id,
          OR: [
            { status: { in: ["completed", "cancelled", "no_show"] } },
            { status: "confirmed", endAt: { lte: now } },
          ],
        },
      }),
      prisma.appointment.count({
        where: { tenantId: tenant.id, status: "rejected" },
      }),
    ]);

    if (activeTab === "pending") {
      listAppointments = await prisma.appointment.findMany({
        where:   { tenantId: tenant.id, status: "pending" },
        include: { patient: { select: { id: true, displayName: true } }, staff: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      });
    } else if (activeTab === "confirmed") {
      // 終了時刻が未来の confirmed のみ表示
      listAppointments = await prisma.appointment.findMany({
        where:   { tenantId: tenant.id, status: "confirmed", endAt: { gt: now } },
        include: { patient: { select: { id: true, displayName: true } }, staff: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      });
    } else if (activeTab === "rejected") {
      listAppointments = await prisma.appointment.findMany({
        where:   { tenantId: tenant.id, status: "rejected" },
        include: { patient: { select: { id: true, displayName: true } }, staff: { select: { name: true } } },
        orderBy: { startAt: "desc" },
      });
    } else {
      // 完了・過去: completed/cancelled/no_show + 終了済みの confirmed
      listAppointments = await prisma.appointment.findMany({
        where: {
          tenantId: tenant.id,
          OR: [
            { status: { in: ["completed", "cancelled", "no_show"] } },
            { status: "confirmed", endAt: { lte: now } },
          ],
        },
        include: { patient: { select: { id: true, displayName: true } }, staff: { select: { name: true } } },
        orderBy: { startAt: "desc" },
      });
    }
  }

  return (
    <div className={cn("mx-auto space-y-5", currentView !== "list" ? "max-w-full" : "max-w-3xl")}>

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
            href={`/${slug}/appointments?view=month&month=${monthStr || format(new Date(), "yyyy-MM")}`}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all",
              isMonthView
                ? "bg-[var(--brand-bg)] text-[var(--brand-dark)] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <CalendarRange size={14} />
            <span className="hidden sm:inline">月間</span>
          </Link>
          <Link
            href={`/${slug}/appointments?view=list`}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all",
              currentView === "list"
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

      {/* ══ 月間カレンダービュー ══ */}
      {isMonthView && (
        <MonthlyCalendar
          monthStr={monthStr || format(new Date(), "yyyy-MM")}
          appointments={monthlyAppointments}
          slug={slug}
        />
      )}

      {/* ══ 週間カレンダービュー ══ */}
      {isWeekView && (
        <AppointmentsWeekView
          weekStartStr={weekStartStr}
          appointments={weeklyAppointments}
          slug={slug}
          pendingCount={pendingCount}
          tenantId={tenant.id}
          businessHours={businessHours}
          slotInterval={tenant.slotInterval}
          maxCapacity={tenant.maxCapacity}
          staffList={staffList}
          patientList={patientList}
          services={services}
          exercises={exercises}
          isProfessional={isProfessional}
          trainingEnabled={trainingEnabled}
        />
      )}

      {/* ══ リストビュー ══ */}
      {currentView === "list" && (
        <>
          {/* タブバー */}
          <nav className="flex gap-1 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
            {([
              { key: "pending"   as Tab, label: "承認待ち",   count: pendingCount,   Icon: Clock },
              { key: "confirmed" as Tab, label: "確定済み",   count: confirmedCount, Icon: CheckCircle2 },
              { key: "archive"   as Tab, label: "完了・過去", count: archiveCount,   Icon: Archive },
              { key: "rejected"  as Tab, label: "お断り済み", count: rejectedCount,  Icon: XCircle },
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
                        : key === "rejected"
                          ? "bg-red-50 text-red-700 shadow-sm"
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
                          : key === "rejected"
                            ? "bg-red-100 text-red-800"
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
                {activeTab === "rejected"  && "お断りした予約はありません"}
              </p>
              {activeTab === "pending" && (
                <p className="mt-1 text-xs text-gray-300">
                  患者からの予約申込があると、ここに表示されます
                </p>
              )}
            </div>
          ) : activeTab === "pending" ? (
            /* ── 承認待ちタブ: 一括承認UI ── */
            <PendingApprovalList
              appointments={listAppointments.map((appt) => ({
                id:          appt.id,
                status:      appt.status,
                startAt:     appt.startAt,
                endAt:       appt.endAt,
                durationMin: appt.durationMin,
                menuName:    appt.menuName,
                price:       appt.price,
                note:        appt.note,
                patientId:   appt.patient.id,
                patientName: appt.patient.displayName,
                staffName:   appt.staff?.name ?? null,
              }))}
              slug={slug}
              tenantId={tenant.id}
              staffList={staffList}
              businessHours={businessHours}
              slotInterval={tenant.slotInterval}
            />
          ) : (
            /* ── 確定済み / アーカイブタブ: 通常リスト ── */
            <div className="space-y-3">
              {listAppointments.map((appt, index) => {
                const listAppt: ListAppointment = {
                  id:          appt.id,
                  status:      appt.status,
                  startAt:     appt.startAt,
                  endAt:       appt.endAt,
                  durationMin: appt.durationMin,
                  menuName:    appt.menuName,
                  price:       appt.price,
                  note:        appt.note,
                  patientId:   appt.patient.id,
                  patientName: appt.patient.displayName,
                  staffName:   appt.staff?.name ?? null,
                };
                return (
                  <AppointmentListCard
                    key={appt.id}
                    appt={listAppt}
                    index={index}
                    slug={slug}
                    tenantId={tenant.id}
                    tenantSlug={slug}
                    staffList={staffList}
                    businessHours={businessHours}
                    slotInterval={tenant.slotInterval}
                    services={services}
                    exercises={exercises}
                    isProfessional={isProfessional}
                    trainingEnabled={trainingEnabled}
                  />
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
