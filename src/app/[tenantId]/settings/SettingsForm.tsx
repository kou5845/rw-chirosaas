"use client";

/**
 * 院の基本設定フォーム — 曜日別営業時間 + 昼休み
 *
 * CLAUDE.md 規約:
 *   - モバイルファースト・44px タップターゲット保証
 *   - エラーはフィールド直下にインライン表示
 */

import { useActionState, useState } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2, Coffee } from "lucide-react";
import { updateTenantSettings, type SettingsState } from "./actions";
import { cn } from "@/lib/utils";

export type BusinessHourData = {
  dayOfWeek: number;  // 0=日, 1=月, ..., 6=土
  isOpen:    boolean;
  openTime:  string;  // "HH:mm"
  closeTime: string;  // "HH:mm"
};

type Props = {
  tenantSlug:     string;
  businessHours:  BusinessHourData[];
  lunchStartTime: string | null;
  lunchEndTime:   string | null;
  slotInterval:   number;
  maxCapacity:    number;
};

// 表示順: 月→日
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS: Record<number, string> = {
  0: "日曜日", 1: "月曜日", 2: "火曜日", 3: "水曜日",
  4: "木曜日", 5: "金曜日", 6: "土曜日",
};

// 30分刻み 06:00 〜 23:00
const TIME_OPTS: string[] = [];
for (let h = 6; h <= 23; h++) {
  TIME_OPTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 23) TIME_OPTS.push(`${String(h).padStart(2, "0")}:30`);
}

// 昼休み用 08:00 〜 18:30
const LUNCH_OPTS: string[] = [];
for (let h = 8; h <= 18; h++) {
  LUNCH_OPTS.push(`${String(h).padStart(2, "0")}:00`);
  LUNCH_OPTS.push(`${String(h).padStart(2, "0")}:30`);
}

const selectCls =
  "block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800 " +
  "hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] " +
  "focus:border-transparent transition-colors appearance-none cursor-pointer " +
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-50";

function buildBhMap(businessHours: BusinessHourData[]): Map<number, BusinessHourData> {
  const map = new Map<number, BusinessHourData>();
  for (const bh of businessHours) map.set(bh.dayOfWeek, bh);
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    if (!map.has(d)) {
      map.set(d, { dayOfWeek: d, isOpen: d !== 0, openTime: "09:00", closeTime: "20:00" });
    }
  }
  return map;
}

