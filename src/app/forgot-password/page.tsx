"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  Activity, Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";

export default function ForgotPasswordPage() {
  const [state, action, isPending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    null
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">

        {/* ヘッダー */}
        <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-8 py-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Activity size={28} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-white">パスワード再設定</p>
        </div>

        <div className="px-8 py-8">
          {state?.success ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <div>
                <p className="font-semibold text-gray-800">メールを確認してください</p>
                <p className="mt-1 text-sm text-gray-500">
                  登録済みのメールアドレスにパスワード再設定用のリンクを送信しました。
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  ※開発環境ではサーバーログにURLが出力されます。
                </p>
              </div>
              <Link
                href="/login"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                <ArrowLeft size={14} />
                ログインへ戻る
              </Link>
            </div>
          ) : (
            <>
              <h1 className="mb-2 text-xl font-semibold text-gray-800">
                パスワードを忘れた場合
              </h1>
              <p className="mb-6 text-sm text-gray-500">
                登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
              </p>

              {state?.error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{state.error}</span>
                </div>
              )}

              <form action={action} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    メールアドレス
                  </label>
                  <div className="relative mt-1.5">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      placeholder="例: admin@example.com"
                      className={`${inputCls} pl-10`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-medium)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:opacity-60"
                >
                  {isPending
                    ? <><Loader2 size={16} className="animate-spin" />送信中…</>
                    : <><Mail size={16} />再設定メールを送信</>
                  }
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
                  <ArrowLeft size={12} />
                  ログインへ戻る
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
