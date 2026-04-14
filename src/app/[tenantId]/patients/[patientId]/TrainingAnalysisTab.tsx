"use client";

/**
 * TrainingAnalysisTab — トレーニング進捗分析グラフ
 *
 * - 種目・指標（ボリューム / 1RM）をセレクトボックスで選択
 * - recharts LineChart で折れ線グラフを描画
 * - CLAUDE.md 規約: ブランドカラー (#5BBAC4 / #E8F7F8) を使用
 * - training_record トグルが有効なテナントのみ page.tsx 経由で表示される
 */

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import { Dumbbell, BarChart2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// 型定義（page.tsx でも import して使う）
// ─────────────────────────────────────────────────────────────────────────────

export type RecordPoint = {
  date: string;      // "2026-01-15"
  dateLabel: string; // "01/15"
  volume: number;    // weightKg × reps × sets
  orm: number;       // Epley 1RM 推定
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
};

export type ExerciseChartData = {
  exerciseId: string;
  exerciseName: string;
  category: string | null;
  records: RecordPoint[];
};

type Metric = "volume" | "orm";

type Props = {
  exerciseChartData: ExerciseChartData[];
};

// ─────────────────────────────────────────────────────────────────────────────
// カスタム Tooltip
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: { value: number; payload: RecordPoint }[];
  label?: string;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const rec = payload[0].payload;
  const value = payload[0].value;

  return (
    <div className="min-w-[160px] rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      {/* メイン指標 */}
      <p className="text-base font-bold text-[var(--brand-dark)]">
        {metric === "volume"
          ? `${value.toLocaleString()} kg`
          : `${value} kg`}
      </p>
      <p className="text-[11px] text-gray-400">
        {metric === "volume" ? "総ボリューム" : "1RM 推定"}
      </p>
      {/* 詳細 */}
      <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs text-gray-500">
        {rec.weightKg != null && (
          <p>重量: <span className="font-mono font-semibold text-gray-700">{rec.weightKg} kg</span></p>
        )}
        {rec.reps != null && (
          <p>回数: <span className="font-mono font-semibold text-gray-700">{rec.reps} rep</span></p>
        )}
        {rec.sets != null && (
          <p>セット: <span className="font-mono font-semibold text-gray-700">{rec.sets} set</span></p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ hasExercises }: { hasExercises: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-bg)]">
        {hasExercises ? (
          <BarChart2 size={28} className="text-[var(--brand-medium)]" />
        ) : (
          <Dumbbell size={28} className="text-gray-300" />
        )}
      </div>
      <p className="mt-4 text-sm font-medium text-gray-400">
        {hasExercises
          ? "グラフを表示するには種目を選択してください"
          : "トレーニング記録がありません"}
      </p>
      <p className="mt-1 text-xs text-gray-300">
        {hasExercises
          ? "上のセレクトボックスから種目を選んでください"
          : "トレーニングカルテを記録すると進捗がここに表示されます"}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 統計サマリーカード
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

export function TrainingAnalysisTab({ exerciseChartData }: Props) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    exerciseChartData[0]?.exerciseId ?? ""
  );
  const [metric, setMetric] = useState<Metric>("volume");

  const selected = exerciseChartData.find((e) => e.exerciseId === selectedExerciseId);
  const records  = selected?.records ?? [];

  // Y軸ラベル
  const yAxisLabel = metric === "volume" ? "ボリューム (kg)" : "1RM推定 (kg)";
  const yKey       = metric === "volume" ? "volume" : "orm";

  // 統計計算
  const values     = records.map((r) => r[yKey] as number).filter((v) => v > 0);
  const maxVal     = values.length ? Math.max(...values) : 0;
  const lastVal    = values.length ? values[values.length - 1] : 0;
  const firstVal   = values.length ? values[0] : 0;
  const improvement = firstVal > 0 ? ((lastVal - firstVal) / firstVal * 100) : 0;

  return (
    <div className="space-y-5">
      {/* ── コントロールバー ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 種目セレクト */}
        <div className="flex-1">
          <label
            htmlFor="exercise-select"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400"
          >
            種目
          </label>
          <select
            id="exercise-select"
            value={selectedExerciseId}
            onChange={(e) => setSelectedExerciseId(e.target.value)}
            className={cn(
              "h-9 w-full min-w-[160px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700",
              "appearance-none focus:border-[var(--brand-medium)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-border)]",
              "transition-colors"
            )}
            disabled={exerciseChartData.length === 0}
          >
            {exerciseChartData.length === 0 ? (
              <option value="">記録なし</option>
            ) : (
              exerciseChartData.map((ex) => (
                <option key={ex.exerciseId} value={ex.exerciseId}>
                  {ex.exerciseName}
                  {ex.category ? ` (${ex.category})` : ""}
                </option>
              ))
            )}
          </select>
        </div>

        {/* 指標トグル */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            指標
          </p>
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(["volume", "orm"] as Metric[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  metric === m
                    ? "bg-white text-[var(--brand-dark)] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {m === "volume" ? (
                  <><Dumbbell size={12} />総ボリューム</>
                ) : (
                  <><TrendingUp size={12} />1RM推定</>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── グラフエリア ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {records.length < 2 ? (
          <EmptyState hasExercises={exerciseChartData.length > 0} />
        ) : (
          <>
            {/* 統計サマリー */}
            <div className="grid grid-cols-3 gap-3 border-b border-gray-100 p-4">
              <StatCard
                label="最高記録"
                value={`${maxVal.toLocaleString()} kg`}
                sub="Max"
              />
              <StatCard
                label="最新記録"
                value={`${lastVal.toLocaleString()} kg`}
                sub={records[records.length - 1]?.dateLabel}
              />
              <StatCard
                label="伸び率"
                value={`${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)}%`}
                sub="初回比"
              />
            </div>

            {/* グラフ本体 */}
            <div className="px-4 pb-5 pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {yAxisLabel} — {selected?.exerciseName}
                {selected?.category && (
                  <span className="ml-1 normal-case text-gray-300">
                    ({selected.category})
                  </span>
                )}
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={records}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="brandGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#5BBAC4" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#5BBAC4" stopOpacity={0.01} />
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
                    content={
                      <CustomTooltip metric={metric} />
                    }
                    cursor={{ stroke: "#A8DCE2", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey={yKey}
                    stroke="#5BBAC4"
                    strokeWidth={2.5}
                    fill="url(#brandGradient)"
                    dot={{
                      r: 4,
                      fill: "#fff",
                      stroke: "#5BBAC4",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6,
                      fill: "#5BBAC4",
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* 記録件数 */}
      {records.length > 0 && (
        <p className="text-right text-xs text-gray-300">
          {records.length} セッション分のデータ
        </p>
      )}
    </div>
  );
}
