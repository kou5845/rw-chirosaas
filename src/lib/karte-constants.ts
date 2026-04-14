/** カルテ入力用マスタデータ定数 */

export const BODY_PARTS = [
  "頭部", "首・頸部",
  "肩（右）", "肩（左）",
  "上腕（右）", "上腕（左）",
  "肘（右）", "肘（左）",
  "前腕", "手首・手",
  "背中（上部）", "背中（中部）", "腰部",
  "骨盤", "股関節（右）", "股関節（左）",
  "大腿（右）", "大腿（左）",
  "膝（右）", "膝（左）",
  "下腿（右）", "下腿（左）",
  "足首・足（右）", "足首・足（左）",
] as const;

export const TREATMENTS = [
  "マッサージ（手技）",
  "電気療法",
  "超音波療法",
  "鍼",
  "灸",
  "アクチベーター",
  "テーピング",
  "ストレッチ指導",
  "トレーニング指導",
  "温熱療法",
  "冷却療法",
  "関節モビライゼーション",
] as const;

export const CONDITION_STATUS_OPTIONS = [
  { value: "good",   label: "良好",     emoji: "😊", active: "bg-emerald-500 text-white border-emerald-500", inactive: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
  { value: "fair",   label: "普通",     emoji: "😐", active: "bg-sky-500 text-white border-sky-500",         inactive: "border-sky-200 text-sky-700 hover:bg-sky-50" },
  { value: "pain",   label: "痛い",     emoji: "😣", active: "bg-orange-500 text-white border-orange-500",   inactive: "border-orange-200 text-orange-700 hover:bg-orange-50" },
  { value: "severe", label: "強い痛み", emoji: "😰", active: "bg-red-500 text-white border-red-500",         inactive: "border-red-200 text-red-700 hover:bg-red-50" },
] as const;
