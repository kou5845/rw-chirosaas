"use client";

/**
 * 院の営業時間フォーム — 曜日別営業時間 + 曜日別昼休み
 *
 * CLAUDE.md 規約:
 *   - モバイルファースト・44px タップターゲット保証
 *   - エラーはフィールド直下にインライン表示
 */

import { useActionState, useState } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { updateTenantSettings, type SettingsState } from "./actions";
import { cn } from "@/lib/utils";

export type BusinessHourData = {
  dayOfWeek:    number;
  isOpen:       boolean;
  openTime:     string;
  closeTime:    string;
  hasLunchBreak: boolean;
  lunchStart:   string | null;
  lunchEnd:     string | null;
};

type Props = {
  tenantSlug:    string;
  businessHours: BusinessHourData[];
  slotInterval:  number;
  maxCapacity:   number;
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS: Record<number, string> = {
  0: "日曜日", 1: "月曜日", 2: "火曜日", 3: "水曜日",
  4: "木曜日", 5: "金曜日", 6: "土曜日",
};

const TIME_OPTS: string[] = [];
for (let h = 6; h <= 23; h++) {
  TIME_OPTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 23) TIME_OPTS.push(`${String(h).padStart(2, "0")}:30`);
}

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

type DayTime = { openTime: string; closeTime: string; lunchStart: string; lunchEnd: string };

function buildBhMap(businessHours: BusinessHourData[]): Map<number, BusinessHourData> {
  const map = new Map<number, BusinessHourData>();
  for (const bh of businessHours) map.set(bh.dayOfWeek, bh);
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    if (!map.has(d)) {
      map.set(d, {
        dayOfWeek: d,
        isOpen: d !== 0,
        openTime: "09:00",
        closeTime: "20:00",
        hasLunchBreak: true,
        lunchStart: "12:00",
        lunchEnd: "13:00",
      });
    }
  }
  return map;
}

