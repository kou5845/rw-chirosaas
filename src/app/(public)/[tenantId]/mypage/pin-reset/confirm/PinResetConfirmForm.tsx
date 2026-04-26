"use client";

/**
 * 暗証番号再設定 確認フォーム（Client Component）
 *
 * URL: /{tenantSlug}/mypage/pin-reset/confirm?token=<token>
 * ユーザーが自分で新しい 4桁 PIN を入力して確定する。
 */

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { confirmPinReset, type PinConfirmState } from "./action";

const inputBase =
  "block w-full rounded-2xl border px-4 py-3.5 text-sm text-gray-800 font-mono tracking-[0.4em] " +
  "placeholder:text-gray-300 placeholder:tracking-normal focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors text-center";
const inputNormal = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputError  = "border-red-300 bg-red-50/50";

export function PinResetConfirmForm({
  tenantSlug,
  clinicName,
  token,
}: {
  tenantSlug: string;
  clinicName: string;
  token:      string;
}) {
  const [state, action, isPending] = useActionState<PinConfirmState, FormData>(
    confirmPinReset,
    null
  );

  const hasError = !!state?.error;

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
          <ShieldCheck size={22} className="text-white" />
        </div>
        <h1 className="relative mt-4 text-2xl font-bold tracking-tight text-white">
          新しい暗証番号を設定
        </h1>
        <p className="relative mt-1 text-sm text-white/60">{clinicName}</p>
      </header>

      {/* ━━ カード ━━ */}
      <div className="px-4 -mt-2 pb-20">
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-md">

          {state?.success ? (
            /* ── 設定完了 ── */
            <div className="px-6 py-8 space-y-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <p className="text-base font-semibold text-gray-800">
                  暗証番号を変更しました
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  新しい暗証番号でログインできます。<br />
                  暗証番号は大切に保管してください。
                </p>
              </div>
              <Link
                href={`/${tenantSlug}/mypage/login`}
                className="mt-2 flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--brand-medium)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)]"
              >
                ログインページへ進む →
              </Link>
            </div>
          ) : (
            <>
              <div className="border-b border-gray-50 px-6 py-5">
                <p className="text-sm font-semibold text-gray-700">新しい暗証番号を入力</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  4桁の数字を設定してください
                </p>
              </div>

              <form action={action} className="px-6 py-5 space-y-4">
                {/* hidden fields */}
                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                <input type="hidden" name="token"      value={token} />

                {state?.error && (
                  <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{state.error}</span>
                  </div>
                )}

                {/* 新しい暗証番号 */}
                <div>
                  <label
                    htmlFor="newPin"
                    className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2"
                  >
                    新しい暗証番号（4桁）
                  </label>
                  <input
                    id="newPin"
                    name="newPin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    autoComplete="new-password"
                    className={`${inputBase} ${hasError ? inputError : inputNormal}`}
                  />
                </div>

                {/* 確認用 */}
                <div>
                  <label
                    htmlFor="confirmPin"
                    className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2"
                  >
                    確認用（再入力）
                  </label>
                  <input
                    id="confirmPin"
                    name="confirmPin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    autoComplete="new-password"
                    className={`${inputBase} ${hasError ? inputError : inputNormal}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="mt-2 flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--brand-medium)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      更新中…
                    </>
                  ) : (
                    <>
                      <KeyRound size={14} />
                      暗証番号を更新する
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
