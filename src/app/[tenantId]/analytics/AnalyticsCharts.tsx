"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import type { AnalyticsData } from "./page";

// ── 数値フォーマット ──────────────────────────────────────────────────────────

function fmtYen(v: number): string {
  return v >= 10000
    ? `${(v / 10000).toFixed(1).replace(/\.0$/, "")}万円`
    : `${v.toLocaleString()}円`;
}

function fmtPct(v: number): string { return `${v}%`; }

// ── 前月比バッジ ──────────────────────────────────────────────────────────────

function DiffBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0) return null;
  const diff    = current - prev;
  const pct     = Math.round((diff / prev) * 100);
  const up      = diff > 0;
  const neutral = diff === 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
      neutral ? "bg-gray-100 text-gray-500"
              : up ? "bg-emerald-50 text-emerald-700"
                   : "bg-red-50 text-red-600",
    )}>
      {neutral ? <Minus size={10} /> : up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {neutral ? "±0" : `${up ? "+" : ""}${pct}%`}
    </span>
  );
}

// ── KPI カード ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent = false,
}: {
  label: string;
  value: string;
  sub?:  React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col gap-1 rounded-2xl border p-4 shadow-sm",
      accent ? "border-[var(--brand-border)] bg-[var(--brand-bg)]" : "border-gray-100 bg-white",
    )}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={cn(
        "text-2xl font-bold tracking-tight",
        accent ? "text-[var(--brand-dark)]" : "text-gray-800",
      )}>{value}</p>
      {sub && <div className="flex items-center gap-1.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ── セクションタイトル ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-gray-700">{children}</h2>
  );
}

// ── 月ナビ ────────────────────────────────────────────────────────────────────

