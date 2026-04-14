"use client";

/**
 * 医院基本情報フォーム — 電話番号・住所
 */

import { useActionState } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateClinicInfo, type ClinicInfoState } from "./actions";

type Props = {
  tenantSlug: string;
  phone:      string | null;
  address:    string | null;
};

const inputCls =
  "mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";

export function ClinicInfoForm({ tenantSlug, phone, address }: Props) {
  const [state, action, isPending] = useActionState<ClinicInfoState, FormData>(
    updateClinicInfo,
    null
  );

  const errors = state?.errors;

  return (
    <form action={action} className="px-6 py-5 space-y-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      {errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{errors.general}</span>
        </div>
      )}
      {state?.success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>基本情報を保存しました</span>
        </div>
      )}

      {/* 電話番号 */}
      <div>
        <label htmlFor="clinic-phone" className="block text-sm font-medium text-gray-700">
          電話番号
          <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
        </label>
        <input
          id="clinic-phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder="例: 03-1234-5678"
          className={inputCls + (errors?.phone ? " border-red-300 bg-red-50/50" : "")}
        />
        {errors?.phone && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={11} />{errors.phone}
          </p>
        )}
        <p className="mt-1.5 text-xs text-gray-400">
          メール・LINE通知の本文と、公開予約フォームの完了画面に表示されます
        </p>
      </div>

      {/* 住所 */}
      <div>
        <label htmlFor="clinic-address" className="block text-sm font-medium text-gray-700">
          住所
          <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
        </label>
        <input
          id="clinic-address"
          name="address"
          type="text"
          defaultValue={address ?? ""}
          placeholder="例: 東京都渋谷区代々木1-2-3 渋谷ビル2F"
          className={inputCls}
        />
        <p className="mt-1.5 text-xs text-gray-400">
          メール・LINE通知の本文と、公開予約フォームの完了画面にGoogle マップリンクとともに表示されます
        </p>
      </div>

      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <><Loader2 size={15} className="animate-spin" />保存中…</>
          ) : (
            <><Save size={15} />保存する</>
          )}
        </button>
      </div>
    </form>
  );
}
