/**
 * 予約分析ページ
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - tenantId はセッション由来の値のみ使用
 */

import { notFound } from "next/navigation";
import {
  startOfMonth, endOfMonth, subMonths,
  parseISO, format, eachMonthOfInterval,
} from "date-fns";
import { ja } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { AnalyticsCharts } from "./AnalyticsCharts";

export type MonthlyTrend = {
  monthLabel: string;  // "4月"
  monthKey:   string;  // "2026-04"
  total:      number;
  completed:  number;
  cancelled:  number;
  revenue:    number;
};

export type ServiceStat = {
  name:    string;
  count:   number;
  revenue: number;
};

export type HeatmapCell = {
  dow:   number; // 0=月 … 6=日
  hour:  number; // 9〜19
  count: number;
};

export type AnalyticsData = {
  selectedMonth: string;
  kpi: {
    total:             number;
    completed:         number;
    cancelled:         number;
    pending:           number;
    confirmed:         number;
    revenue:           number;
    newPatients:       number;
    returningPatients: number;
    uniquePatients:    number;
    prevMonthTotal:    number;
    prevMonthRevenue:  number;
    cancelRate:        number; // %
  };
  monthlyTrend:   MonthlyTrend[];
  serviceRanking: ServiceStat[];
  heatmap:        HeatmapCell[];
  lineStats: {
    connected: number;
    total:     number;
  };
};

type Props = {
  params:       Promise<{ tenantId: string }>;
  searchParams: Promise<{ month?: string }>;
};

