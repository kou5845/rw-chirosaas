"use client";

/**
 * TrainingAnalysisTab — 体組成進捗グラフ（管理画面）
 *
 * - 設定で ON になっている体組成指標をプルダウンで選択して折れ線グラフ表示
 * - Y軸の単位（kg, %, kcal, Lv）は選択指標に合わせて自動切替
 * - CLAUDE.md: ブランドカラー (#5BBAC4 系) を基調とし、各指標固有色でアクセント
 */

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Scale, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getEnabledMetrics,
  getMetricColor,
  type BodyCompDataPoint,
  type MetricConfigItem,
} from "@/lib/training-metrics";

// ─────────────────────────────────────────────────────────────────────────────
// 型（ページ側から import される）
// ─────────────────────────────────────────────────────────────────────────────

// 後方互換のため旧型も export しておく（import 側で使われているため）
export type RecordPoint = {
  date: string; dateLabel: string; volume: number; orm: number;
  sets: number | null; reps: number | null; weightKg: number | null;
};
export type ExerciseChartData = {
  exerciseId: string; exerciseName: string; category: string | null; records: RecordPoint[];
};

type Props = {
  bodyCompData: BodyCompDataPoint[];
  metricsConfig: MetricConfigItem[];
};

// ─────────────────────────────────────────────────────────────────────────────
// カスタム Tooltip
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  meta,
  color,
}: {
  active?:   boolean;
  payload?:  { value: number }[];
  label?:    string;
  meta?:     MetricConfigItem;
  color:     string;
}) {
  if (!active || !payload?.length || !meta) return null;
  const value = payload[0].value;

  return (
    <div className="min-w-[140px] rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </p>
      <p className="text-xl font-bold" style={{ color }}>
        {value.toLocaleString()}
        {meta.unit && (
          <span className="ml-1 text-xs font-normal text-gray-400">{meta.unit}</span>
        )}
      </p>
      <p className="text-[10px] text-gray-400">{meta.label}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-800">{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function TrainingAnalysisTab({ bodyCompData, metricsConfig }: Props) {
  const enabledMetrics = getEnabledMetrics(metricsConfig);
  const [selectedId, setSelectedId] = useState<string>(
    enabledMetrics[0]?.id ?? "weight"
  );

  if (bodyCompData.length === 0 || enabledMetrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-bg)]">
          <Scale size={28} className="text-[var(--brand-medium)]" />
        </div>
        <p className="mt-4 text-sm font-medium text-gray-400">
          {enabledMetrics.length === 0
            ? "表示する指標が設定されていません"
            : "体組成データがありません"}
        </p>
        <p className="mt-1 text-xs text-gray-300">
          {enabledMetrics.length === 0
            ? "設定ページで体組成指標を ON にしてください"
            : "トレーニングカルテに体組成データを記録するとここに表示されます"}
        </p>
      </div>
    );
  }

  const metaListIdx = enabledMetrics.findIndex((m) => m.id === selectedId);
  const metaIndex = metaListIdx >= 0 ? metaListIdx : 0;
  const meta = enabledMetrics[metaIndex];
  if (!meta) return null;

  const color = getMetricColor(meta.id, metaIndex);

  // 選択した指標のデータポイントのみ（null を除外してフィルタ）
  const chartData = bodyCompData
    .filter((d) => d[meta.id] != null)
    .map((d) => ({ ...d, value: typeof d[meta.id] === 'number' ? d[meta.id] as number : parseFloat(String(d[meta.id])) }));

  // 統計
  const values     = chartData.map((d) => d.value);
  const maxVal     = values.length ? Math.max(...values) : 0;
  const latestVal  = values.length ? values[values.length - 1] : 0;
  const firstVal   = values.length ? values[0] : 0;
  const improvement =
    firstVal > 0 ? ((latestVal - firstVal) / firstVal) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* ── コントロールバー ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <label
            htmlFor="metric-select"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400"
          >
            指標
          </label>
          <select
            id="metric-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={cn(
              "h-9 w-full min-w-[160px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700",
              "appearance-none focus:border-[var(--brand-medium)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-border)]",
            )}
          >
            {enabledMetrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.unit ? ` (${m.unit})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* 改善率インジケーター */}
        {chartData.length >= 2 && isFinite(improvement) && (
          <div className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm",
            improvement >= 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-600",
          )}>
            <TrendingUp size={13} className="shrink-0" />
            <span className="font-bold">
              {improvement >= 0 ? "+" : ""}{improvement.toFixed(1)}%
            </span>
            <span className="text-xs opacity-70">初回比</span>
          </div>
        )}
      </div>

      {/* ── グラフエリア ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {chartData.length < 2 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-300">
            この指標のデータが2件未満です
          </div>
        ) : (
          <>
            {/* 統計サマリー */}
            <div className="grid grid-cols-3 gap-3 border-b border-gray-100 p-4">
              <StatCard
                label="最高値"
                value={`${maxVal.toLocaleString()}${meta.unit ? ` ${meta.unit}` : ""}`}
              />
              <StatCard
                label="最新値"
                value={`${latestVal.toLocaleString()}${meta.unit ? ` ${meta.unit}` : ""}`}
                sub={chartData[chartData.length - 1]?.dateLabel}
              />
              <StatCard
                label="記録件数"
                value={`${chartData.length}`}
                sub="セッション"
              />
            </div>

            {/* グラフ本体 */}
            <div className="px-4 pb-5 pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {meta.label} {meta.unit && `(${meta.unit})`} の推移
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={`grad-admin-${meta.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#F3F4F6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v: number) => v.toLocaleString()}
                  />
                  <Tooltip
                    content={<CustomTooltip meta={meta} color={color} />}
                    cursor={{ stroke: color, strokeWidth: 1.5, strokeDasharray: "4 4", opacity: 0.4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2.5}
                    fill={`url(#grad-admin-${meta.id})`}
                    dot={{ r: 4, fill: "#fff", stroke: color, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      <p className="text-right text-xs text-gray-300">
        {bodyCompData.length} セッション分のデータ（うち{meta.label}: {chartData.length}件）
      </p>
    </div>
  );
}
