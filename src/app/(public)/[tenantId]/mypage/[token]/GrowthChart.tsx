"use client";

/**
 * 患者マイページ — 体組成の記録グラフ（ライトテーマ）
 *
 * 設定でONになっている体組成指標をプルダウンで選択して AreaChart 描画。
 * Y軸の単位（kg, %, kcal, Lv）は選択指標に合わせて自動切替。
 * グラフ / 数値 タブで表示モードを切替可能。
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
  ReferenceDot,
} from "recharts";
import { TrendingUp, TrendingDown, Scale, BarChart2, List } from "lucide-react";
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

// ── ツールチップ ──────────────────────────────────────────────────────

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

// ── タブピル（AppointmentHistory と統一デザイン）───────────────────────

function TabPill({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active:  boolean;
  label:   string;
  icon:    React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors",
        active
          ? "bg-[var(--brand)] text-white shadow-sm"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

// ── 数値リスト ────────────────────────────────────────────────────────

function ValueList({
  chartData,
  meta,
  color,
}: {
  chartData: (BodyCompDataPoint & { value: number })[];
  meta:      MetricConfigItem;
  color:     string;
}) {
  const reversed = [...chartData].reverse();

  return (
    <div className="space-y-1.5">
      {reversed.map((d, i) => (
        <div
          key={d.date as string}
          className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"
        >
          <div>
            <p className="text-[11px] font-semibold text-gray-400">
              {d.dateLabel as string}
            </p>
            {i === 0 && (
              <p className="text-[10px] text-gray-300">最新</p>
            )}
          </div>
          <p className="text-base font-bold tabular-nums" style={{ color }}>
            {d.value.toLocaleString()}
            {meta.unit && (
              <span className="ml-0.5 text-xs font-normal text-gray-400">
                {meta.unit}
              </span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────────────────────

export function GrowthChart({ bodyCompData, metricsConfig }: Props) {
  const enabledMetrics = getEnabledMetrics(metricsConfig);
  const [selectedId, setSelectedId] = useState<string>(
    enabledMetrics[0]?.id ?? "weight"
  );
  const [activeTab, setActiveTab] = useState<"chart" | "list">("chart");

  // データなし / 指標なし
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
  const metaIndex   = metaListIdx >= 0 ? metaListIdx : 0;
  const meta        = enabledMetrics[metaIndex];
  if (!meta) return null;

  const color = getMetricColor(meta.id, metaIndex);

  const chartData = bodyCompData
    .filter((d) => d[meta.id] != null)
    .map((d) => ({
      ...d,
      value:
        typeof d[meta.id] === "number"
          ? (d[meta.id] as number)
          : parseFloat(String(d[meta.id])),
    }));

  const isSinglePoint = chartData.length === 1;

  const values      = chartData.map((d) => d.value);
  const latestVal   = values.length ? values[values.length - 1] : 0;
  const firstVal    = values.length ? values[0] : 0;
  const improvement =
    firstVal > 0 && chartData.length >= 2
      ? ((latestVal - firstVal) / firstVal) * 100
      : null;
  const isPositive  = (improvement ?? 0) >= 0;

  // 1件時のY軸ドメイン（上下に余白を入れて点を中央付近に）
  const singleDomain: [number, number] | undefined = isSinglePoint
    ? [
        Math.max(0, latestVal * 0.9),
        latestVal * 1.1,
      ]
    : undefined;

  return (
    <div className="space-y-4">
      {/* 指標セレクト */}
      <select
        value={selectedId}
        onChange={(e) => {
          setSelectedId(e.target.value);
          setActiveTab("chart");
        }}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent appearance-none"
      >
        {enabledMetrics.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.unit ? ` (${m.unit})` : ""}
          </option>
        ))}
      </select>

      {/* グラフ / 数値 タブ */}
      <div className="flex gap-2">
        <TabPill
          active={activeTab === "chart"}
          label="グラフ"
          icon={BarChart2}
          onClick={() => setActiveTab("chart")}
        />
        <TabPill
          active={activeTab === "list"}
          label="数値"
          icon={List}
          onClick={() => setActiveTab("list")}
        />
      </div>

      {activeTab === "chart" ? (
        <>
          {/* 改善率バッジ（2件以上のみ） */}
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
              <p className="ml-auto text-xs text-gray-400">
                {chartData.length} 件記録
              </p>
            </div>
          )}

          {/* グラフ（1件以上で表示） */}
          {chartData.length >= 1 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 16, right: 16, bottom: 0, left: -16 }}
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
                    padding={isSinglePoint ? { left: 60, right: 60 } : { left: 0, right: 0 }}
                  />
                  <YAxis
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => v.toLocaleString()}
                    domain={singleDomain ?? ["auto", "auto"]}
                  />
                  <Tooltip
                    content={<CustomTooltip meta={meta} color={color} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={color}
                    strokeWidth={isSinglePoint ? 0 : 2.5}
                    fill={isSinglePoint ? "none" : `url(#grad-mypage-${meta.id})`}
                    dot={{
                      fill: color,
                      r: isSinglePoint ? 10 : 4,
                      strokeWidth: isSinglePoint ? 3 : 0,
                      stroke: "#fff",
                    }}
                    activeDot={{ r: 8, fill: "#fff", stroke: color, strokeWidth: 2.5 }}
                  />
                  {/* 1件時：ラベルを点の上に表示 */}
                  {isSinglePoint && (
                    <ReferenceDot
                      x={chartData[0].dateLabel as string}
                      y={chartData[0].value}
                      r={0}
                      label={{
                        value: `${chartData[0].value.toLocaleString()}${meta.unit}`,
                        position: "top",
                        fill: color,
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center py-10 text-sm text-gray-300">
              この指標のデータがありません
            </div>
          )}

          {/* 1件時のヒント */}
          {isSinglePoint && (
            <p className="text-center text-[11px] text-gray-300">
              データが2件以上になるとグラフが表示されます
            </p>
          )}
        </>
      ) : (
        /* 数値タブ */
        chartData.length > 0 ? (
          <ValueList chartData={chartData} meta={meta} color={color} />
        ) : (
          <div className="flex items-center justify-center py-10 text-sm text-gray-300">
            この指標のデータがありません
          </div>
        )
      )}
    </div>
  );
}