export function BusinessHoursForm({
  tenantSlug,
  businessHours,
  slotInterval,
  maxCapacity,
}: Props) {
  const [state, action, isPending] = useActionState<SettingsState, FormData>(
    updateTenantSettings,
    null
  );

  const bhMap = buildBhMap(businessHours);

  const [openMap, setOpenMap] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(DAY_ORDER.map((d) => [d, bhMap.get(d)!.isOpen]))
  );

  const [lunchMap, setLunchMap] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(DAY_ORDER.map((d) => [d, bhMap.get(d)!.hasLunchBreak]))
  );

  const [timeMap, setTimeMap] = useState<Record<number, DayTime>>(() =>
    Object.fromEntries(DAY_ORDER.map((d) => {
      const bh = bhMap.get(d)!;
      return [d, {
        openTime:   bh.openTime,
        closeTime:  bh.closeTime,
        lunchStart: bh.lunchStart ?? "12:00",
        lunchEnd:   bh.lunchEnd   ?? "13:00",
      }];
    }))
  );

  const errors = state?.errors;

  function copyMonToWeekdays() {
    const mon = timeMap[1];
    setTimeMap((prev) => {
      const next = { ...prev };
      for (const d of [2, 3, 4, 5]) {
        next[d] = { ...mon };
      }
      return next;
    });
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const d of [2, 3, 4, 5]) next[d] = prev[1];
      return next;
    });
    setLunchMap((prev) => {
      const next = { ...prev };
      for (const d of [2, 3, 4, 5]) next[d] = prev[1];
      return next;
    });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tenantSlug"   value={tenantSlug} />
      <input type="hidden" name="slotInterval" value={slotInterval} />
      <input type="hidden" name="maxCapacity"  value={maxCapacity} />

      {errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{errors.general}</span>
        </div>
      )}

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

        {/* コピーボタン */}
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={copyMonToWeekdays}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Copy size={12} />
            月曜日の設定を他の平日にコピー
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100">
          {/* ヘッダー */}
          <div
            className="grid items-center border-b border-gray-100 bg-gray-50/80 px-4 py-2"
            style={{ gridTemplateColumns: "6rem 3rem 1fr 1fr 3.5rem 1fr 1fr" }}
          >
            <p className="text-[11px] font-medium text-gray-400">曜日</p>
            <p className="text-[11px] font-medium text-gray-400">営業</p>
            <p className="text-[11px] font-medium text-gray-400">開始</p>
            <p className="text-[11px] font-medium text-gray-400">終了</p>
            <p className="text-[11px] font-medium text-gray-400">昼休み</p>
            <p className="text-[11px] font-medium text-gray-400">昼開始</p>
            <p className="text-[11px] font-medium text-gray-400">昼終了</p>
          </div>

          {DAY_ORDER.map((d) => {
            const isOpen      = openMap[d];
            const hasLunch    = lunchMap[d];
            const times       = timeMap[d];
            const isSun       = d === 0;
            const isSat       = d === 6;
            return (
              <div
                key={d}
                className={cn(
                  "grid items-center gap-2 px-4 py-3 border-b border-gray-50 last:border-b-0",
                  !isOpen && "bg-gray-50/60",
                )}
                style={{ gridTemplateColumns: "6rem 3rem 1fr 1fr 3.5rem 1fr 1fr" }}
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
                <label className="flex cursor-pointer items-center gap-1 select-none">
                  <input
                    type="checkbox"
                    name={`isOpen-${d}`}
                    checked={isOpen}
                    onChange={(e) =>
                      setOpenMap((prev) => ({ ...prev, [d]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand)] focus:ring-[var(--brand)]"
                  />
                </label>

                {/* 開始時間 */}
                <div>
                  <select
                    name={`openTime-${d}`}
                    value={times.openTime}
                    onChange={(e) => setTimeMap((prev) => ({ ...prev, [d]: { ...prev[d], openTime: e.target.value } }))}
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
                    value={times.closeTime}
                    onChange={(e) => setTimeMap((prev) => ({ ...prev, [d]: { ...prev[d], closeTime: e.target.value } }))}
                    disabled={!isOpen}
                    className={cn(selectCls, errors?.[`closeTime-${d}`] && "border-red-300")}
                  >
                    {TIME_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {errors?.[`closeTime-${d}`] && (
                    <p className="mt-0.5 text-[11px] text-red-500">{errors[`closeTime-${d}`]}</p>
                  )}
                </div>

                {/* 昼休みチェック */}
                <label className="flex cursor-pointer items-center justify-center select-none">
                  <input
                    type="checkbox"
                    name={`hasLunchBreak-${d}`}
                    checked={hasLunch}
                    onChange={(e) =>
                      setLunchMap((prev) => ({ ...prev, [d]: e.target.checked }))
                    }
                    disabled={!isOpen}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--brand)] focus:ring-[var(--brand)] disabled:opacity-40"
                  />
                </label>

                {/* 昼開始時間 */}
                <div>
                  <select
                    name={`lunchStart-${d}`}
                    value={times.lunchStart}
                    onChange={(e) => setTimeMap((prev) => ({ ...prev, [d]: { ...prev[d], lunchStart: e.target.value } }))}
                    disabled={!isOpen || !hasLunch}
                    className={cn(selectCls, errors?.[`lunchRange-${d}`] && "border-red-300", errors?.[`lunch-${d}`] && "border-red-300")}
                  >
                    {LUNCH_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {(errors?.[`lunchRange-${d}`] || errors?.[`lunch-${d}`]) && (
                    <p className="mt-0.5 text-[11px] text-red-500">
                      {errors[`lunchRange-${d}`] ?? errors[`lunch-${d}`]}
                    </p>
                  )}
                </div>

                {/* 昼終了時間 */}
                <div>
                  <select
                    name={`lunchEnd-${d}`}
                    value={times.lunchEnd}
                    onChange={(e) => setTimeMap((prev) => ({ ...prev, [d]: { ...prev[d], lunchEnd: e.target.value } }))}
                    disabled={!isOpen || !hasLunch}
                    className={cn(selectCls, errors?.[`lunchRange-${d}`] && "border-red-300", errors?.[`lunch-${d}`] && "border-red-300")}
                  >
                    {LUNCH_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
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
