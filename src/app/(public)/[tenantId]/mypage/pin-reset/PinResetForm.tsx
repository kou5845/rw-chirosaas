"use client";

/**
 * 暗証番号再発行フォーム（Client Component）
 */

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, CheckCircle2, KeyRound, ArrowLeft } from "lucide-react";
import { resetPin, type PinResetState } from "./action";

const inputBase =
  "block w-full rounded-2xl border px-4 py-3.5 text-sm text-gray-800 font-mono " +
  "placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] " +
  "focus:border-transparent transition-colors";
const inputNormal = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputError  = "border-red-300 bg-red-50/50";

export function PinResetForm({
  tenantSlug,
  clinicName,
}: {
  tenantSlug: string;
  clinicName: string;
}) {
  const [state, action, isPending] = useActionState<PinResetState, FormData>(
    resetPin,
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
          <KeyRound size={22} className="text-white" />
        </div>
        <h1 className="relative mt-4 text-2xl font-bold tracking-tight text-white">
          暗証番号の再発行
        </h1>
        <p className="relative mt-1 text-sm text-white/60">{clinicName}</p>
      </header>

      {/* ━━ カード ━━ */}
      <div className="px-4 -mt-2 pb-20">
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-md">

          <div className="border-b border-gray-50 px-6 py-5">
            <p className="text-sm font-semibold text-gray-700">本人確認</p>
            <p className="mt-0.5 text-xs text-gray-400">
              登録時の生年月日とメールアドレスを入力してください
            </p>
          </div>

          {state?.success ? (
            /* ── 送信完了 ── */
            <div className="px-6 py-8 space-y-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <p className="text-base font-semibold text-gray-800">
                  新しい暗証番号を送信しました
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  ご登録のメールアドレスに新しい暗証番号をお送りしました。<br />
                  メールが届かない場合はスタッフにお問い合わせください。
                </p>
              </div>
              <Link
                href={`/${tenantSlug}/mypage/login`}
                className="mt-2 flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--brand-medium)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)]"
              >
                ログインページへ戻る
              </Link>
            </div>
          ) : (
            /* ── 入力フォーム ── */
            <form action={action} className="px-6 py-5 space-y-4">
              <input type="hidden" name="tenantSlug" value={tenantSlug} />

              {state?.error && (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{state.error}</span>
                </div>
              )}

              {/* 生年月日 */}
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

              {/* メールアドレス */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2"
                >
                  登録メールアドレス
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  placeholder="example@email.com"
                  autoComplete="email"
                  className={`${inputBase} ${state?.error ? inputError : inputNormal}`}
                />
                <p className="mt-1.5 text-[11px] text-gray-400 px-1">
                  予約時に登録したメールアドレス
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
                    送信中…
                  </>
                ) : (
                  <>
                    <KeyRound size={14} />
                    新しい暗証番号を受け取る
                  </>
                )}
              </button>
            </form>
          )}

          <div className="border-t border-gray-50 px-6 py-4">
            <Link
              href={`/${tenantSlug}/mypage/login`}
              className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft size={12} />
              ログインページへ戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
