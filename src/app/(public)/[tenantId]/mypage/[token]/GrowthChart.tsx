"use client";

/**
 * 患者マイページ — 体組成の記録グラフ（ライトテーマ）
 *
 * 設定でONになっている体組成指標をプルダウンで選択して AreaChart 描画。
 * Y軸の単位（kg, %, kcal, Lv）は選択指標に合わせて自動切替。
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
import { TrendingUp, TrendingDown, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getEnabledMetrics,
  getMetricColor,
  type BodyCompDataPoint,
  type MetricConfigItem,
} from "@/lib/training-metrics";

type Props = {
  bodyCompData:  BodyCompDataPoint[];
  metricsConfig: MetricConfigItem[];
};

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
  meta:      MetricConfigItem;
  color:     string;
}) {
  if (!active || !payload?.length || !meta) return null;
  const value = payload[0].value;

  return (
    <div className="min-w-[140px] rounded-2xl border border-gray-100 bg-white p-3 shadow-lg">
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

export function GrowthChart({ bodyCompData, metricsConfig }: Props) {
  const enabledMetrics = getEnabledMetrics(metricsConfig);
  const [selectedId, setSelectedId] = useState<string>(
    enabledMetrics[0]?.id ?? "weight"
  );

  if (bodyCompData.length === 0 || enabledMetrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
          <Scale size={20} className="text-gray-300" />
        </div>
        <p className="mt-3 text-sm font-medium text-gray-400">
          {enabledMetrics.length === 0
            ? "表示する指標が設定されていません"
            : "体組成データがありません"}
        </p>
        <p className="mt-0.5 text-xs text-gray-300">
          {enabledMetrics.length === 0
            ? "院にお問い合わせください"
            : "カルテに体組成データが記録されるとここに表示されます"}
        </p>
      </div>
    );
  }

  const metaListIdx = enabledMetrics.findIndex((m) => m.id === selectedId);
  const metaIndex = metaListIdx >= 0 ? metaListIdx : 0;
  const meta = enabledMetrics[metaIndex];
  // selectedIdが変わってもmetaが決まらなければフォールバック
  if (!meta) return null;

  const color = getMetricColor(meta.id, metaIndex);

  const chartData = bodyCompData
    .filter((d) => d[meta.id] != null)
    .map((d) => ({ ...d, value: typeof d[meta.id] === 'number' ? d[meta.id] as number : parseFloat(String(d[meta.id])) }));

  const values      = chartData.map((d) => d.value);
  const latestVal   = values.length ? values[values.length - 1] : 0;
  const firstVal    = values.length ? values[0] : 0;
  const improvement =
    firstVal > 0 && chartData.length >= 2
      ? ((latestVal - firstVal) / firstVal) * 100
      : null;
  const isPositive  = (improvement ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* 指標セレクト */}
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent appearance-none"
      >
        {enabledMetrics.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.unit ? ` (${m.unit})` : ""}
          </option>
        ))}
      </select>

      {/* 改善率バッジ */}
      {improvement !== null && isFinite(improvement) && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
          {isPositive ? (
            <TrendingUp size={14} className="shrink-0 text-emerald-500" />
          ) : (
            <TrendingDown size={14} className="shrink-0 text-red-400" />
          )}
          <p className="text-sm text-gray-500">
            初回比
            <span
              className={cn(
                "ml-1.5 text-base font-bold",
                isPositive ? "text-emerald-600" : "text-red-500"
              )}
            >
              {isPositive ? "+" : ""}
              {improvement.toFixed(1)}%
            </span>
          </p>
          <p className="ml-auto text-xs text-gray-400">{chartData.length} 件記録</p>
        </div>
      )}

      {/* グラフ */}
      {chartData.length >= 2 ? (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
            >
              <defs>
                <linearGradient id={`grad-mypage-${meta.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toLocaleString()}
              />
              <Tooltip content={<CustomTooltip meta={meta} color={color} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2.5}
                fill={`url(#grad-mypage-${meta.id})`}
                dot={{ fill: color, r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#fff", stroke: color, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center py-10 text-sm text-gray-300">
          この指標のデータが2件未満です
        </div>
      )}
    </div>
  );
}
