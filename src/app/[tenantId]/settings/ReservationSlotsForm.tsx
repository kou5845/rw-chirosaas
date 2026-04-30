"use client";

/**
 * 予約スロット設定フォーム — スロット間隔・同時予約上限
 *
 * updateTenantSettings を再利用する。
 * 営業時間フィールドは hidden で DB 現在値を送信してアクション整合性を保つ。
 */

import React from "react";
import { useActionState } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateTenantSettings, type SettingsState } from "./actions";
import type { BusinessHourData } from "./BusinessHoursForm";

type Props = {
  tenantSlug:    string;
  slotInterval:  number;
  maxCapacity:   number;
  /** 営業時間の現在値（hidden送信用） */
  businessHours: BusinessHourData[];
};

const selectCls =
  "block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800 " +
  "hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] " +
  "focus:border-transparent transition-colors appearance-none cursor-pointer";

const inputCls =
  "block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800 " +
  "hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] " +
  "focus:border-transparent transition-colors";

export function ReservationSlotsForm({
  tenantSlug,
  slotInterval,
  maxCapacity,
  businessHours,
}: Props) {
  const [state, action, isPending] = useActionState<SettingsState, FormData>(
    updateTenantSettings,
    null
  );

  return (
    <form action={action} className="space-y-6">
      {/* ── hidden: 営業時間の現在値を引き継ぎ送信 ── */}
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      {/* 曜日別昼休み */}
      {businessHours.map((bh) => (
        <React.Fragment key={bh.dayOfWeek}>
          {bh.hasLunchBreak && <input type="hidden" name={`hasLunchBreak-${bh.dayOfWeek}`} value="on" />}
          <input type="hidden" name={`lunchStart-${bh.dayOfWeek}`} value={bh.lunchStart ?? "12:00"} />
          <input type="hidden" name={`lunchEnd-${bh.dayOfWeek}`}   value={bh.lunchEnd   ?? "13:00"} />
        </React.Fragment>
      ))}
      {/* 曜日別営業時間 */}
      {businessHours.map((bh) => (
        <React.Fragment key={`oh-${bh.dayOfWeek}`}>
          {bh.isOpen && <input type="hidden" name={`isOpen-${bh.dayOfWeek}`} value="on" />}
          <input type="hidden" name={`openTime-${bh.dayOfWeek}`}  value={bh.openTime} />
          <input type="hidden" name={`closeTime-${bh.dayOfWeek}`} value={bh.closeTime} />
        </React.Fragment>
      ))}

      {/* 全体エラー */}
      {state?.errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{state.errors.general}</span>
        </div>
      )}

      {/* 保存成功 */}
      {state?.success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>予約設定を保存しました</span>
        </div>
      )}

      {/* ── 予約スロット設定 ── */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          予約スロット設定
        </p>
        <div className="overflow-hidden rounded-xl border border-gray-100">
          {/* slotInterval */}
          <div
            className="grid items-center gap-4 border-b border-gray-50 px-4 py-4"
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
            className="grid items-center gap-4 px-4 py-4"
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
                className={inputCls}
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
