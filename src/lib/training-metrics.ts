/**
 * トレーニング体組成指標 — 型定義・定数・ユーティリティ（動的対応版）
 *
 * - Tenant.trainingMetricsConfig (JSON) の ON/OFF 状態、表示順、ラベルなどを管理
 */

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export type MetricConfigItem = {
  id:      string;  // "weight", "bodyFat", "custom-123" など
  label:   string;
  unit:    string;
  enabled: boolean;
};

// 互換性のための定義
export type MetricKey = string;

// 初期データとして設定される既存の指標
export const DEFAULT_DYNAMIC_METRICS: MetricConfigItem[] = [
  { id: "weight",      label: "体重",       unit: "kg",   enabled: true },
  { id: "bodyFat",     label: "体脂肪率",   unit: "%",    enabled: true },
  { id: "bmi",         label: "BMI",        unit: "",     enabled: true },
  { id: "muscleMass",  label: "筋肉量",     unit: "kg",   enabled: true },
  { id: "bmr",         label: "基礎代謝",   unit: "kcal", enabled: true },
  { id: "visceralFat", label: "内臓脂肪",   unit: "Lv",   enabled: true },
];

export const COLORS = [
  "#5BBAC4", "#F59E0B", "#8B5CF6", "#10B981", "#EF4444", "#F97316",
  "#EC4899", "#3B82F6", "#14B8A6", "#84CC16", "#6366F1", "#F43F5E"
];

/** グラフ等で使うカラーを取得 */
export function getMetricColor(id: string, index: number): string {
  const mapped: Record<string, string> = {
    weight:      "#5BBAC4",
    bodyFat:     "#F59E0B",
    bmi:         "#8B5CF6",
    muscleMass:  "#10B981",
    bmr:         "#EF4444",
    visceralFat: "#F97316",
  };
  return mapped[id] || COLORS[index % COLORS.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// グラフ用データ型
// ─────────────────────────────────────────────────────────────────────────────

/**
 * グラフ用のデータポイント。
 * 動的な指標をサポートするため、[key: string]: number | null になる。
 */
export type BodyCompDataPoint = {
  date:       string;       // "2026-01-15"
  dateLabel:  string;       // "01/15"
} & Record<string, number | null | string>;

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/** DB の JSON フィールドから MetricConfigItem[] を安全にパース */
export function parseMetricsConfig(raw: unknown): MetricConfigItem[] {
  // すでに配列形式の場合はそれを返す
  if (Array.isArray(raw)) {
    return raw.filter((item): item is MetricConfigItem =>
      typeof item === "object" && item !== null && "id" in item && "label" in item
    );
  }

  // 古い形式のマイグレーション { weight: true, ... }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return DEFAULT_DYNAMIC_METRICS.map((m) => {
      if (typeof obj[m.id] === "boolean") {
        return { ...m, enabled: obj[m.id] as boolean };
      }
      return m;
    });
  }

  // デフォルト
  return JSON.parse(JSON.stringify(DEFAULT_DYNAMIC_METRICS));
}

/** 常に ON になっている 指標の配列を返す */
export function getEnabledMetrics(cfg: MetricConfigItem[]): MetricConfigItem[] {
  return cfg.filter((m) => m.enabled);
}

/** BMI 自動計算（体重 kg, 身長 cm） */
export function calcBmi(weightKg: number, heightCm: number): number {
  if (!heightCm || heightCm <= 0) return 0;
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}