export default async function AnalyticsPage({ params, searchParams }: Props) {
  const { tenantId: slug } = await params;
  const { month }          = await searchParams;

  // テナント解決 CLAUDE.md 絶対ルール
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  // 選択月の決定
  const baseDate   = month && /^\d{4}-\d{2}$/.test(month) ? parseISO(month + "-01") : new Date();
  const mStart     = startOfMonth(baseDate);
  const mEnd       = endOfMonth(baseDate);
  const selectedMonth = format(mStart, "yyyy-MM");

  // 前月
  const prevStart  = startOfMonth(subMonths(mStart, 1));
  const prevEnd    = endOfMonth(subMonths(mStart, 1));

  // 過去6ヶ月範囲（トレンド用）
  const trendStart = startOfMonth(subMonths(mStart, 5));

  // ── 並列クエリ ──────────────────────────────────────────────────────
  const [
    monthAppts,
    prevMonthAppts,
    trendAppts,
    allPatients,
    linePatients,
    firstApptByPatient,
  ] = await Promise.all([

    // 当月全予約（KPI + 施術別 + ヒートマップ）
    prisma.appointment.findMany({
      where:  { tenantId: tenant.id, startAt: { gte: mStart, lte: mEnd } },
      select: { id: true, status: true, menuName: true, price: true, startAt: true, patientId: true },
    }),

    // 前月予約（前月比用）
    prisma.appointment.findMany({
      where:  { tenantId: tenant.id, startAt: { gte: prevStart, lte: prevEnd } },
      select: { status: true, price: true },
    }),

    // 過去6ヶ月予約（月次トレンド）
    prisma.appointment.findMany({
      where:  { tenantId: tenant.id, startAt: { gte: trendStart, lte: mEnd } },
      select: { status: true, startAt: true, price: true },
    }),

    // 全患者（LINE分析）
    prisma.patient.count({
      where: { tenantId: tenant.id, isActive: true },
    }),

    // LINE連携済み患者
    prisma.patient.count({
      where: { tenantId: tenant.id, isActive: true, lineUserId: { not: null } },
    }),

    // 患者ごとの最初の予約日（新患 vs リピーター判定）
    prisma.appointment.groupBy({
      by:     ["patientId"],
      where:  { tenantId: tenant.id, status: { in: ["completed", "confirmed"] } },
      _min:   { startAt: true },
    }),
  ]);

  // ── KPI 集計 ──────────────────────────────────────────────────────
  const completedAppts  = monthAppts.filter(a => a.status === "completed");
  const cancelledAppts  = monthAppts.filter(a => a.status === "cancelled" || a.status === "no_show");
  const pendingAppts    = monthAppts.filter(a => a.status === "pending");
  const confirmedAppts  = monthAppts.filter(a => a.status === "confirmed");

  const revenue         = completedAppts.reduce((s, a) => s + a.price, 0);
  const prevRevenue     = prevMonthAppts.filter(a => a.status === "completed").reduce((s, a) => s + a.price, 0);
  const prevTotal       = prevMonthAppts.length;
  const cancelRate      = monthAppts.length > 0
    ? Math.round((cancelledAppts.length / monthAppts.length) * 100)
    : 0;

  // 新患 vs リピーター（当月に来た患者の中で初来院かどうか）
  const monthPatientIds  = [...new Set(monthAppts.map(a => a.patientId))];
  const firstApptMap     = new Map(firstApptByPatient.map(r => [r.patientId, r._min.startAt]));
  const newPatients      = monthPatientIds.filter(pid => {
    const first = firstApptMap.get(pid);
    return first && first >= mStart && first <= mEnd;
  }).length;
  const returningPatients = monthPatientIds.length - newPatients;

  // ── 月次トレンド ───────────────────────────────────────────────────
  const months = eachMonthOfInterval({ start: trendStart, end: mStart });
  const monthlyTrend: MonthlyTrend[] = months.map(m => {
    const key   = format(m, "yyyy-MM");
    const ms    = startOfMonth(m);
    const me    = endOfMonth(m);
    const appts = trendAppts.filter(a => a.startAt >= ms && a.startAt <= me);
    return {
      monthLabel: format(m, "M月", { locale: ja }),
      monthKey:   key,
      total:      appts.length,
      completed:  appts.filter(a => a.status === "completed").length,
      cancelled:  appts.filter(a => a.status === "cancelled" || a.status === "no_show").length,
      revenue:    appts.filter(a => a.status === "completed").reduce((s, a) => s + a.price, 0),
    };
  });

  // ── 施術別ランキング ──────────────────────────────────────────────
  const serviceMap = new Map<string, { count: number; revenue: number }>();
  for (const a of monthAppts) {
    const key = a.menuName || "（未設定）";
    const cur = serviceMap.get(key) ?? { count: 0, revenue: 0 };
    cur.count++;
    if (a.status === "completed") cur.revenue += a.price;
    serviceMap.set(key, cur);
  }
  const serviceRanking: ServiceStat[] = [...serviceMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── 時間帯×曜日ヒートマップ ─────────────────────────────────────
  // 過去6ヶ月の confirmed/completed 予約を集計
  const heatmapRaw = new Map<string, number>();
  for (const a of trendAppts) {
    if (a.status !== "completed" && a.status !== "confirmed") continue;
    const d   = new Date(a.startAt);
    // getDay(): 0=日,1=月...6=土 → 月曜始まり 0-6 に変換
    const dow  = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    if (hour < 8 || hour > 20) continue;
    const key  = `${dow}-${hour}`;
    heatmapRaw.set(key, (heatmapRaw.get(key) ?? 0) + 1);
  }
  const heatmap: HeatmapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 8; hour <= 20; hour++) {
      heatmap.push({ dow, hour, count: heatmapRaw.get(`${dow}-${hour}`) ?? 0 });
    }
  }

  const data: AnalyticsData = {
    selectedMonth,
    kpi: {
      total:             monthAppts.length,
      completed:         completedAppts.length,
      cancelled:         cancelledAppts.length,
      pending:           pendingAppts.length,
      confirmed:         confirmedAppts.length,
      revenue,
      newPatients,
      returningPatients,
      uniquePatients:    monthPatientIds.length,
      prevMonthTotal:    prevTotal,
      prevMonthRevenue:  prevRevenue,
      cancelRate,
    },
    monthlyTrend,
    serviceRanking,
    heatmap,
    lineStats: { connected: linePatients, total: allPatients },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">予約分析</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {format(mStart, "yyyy年M月", { locale: ja })}のデータ
        </p>
      </div>
      <AnalyticsCharts data={data} slug={slug} />
    </div>
  );
}
