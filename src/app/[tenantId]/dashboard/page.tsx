/**
 * ダッシュボードページ
 * A院 / B院 の統計情報と直近の予約を表示する
 *
 * CLAUDE.md 規約: 全 Prisma クエリに tenant_id を含めること
 */

import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AppointmentStatus } from "@prisma/client";

type Props = {
  params: Promise<{ tenantId: string }>;
};

// ── ヘルパー: 日本語の相対時刻表示 ────────────────────────────────
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 0)   return "終了";
  if (diffHours < 1)   return "まもなく";
  if (diffHours < 24)  return `${diffHours}時間後`;
  if (diffDays === 1)  return "明日";
  return `${diffDays}日後`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// ── ステータスバッジ ──────────────────────────────────────────────
function StatusBadge({ status }: { status: AppointmentStatus }) {
  const config: Record<AppointmentStatus, { label: string; className: string }> = {
    pending:   { label: "承認待ち", className: "bg-amber-50 text-amber-700 border-amber-200" },
    confirmed: { label: "確定",     className: "bg-[var(--brand-bg)] text-[var(--brand-dark)] border-[var(--brand-border)]" },
    cancelled: { label: "キャンセル", className: "bg-red-50 text-red-600 border-red-200" },
    no_show:   { label: "無断欠席", className: "bg-gray-100 text-gray-500 border-gray-200" },
    completed: { label: "完了",     className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };
  const { label, className } = config[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export default async function DashboardPage({ params }: Props) {
  const { tenantId: slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { subdomain: slug },
    select: { id: true, name: true, plan: true },
  });
  if (!tenant) notFound();

  // ── 統計データを並列取得（全クエリに tenant_id を含めること）────
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalPatients,
    pendingCount,
    todayCount,
    confirmedCount,
    upcomingAppointments,
  ] = await Promise.all([
    prisma.patient.count({
      where: { tenantId: tenant.id }, // CLAUDE.md 絶対ルール
    }),
    prisma.appointment.count({
      where: { tenantId: tenant.id, status: "pending" },
    }),
    prisma.appointment.count({
      where: {
        tenantId: tenant.id,
        startAt: { gte: startOfToday, lt: endOfToday },
      },
    }),
    prisma.appointment.count({
      where: { tenantId: tenant.id, status: "confirmed" },
    }),
    prisma.appointment.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["pending", "confirmed"] },
        startAt: { gte: today },
      },
      include: {
        patient: { select: { displayName: true } },
        staff:   { select: { displayName: true } },
      },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
  ]);

  // ── 統計カード定義 ────────────────────────────────────────────────
  const stats = [
    {
      label:    "本日の予約",
      value:    todayCount,
      icon:     CalendarDays,
      iconBg:   "bg-[var(--brand-bg)]",
      iconColor: "text-[var(--brand-dark)]",
      unit:     "件",
    },
    {
      label:    "承認待ち",
      value:    pendingCount,
      icon:     AlertCircle,
      iconBg:   pendingCount > 0 ? "bg-amber-50" : "bg-gray-50",
      iconColor: pendingCount > 0 ? "text-amber-600" : "text-gray-400",
      unit:     "件",
      alert:    pendingCount > 0,
    },
    {
      label:    "確定済み",
      value:    confirmedCount,
      icon:     CheckCircle2,
      iconBg:   "bg-emerald-50",
      iconColor: "text-emerald-600",
      unit:     "件",
    },
    {
      label:    "登録患者数",
      value:    totalPatients,
      icon:     Users,
      iconBg:   "bg-indigo-50",
      iconColor: "text-indigo-600",
      unit:     "名",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── ページ見出し ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">
          ダッシュボード
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {tenant.name} の最新状況
        </p>
      </div>

      {/* ── 統計カード ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              {s.alert && (
                <div className="absolute right-0 top-0 h-1 w-full bg-amber-400" />
              )}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">{s.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-gray-800">
                    {s.value}
                    <span className="ml-1 text-base font-normal text-gray-400">
                      {s.unit}
                    </span>
                  </p>
                </div>
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.iconBg}`}
                >
                  <Icon size={20} className={s.iconColor} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 直近の予約一覧 ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        {/* テーブルヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[var(--brand-medium)]" />
            <h2 className="text-sm font-semibold text-gray-800">
              直近の予約
            </h2>
          </div>
          <span className="text-xs text-gray-400">
            承認待ち・確定済みのみ表示
          </span>
        </div>

        {upcomingAppointments.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays size={40} className="text-gray-200" />
            <p className="mt-3 text-sm font-medium text-gray-400">
              直近の予約はありません
            </p>
            <p className="mt-1 text-xs text-gray-300">
              予約一覧から新規予約を作成してください
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {upcomingAppointments.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--brand-hover)]"
              >
                {/* 日時 */}
                <div className="w-24 shrink-0 text-center">
                  <p className="text-xs font-semibold text-[var(--brand-dark)]">
                    {formatRelativeTime(appt.startAt)}
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-gray-800">
                    {formatTime(appt.startAt)}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {appt.durationMin}分
                  </p>
                </div>

                {/* 区切り線 */}
                <div className="h-10 w-px bg-gray-100" />

                {/* 患者・メニュー */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">
                    {appt.patient.displayName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {appt.menuName}
                    {appt.staff && (
                      <span className="ml-2 text-gray-400">
                        / {appt.staff.displayName}
                      </span>
                    )}
                  </p>
                </div>

                {/* ステータスバッジ */}
                <StatusBadge status={appt.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
