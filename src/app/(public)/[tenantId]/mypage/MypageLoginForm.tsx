"use client";

/**
 * 患者マイページ ログインフォーム（Client Component）
 *
 * ID  : 生年月日（YYYYMMDD 形式）
 * PASS: 4桁の暗証番号（accessPin）
 */

import { useActionState } from "react";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import { loginMypage, type LoginState } from "./login-action";

const inputBase =
  "block w-full rounded-2xl border px-4 py-3.5 text-sm text-gray-800 font-mono " +
  "placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] " +
  "focus:border-transparent transition-colors";
const inputNormal = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputError  = "border-red-300 bg-red-50/50";

export function MypageLoginForm({
  tenantSlug,
  clinicName,
}: {
  tenantSlug: string;
  clinicName: string;
}) {
  const [state, action, isPending] = useActionState<LoginState, FormData>(
    loginMypage,
    null
  );

  return (
    <div className="mx-auto max-w-md min-h-dvh bg-[#F9FAFB]">

      {/* ━━ ヘッダー ━━ */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-6 pt-16 pb-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize:  "20px 20px",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#F9FAFB] to-transparent" />

        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 shadow-sm">
          <Lock size={22} className="text-white" />
        </div>
        <h1 className="relative mt-4 text-2xl font-bold tracking-tight text-white">
          患者マイページ
        </h1>
        <p className="relative mt-1 text-sm text-white/60">{clinicName}</p>
      </header>

      {/* ━━ カード ━━ */}
      <div className="px-4 -mt-2 pb-20">
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-md">

          <div className="border-b border-gray-50 px-6 py-5">
            <p className="text-sm font-semibold text-gray-700">ログイン</p>
            <p className="mt-0.5 text-xs text-gray-400">
              スタッフからお伝えした情報を入力してください
            </p>
          </div>

          <form action={action} className="px-6 py-5 space-y-4">
            <input type="hidden" name="tenantSlug" value={tenantSlug} />

            {/* エラー */}
            {state?.error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            {/* 生年月日（ID） */}
            <div>
              <label
                htmlFor="birthDate"
                className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2"
              >
                ID — 生年月日
              </label>
              <input
                id="birthDate"
                name="birthDate"
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="例: 19830405"
                autoComplete="off"
                className={`${inputBase} tracking-[0.2em] ${state?.error ? inputError : inputNormal}`}
              />
              <p className="mt-1.5 text-[11px] text-gray-400 px-1">
                西暦8桁（例: 1983年4月5日 → 19830405）
              </p>
            </div>

            {/* 暗証番号（PASS） */}
            <div>
              <label
                htmlFor="accessPin"
                className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2"
              >
                PASS — 暗証番号
              </label>
              <input
                id="accessPin"
                name="accessPin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                autoComplete="current-password"
                className={`${inputBase} tracking-[0.4em] text-center text-lg ${state?.error ? inputError : inputNormal}`}
              />
              <p className="mt-1.5 text-[11px] text-gray-400 px-1">
                受付でお伝えした4桁の数字
              </p>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--brand-medium)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  確認中…
                </>
              ) : (
                <>
                  <Lock size={14} />
                  ログイン
                </>
              )}
            </button>
          </form>

          <div className="border-t border-gray-50 px-6 py-4">
            <p className="text-center text-[11px] text-gray-300">
              ログイン情報はスタッフにお問い合わせください
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
