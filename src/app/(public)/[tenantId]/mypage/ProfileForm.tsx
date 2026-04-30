"use client";

/**
 * 患者プロフィール編集フォーム
 *
 * - 氏名・ふりがなは ReadOnly 表示（変更不可）
 * - 電話番号・メールアドレスのみ編集可能
 * - 更新は updatePatientProfile Server Action に委譲
 */

import { useActionState } from "react";
import { User, Phone, Mail, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { updatePatientProfile, type UpdateProfileState } from "./update-profile-action";
import { PrivacyPolicyLink } from "@/components/PrivacyPolicyLink";

type Props = {
  tenantSlug:  string;
  displayName: string;
  nameKana:    string | null;
  phone:       string | null;
  email:       string | null;
};

const labelCls =
  "mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400";

const readonlyCls =
  "block w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-[15px] font-medium text-gray-600 select-none";

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[16px] leading-snug text-gray-800 " +
  "placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-medium)] " +
  "focus:border-transparent transition-colors";

export function ProfileForm({ tenantSlug, displayName, nameKana, phone, email }: Props) {
  const [state, action, isPending] = useActionState<UpdateProfileState, FormData>(
    updatePatientProfile,
    null,
  );

  const errors = state?.success ? undefined : state?.errors;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      {/* ── 成功トースト ── */}
      {state?.success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
          登録情報を更新しました
        </div>
      )}

      {/* ── 全体エラー ── */}
      {errors?.general && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {errors.general}
        </div>
      )}

      {/* ── お名前（漢字）— 編集不可 ── */}
      <div>
        <p className={labelCls}>
          <User size={11} />
          お名前（漢字）
        </p>
        <div className={readonlyCls}>{displayName}</div>
      </div>

      {/* ── ふりがな — 編集不可 ── */}
      {nameKana && (
        <div>
          <p className={labelCls}>
            <User size={11} />
            ふりがな
          </p>
          <div className={readonlyCls}>{nameKana}</div>
        </div>
      )}

      {/* ── 名前変更の案内注釈 ── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/70 px-3.5 py-3">
        <Info size={13} className="mt-0.5 shrink-0 text-amber-500" />
        <p className="text-[11px] leading-relaxed text-amber-700">
          ※お名前の変更は、診察券との整合性を保つため、次回来院時にスタッフへお申し付けください
        </p>
      </div>

      {/* ── 電話番号 — 編集可 ── */}
      <div>
        <label htmlFor="profile-phone" className={labelCls}>
          <Phone size={11} />
          電話番号
          <span className="ml-0.5 font-normal normal-case tracking-normal text-red-400">必須</span>
        </label>
        <input
          id="profile-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="090-1234-5678"
          defaultValue={phone ?? ""}
          className={inputCls + (errors?.phone ? " !border-red-300 bg-red-50/50" : "")}
        />
        {errors?.phone && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={11} />
            {errors.phone}
          </p>
        )}
      </div>

      {/* ── メールアドレス — 編集可（任意）── */}
      <div>
        <label htmlFor="profile-email" className={labelCls}>
          <Mail size={11} />
          メールアドレス
          <span className="ml-0.5 font-normal normal-case tracking-normal text-gray-300">任意</span>
        </label>
        <input
          id="profile-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="example@mail.com"
          defaultValue={email ?? ""}
          className={inputCls + (errors?.email ? " !border-red-300 bg-red-50/50" : "")}
        />
        {errors?.email && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={11} />
            {errors.email}
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-gray-400">
          入力するとメールでも予約通知を受け取れます
        </p>
      </div>

      {/* ── 保存ボタン ── */}
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 h-12 rounded-2xl bg-[var(--brand-medium)] text-white font-semibold text-sm hover:bg-[var(--brand-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <><Loader2 size={15} className="animate-spin" />保存中…</>
        ) : (
          "変更を保存する"
        )}
      </button>

      {/* ── 個人情報保護方針リンク ── */}
      <PrivacyPolicyLink />
    </form>
  );
}
