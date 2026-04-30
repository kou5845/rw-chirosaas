/**
 * ダッシュボードページ
 * A院 / B院 の統計情報と直近の予約を表示する
 *
 * CLAUDE.md 規約: 全 Prisma クエリに tenant_id を含めること
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { DashboardUpcomingList, type DashboardAppointment } from "./DashboardUpcomingList";
import { DashboardPendingList, type PendingAppointment } from "./DashboardPendingList";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function DashboardPage({ params }: Props) {
  const { tenantId: slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: {
      id:           true,
      name:         true,
      plan:         true,
      slotInterval: true,
    },
  });
  if (!tenant) notFound();

  // ── 統計データを並列取得 ────────────────────────────────────────
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday   = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalPatients,
    pendingCount,
    todayCount,
    confirmedCount,
    rawPending,
    rawUpcoming,
    rawHours,
    staffList,
  ] = await Promise.all([
    prisma.patient.count({
      where: { tenantId: tenant.id },
    }),
    prisma.appointment.count({
      where: { tenantId: tenant.id, status: "pending" },
    }),
    prisma.appointment.count({
      where: {
        tenantId: tenant.id,
        startAt:  { gte: startOfToday, lt: endOfToday },
      },
    }),
    prisma.appointment.count({
      where: { tenantId: tenant.id, status: "confirmed" },
    }),
    // 承認待ち一覧（全件・日時昇順）
    prisma.appointment.findMany({
      where: {
        tenantId: tenant.id,
        status:   "pending",
      },
      include: {
        patient: { select: { displayName: true } },
        staff:   { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
      take: 20,
    }),
    // 直近の確定済み予約（今日以降・日時昇順）
    prisma.appointment.findMany({
      where: {
        tenantId: tenant.id,
        status:   "confirmed",
        startAt:  { gte: today },
      },
      include: {
        patient: { select: { displayName: true } },
        staff:   { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
    prisma.businessHour.findMany({
      where:  { tenantId: tenant.id },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, hasLunchBreak: true, lunchStart: true, lunchEnd: true },
    }),
    prisma.staff.findMany({
      where:   { tenantId: tenant.id, isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }).then(staffs => staffs.map(s => ({ id: s.id, displayName: s.name }))),
  ]);

  const pendingAppointments: PendingAppointment[] = rawPending.map((a) => ({
    id:          a.id,
    startAt:     a.startAt.toISOString(),
    durationMin: a.durationMin,
    menuName:    a.menuName,
    patientId:   a.patientId,
    patientName: a.patient.displayName,
    staffName:   a.staff?.name ?? null,
  }));

  const upcomingAppointments: DashboardAppointment[] = rawUpcoming.map((a) => ({
    id:          a.id,
    status:      a.status,
    startAt:     a.startAt.toISOString(),
    durationMin: a.durationMin,
    menuName:    a.menuName,
    price:       a.price,
    patientId:   a.patientId,
    patientName: a.patient.displayName,
    staffName:   a.staff?.name ?? null,
    note:        a.note ?? null,
  }));

  // ── 統計カード定義 ──────────────────────────────────────────────
  const stats = [
    {
      label:     "本日の予約",
      value:     todayCount,
      icon:      CalendarDays,
      iconBg:    "bg-[var(--brand-bg)]",
      iconColor: "text-[var(--brand-dark)]",
      unit:      "件",
      href:      `/${slug}/appointments?view=week`,
    },
    {
      label:     "承認待ち",
      value:     pendingCount,
      icon:      AlertCircle,
      iconBg:    pendingCount > 0 ? "bg-amber-50" : "bg-gray-50",
      iconColor: pendingCount > 0 ? "text-amber-600" : "text-gray-400",
      unit:      "件",
      alert:     pendingCount > 0,
      href:      `/${slug}/appointments?view=list&tab=pending`,
    },
    {
      label:     "確定済み",
      value:     confirmedCount,
      icon:      CheckCircle2,
      iconBg:    "bg-emerald-50",
      iconColor: "text-emerald-600",
      unit:      "件",
      href:      `/${slug}/appointments?view=list&tab=confirmed`,
    },
    {
      label:     "登録患者数",
      value:     totalPatients,
      icon:      Users,
      iconBg:    "bg-indigo-50",
      iconColor: "text-indigo-600",
      unit:      "名",
      href:      `/${slug}/patients`,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── ページ見出し ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">ダッシュボード</h1>
        <p className="mt-0.5 text-sm text-gray-500">{tenant.name} の最新状況</p>
      </div>

      {/* ── 統計カード（クリックで各ページへ）── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-[var(--brand-border)] hover:shadow-md"
            >
              {s.alert && (
                <div className="absolute right-0 top-0 h-1 w-full bg-amber-400" />
              )}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">{s.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-gray-800">
                    {s.value}
                    <span className="ml-1 text-base font-normal text-gray-400">{s.unit}</span>
                  </p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${s.iconBg}`}>
                  <Icon size={20} className={s.iconColor} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── 承認待ちセクション（pending が 1 件以上ある場合のみ表示）── */}
      {pendingAppointments.length > 0 && (
        <DashboardPendingList
          tenantId={tenant.id}
          tenantSlug={slug}
          appointments={pendingAppointments}
        />
      )}

      {/* ── 直近の確定済み予約一覧 ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* テーブルヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[var(--brand-medium)]" />
            <h2 className="text-sm font-semibold text-gray-800">直近の予約</h2>
          </div>
          <Link
            href={`/${slug}/appointments?view=list`}
            className="text-xs text-[var(--brand-dark)] underline-offset-2 hover:underline"
          >
            すべて見る →
          </Link>
        </div>

        <DashboardUpcomingList
          tenantId={tenant.id}
          tenantSlug={slug}
          appointments={upcomingAppointments}
          staffList={staffList}
          businessHours={rawHours}
          slotInterval={tenant.slotInterval}
        />
      </div>
    </div>
  );
}