export function SettingsForm({ tenantSlug, businessHours, lunchStartTime, lunchEndTime, slotInterval, maxCapacity }: Props) {
  const [state, action, isPending] = useActionState<SettingsState, FormData>(
    updateTenantSettings,
    null
  );

  const bhMap = buildBhMap(businessHours);

  // 曜日ごとの営業フラグ（チェックボックス制御）
  const [openMap, setOpenMap] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(DAY_ORDER.map((d) => [d, bhMap.get(d)!.isOpen]))
  );

  const [noLunch, setNoLunch] = useState(!lunchStartTime && !lunchEndTime);

  const errors = state?.errors;

  return (
    <form action={action} className="px-6 py-5 space-y-6">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      {/* 全体エラー */}
      {errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{errors.general}</span>
        </div>
      )}

      {/* 保存成功 */}
      {state?.success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>設定を保存しました</span>
        </div>
      )}

      {/* ── 曜日別営業時間テーブル ── */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          曜日別営業時間
        </p>
        <div className="overflow-hidden rounded-xl border border-gray-100">
          {/* ヘッダー */}
          <div
            className="grid items-center border-b border-gray-100 bg-gray-50/80 px-4 py-2"
            style={{ gridTemplateColumns: "7rem 5rem 1fr 1fr" }}
          >
            <p className="text-[11px] font-medium text-gray-400">曜日</p>
            <p className="text-[11px] font-medium text-gray-400">営業</p>
            <p className="text-[11px] font-medium text-gray-400">開始時間</p>
            <p className="text-[11px] font-medium text-gray-400">終了時間</p>
          </div>

          {DAY_ORDER.map((d) => {
            const bh     = bhMap.get(d)!;
            const isOpen = openMap[d];
            const isSun  = d === 0;
            const isSat  = d === 6;
            return (
              <div
                key={d}
                className={cn(
                  "grid items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0",
                  !isOpen && "bg-gray-50/60",
                )}
                style={{ gridTemplateColumns: "7rem 5rem 1fr 1fr" }}
              >
                {/* 曜日ラベル */}
                <p className={cn(
                  "text-sm font-semibold",
                  isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-gray-700",
                  !isOpen && "opacity-50",
                )}>
                  {DAY_LABELS[d]}
                </p>

                {/* 営業チェック */}
                <label className="flex cursor-pointer items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    name={`isOpen-${d}`}
                    checked={isOpen}
                    onChange={(e) =>
                      setOpenMap((prev) => ({ ...prev, [d]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand)] focus:ring-[var(--brand)]"
                  />
                  <span className={cn("text-xs", isOpen ? "text-gray-700" : "text-gray-400")}>
                    {isOpen ? "営業" : "休診"}
                  </span>
                </label>

                {/* 開始時間 */}
                <div>
                  <select
                    name={`openTime-${d}`}
                    defaultValue={bh.openTime}
                    disabled={!isOpen}
                    className={cn(selectCls, errors?.[`openTime-${d}`] && "border-red-300")}
                  >
                    {TIME_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {(errors?.[`openTime-${d}`] || errors?.[`range-${d}`]) && (
                    <p className="mt-0.5 text-[11px] text-red-500">
                      {errors[`openTime-${d}`] ?? errors[`range-${d}`]}
                    </p>
                  )}
                </div>

                {/* 終了時間 */}
                <div>
                  <select
                    name={`closeTime-${d}`}
                    defaultValue={bh.closeTime}
                    disabled={!isOpen}
                    className={cn(selectCls, errors?.[`closeTime-${d}`] && "border-red-300")}
                  >
                    {TIME_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {errors?.[`closeTime-${d}`] && (
                    <p className="mt-0.5 text-[11px] text-red-500">{errors[`closeTime-${d}`]}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 昼休み設定 ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Coffee size={13} />
            昼休み
          </p>
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              name="noLunch"
              checked={noLunch}
              onChange={(e) => setNoLunch(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[var(--brand)] focus:ring-[var(--brand)]"
            />
            <span className="text-xs text-gray-600">昼休みなし</span>
          </label>
        </div>

        {!noLunch && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">開始時間</label>
              <select
                name="lunchStartTime"
                defaultValue={lunchStartTime ?? "12:00"}
                className={cn(selectCls, errors?.lunch && "border-red-300")}
              >
                {LUNCH_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">終了時間</label>
              <select
                name="lunchEndTime"
                defaultValue={lunchEndTime ?? "13:00"}
                className={cn(selectCls, errors?.lunch && "border-red-300")}
              >
                {LUNCH_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        {errors?.lunch && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={11} />
            {errors.lunch}
          </p>
        )}
      </div>

      {/* ── 予約スロット設定 ── */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          予約スロット設定
        </p>
        <div className="overflow-hidden rounded-xl border border-gray-100">
          {/* slotInterval */}
          <div
            className="grid items-center gap-4 border-b border-gray-50 px-4 py-3"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            <div>
              <p className="text-sm font-medium text-gray-700">スロット間隔</p>
              <p className="mt-0.5 text-xs text-gray-400">カレンダーの時間刻み幅</p>
            </div>
            <select
              name="slotInterval"
              defaultValue={slotInterval}
              className={selectCls}
            >
              <option value={15}>15分</option>
              <option value={20}>20分</option>
              <option value={30}>30分</option>
              <option value={60}>60分</option>
            </select>
          </div>

          {/* maxCapacity */}
          <div
            className="grid items-center gap-4 px-4 py-3"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            <div>
              <p className="text-sm font-medium text-gray-700">同時予約上限</p>
              <p className="mt-0.5 text-xs text-gray-400">同一時間帯の受入最大数</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                name="maxCapacity"
                type="number"
                min={1}
                max={10}
                defaultValue={maxCapacity}
                className={
                  "block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800 " +
                  "hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] " +
                  "focus:border-transparent transition-colors"
                }
              />
              <span className="shrink-0 text-sm text-gray-400">名</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 保存ボタン ── */}
      <div className="flex justify-end border-t border-gray-100 pt-5">
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              保存中…
            </>
          ) : (
            <>
              <Save size={15} />
              設定を保存する
            </>
          )}
        </button>
      </div>
    </form>
  );
}