function monthOffset(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MonthNav({ slug, selectedMonth }: { slug: string; selectedMonth: string }) {
  const [y, m] = selectedMonth.split("-").map(Number);
  const label  = `${y}年${m}月`;
  const prev   = monthOffset(selectedMonth, -1);
  const next   = monthOffset(selectedMonth, +1);
  const today  = new Date();
  const isCurrent =
    selectedMonth === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/${slug}/analytics?month=${prev}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
        aria-label="前月"
      >
        <ChevronLeft size={16} />
      </Link>
      <span className="min-w-[88px] text-center text-sm font-semibold text-gray-700">{label}</span>
      <Link
        href={`/${slug}/analytics?month=${next}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
        aria-label="翌月"
      >
        <ChevronRight size={16} />
      </Link>
      {!isCurrent && (
        <Link
          href={`/${slug}/analytics`}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
        >
          今月
        </Link>
      )}
    </div>
  );
}

// ── 月次トレンドチャート ──────────────────────────────────────────────────────

function TrendChart({ data }: { data: AnalyticsData["monthlyTrend"] }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <SectionTitle>月次予約トレンド（過去6ヶ月）</SectionTitle>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false} tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
              formatter={(v, name) => {
                const labels: Record<string, string> = { completed: "完了", cancelled: "ｷｬﾝｾﾙ", total: "合計" };
                const key = String(name);
                return [`${v}件`, labels[key] ?? key];
              }}
            />
            <Legend
              formatter={(v) => {
                const labels: Record<string, string> = { completed: "完了", cancelled: "キャンセル", total: "合計" };
                return labels[v] ?? v;
              }}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="total"     fill="#C8EDF0" radius={[4, 4, 0, 0]} name="total" />
            <Bar dataKey="completed" fill="#5BBAC4" radius={[4, 4, 0, 0]} name="completed" />
            <Bar dataKey="cancelled" fill="#FCA5A5" radius={[4, 4, 0, 0]} name="cancelled" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 施術別ランキング ──────────────────────────────────────────────────────────

function ServiceRanking({ data }: { data: AnalyticsData["serviceRanking"] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <SectionTitle>施術別予約件数（当月）</SectionTitle>
      {data.length === 0 ? (
        <p className="mt-6 text-center text-sm text-gray-300">データなし</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.map((s, i) => (
            <div key={s.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-gray-700">
                  <span className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                    i === 0 ? "bg-amber-100 text-amber-700"
                    : i === 1 ? "bg-gray-100 text-gray-600"
                    : i === 2 ? "bg-orange-50 text-orange-600"
                    : "bg-gray-50 text-gray-400",
                  )}>{i + 1}</span>
                  <span className="truncate max-w-[140px]">{s.name}</span>
                </span>
                <span className="shrink-0 text-gray-500">
                  {s.count}件
                  {s.revenue > 0 && (
                    <span className="ml-2 text-gray-400">{fmtYen(s.revenue)}</span>
                  )}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 時間帯×曜日ヒートマップ ─────────────────────────────────────────────────

const DOW_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function Heatmap({ data }: { data: AnalyticsData["heatmap"] }) {
  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8〜20
  const maxCount = Math.max(...data.map(d => d.count), 1);

  function getCell(dow: number, hour: number) {
    return data.find(d => d.dow === dow && d.hour === hour);
  }

  function intensityClass(count: number): string {
    if (count === 0) return "bg-gray-50";
    const ratio = count / maxCount;
    if (ratio < 0.2) return "bg-[#C8EDF0]";
    if (ratio < 0.4) return "bg-[#91D2D9]";
    if (ratio < 0.6) return "bg-[#5BBAC4]";
    if (ratio < 0.8) return "bg-[#3da3ae]";
    return "bg-[var(--brand-dark)]";
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <SectionTitle>時間帯×曜日 混雑ヒートマップ（過去6ヶ月）</SectionTitle>
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          <span>少</span>
          {["bg-[#C8EDF0]","bg-[#91D2D9]","bg-[#5BBAC4]","bg-[#3da3ae]","bg-[var(--brand-dark)]"].map((c, i) => (
            <span key={i} className={cn("h-3 w-3 rounded-sm", c)} />
          ))}
          <span>多</span>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[420px]">
          {/* 曜日ヘッダー */}
          <div className="flex">
            <div className="w-10 shrink-0" />
            {DOW_LABELS.map((d, i) => (
              <div
                key={d}
                className={cn(
                  "flex-1 py-1 text-center text-[11px] font-semibold",
                  i === 5 ? "text-blue-500" : i === 6 ? "text-red-500" : "text-gray-400",
                )}
              >
                {d}
              </div>
            ))}
          </div>
          {/* 時間行 */}
          {hours.map(hour => (
            <div key={hour} className="flex items-center">
              <div className="w-10 shrink-0 pr-2 text-right text-[10px] text-gray-400">
                {hour}:00
              </div>
              {Array.from({ length: 7 }, (_, dow) => {
                const cell = getCell(dow, hour);
                const count = cell?.count ?? 0;
                return (
                  <div
                    key={dow}
                    title={`${DOW_LABELS[dow]}曜 ${hour}:00 — ${count}件`}
                    className={cn(
                      "m-0.5 flex-1 rounded-sm",
                      "h-6 transition-opacity hover:opacity-70",
                      intensityClass(count),
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 患者分析 ──────────────────────────────────────────────────────────────────

function PatientBreakdown({ kpi }: { kpi: AnalyticsData["kpi"] }) {
  const total = kpi.newPatients + kpi.returningPatients;
  const newPct = total > 0 ? Math.round((kpi.newPatients / total) * 100) : 0;
  const retPct = 100 - newPct;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <SectionTitle>患者内訳（当月）</SectionTitle>
      <div className="mt-4 space-y-4">
        {/* 積み上げバー */}
        <div>
          <div className="flex overflow-hidden rounded-full h-4 bg-gray-100">
            {kpi.newPatients > 0 && (
              <div
                className="h-full bg-[var(--brand)] transition-all"
                style={{ width: `${newPct}%` }}
                title={`新患 ${kpi.newPatients}名`}
              />
            )}
            {kpi.returningPatients > 0 && (
              <div
                className="h-full bg-[var(--brand-light)] transition-all"
                style={{ width: `${retPct}%` }}
                title={`リピーター ${kpi.returningPatients}名`}
              />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
              新患 {kpi.newPatients}名 ({newPct}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-light)]" />
              リピーター {kpi.returningPatients}名 ({retPct}%)
            </span>
          </div>
        </div>

        {/* ステータス内訳 */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {[
            { label: "完了",       value: kpi.completed,  color: "bg-[var(--brand)]"    },
            { label: "確定済み",   value: kpi.confirmed,  color: "bg-[var(--brand-medium)]" },
            { label: "承認待ち",   value: kpi.pending,    color: "bg-amber-400"          },
            { label: "ｷｬﾝｾﾙ/No Show", value: kpi.cancelled, color: "bg-red-300"        },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color)} />
              <span className="text-xs text-gray-500">{label}</span>
              <span className="ml-auto text-xs font-semibold text-gray-700">{value}件</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── LINE 統計 ──────────────────────────────────────────────────────────────────

function LineStats({ lineStats }: { lineStats: AnalyticsData["lineStats"] }) {
  const connectedPct = lineStats.total > 0
    ? Math.round((lineStats.connected / lineStats.total) * 100)
    : 0;
  const notConnected = lineStats.total - lineStats.connected;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <SectionTitle>LINE 連携状況</SectionTitle>
      <div className="mt-4 space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-3xl font-bold text-[var(--brand-dark)]">{connectedPct}%</p>
          <p className="text-xs text-gray-400">全{lineStats.total}名中</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[#00C300] transition-all"
            style={{ width: `${connectedPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#00C300]" />
            連携済み {lineStats.connected}名
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
            未連携 {notConnected}名
          </span>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export function AnalyticsCharts({ data, slug }: { data: AnalyticsData; slug: string }) {
  const { kpi, monthlyTrend, serviceRanking, heatmap, lineStats, selectedMonth } = data;

  return (
    <div className="space-y-6">

      {/* 月ナビ */}
      <MonthNav slug={slug} selectedMonth={selectedMonth} />

      {/* ── KPI カード ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="予約総数"
          value={`${kpi.total}件`}
          sub={
            <>
              前月比
              <DiffBadge current={kpi.total} prev={kpi.prevMonthTotal} />
            </>
          }
          accent
        />
        <KpiCard
          label="売上（完了分）"
          value={fmtYen(kpi.revenue)}
          sub={
            <>
              前月比
              <DiffBadge current={kpi.revenue} prev={kpi.prevMonthRevenue} />
            </>
          }
        />
        <KpiCard
          label="来院患者数"
          value={`${kpi.uniquePatients}名`}
          sub={<>新患 {kpi.newPatients}名 / リピーター {kpi.returningPatients}名</>}
        />
        <KpiCard
          label="キャンセル率"
          value={fmtPct(kpi.cancelRate)}
          sub={<>ｷｬﾝｾﾙ+No Show {kpi.cancelled}件</>}
        />
      </div>

      {/* ── 月次トレンド ── */}
      <TrendChart data={monthlyTrend} />

      {/* ── 施術別 + 患者内訳 ── */}
      <div className="grid gap-5 md:grid-cols-2">
        <ServiceRanking data={serviceRanking} />
        <PatientBreakdown kpi={kpi} />
      </div>

      {/* ── ヒートマップ ── */}
      <Heatmap data={heatmap} />

      {/* ── LINE 統計 ── */}
      <div className="grid gap-5 md:grid-cols-3">
        <LineStats lineStats={lineStats} />

        {/* キャンセル詳細 */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:col-span-2">
          <SectionTitle>予約ステータス詳細（当月）</SectionTitle>
          <div className="mt-4 space-y-2">
            {[
              { label: "完了",           value: kpi.completed,  total: kpi.total, color: "bg-[var(--brand)]"        },
              { label: "確定済み（今後）", value: kpi.confirmed,  total: kpi.total, color: "bg-[var(--brand-medium)]" },
              { label: "承認待ち",        value: kpi.pending,    total: kpi.total, color: "bg-amber-400"             },
              { label: "キャンセル/No Show", value: kpi.cancelled, total: kpi.total, color: "bg-red-300"             },
            ].map(({ label, value, total, color }) => {
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-semibold text-gray-700">{value}件 <span className="font-normal text-gray-400">({pct}%)</span></span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
