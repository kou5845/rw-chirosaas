"use client";

/**
 * ログインページ
 *
 * CLAUDE.md デザインコンセプト: 「信頼」「清潔」「静謐」
 * 医療・ウェルネス領域に相応しい、余白を活かしたモダンミニマルデザイン。
 */

import { useActionState, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Eye,
  EyeOff,
  LogIn,
  Loader2,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import { loginAction, type LoginState } from "./actions";

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";

function LoginForm() {
  const router = useRouter();
  const [state, action, isPending] = useActionState<LoginState, FormData>(loginAction, null);
  const [showPw, setShowPw] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (state?.success) {
      router.push("/");
    }
  }, [state, router]);
  const urlError = searchParams.get("error") === "disabled"
    ? "このアカウントは現在無効化されています。管理者にお問い合わせください。"
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4">

      {/* カード */}
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">

        {/* ヘッダー */}
        <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-8 py-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Activity size={28} className="text-white" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">SyncotBase</p>
            <p className="mt-0.5 text-sm text-white/70">予約管理システム</p>
          </div>
        </div>

        {/* フォーム */}
        <div className="px-8 py-8">
          <h1 className="mb-6 text-center text-xl font-semibold text-gray-800">
            ログイン
          </h1>

          {/* エラー（URLパラメータ由来 or Server Action 由来） */}
          {(urlError || state?.error) && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{urlError ?? state?.error}</span>
            </div>
          )}

          <form action={action} className="space-y-4">
            {/* ログインID */}
            <div>
              <label htmlFor="loginId" className="block text-sm font-medium text-gray-700">
                ログインID
              </label>
              <div className="relative mt-1.5">
                <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  id="loginId"
                  name="loginId"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="例: yamada-admin"
                  className={`${inputCls} pl-10`}
                />
              </div>
            </div>

            {/* パスワード */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                パスワード
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="パスワードを入力"
                  className={`${inputCls} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ログインボタン */}
            <button
              type="submit"
              disabled={isPending}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-medium)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <><Loader2 size={16} className="animate-spin" />ログイン中…</>
              ) : (
                <><LogIn size={16} />ログイン</>
              )}
            </button>
          </form>

          {/* パスワード忘れリンク */}
          <div className="mt-5 text-center">
            <Link
              href="/forgot-password"
              className="text-xs text-[var(--brand-dark)] underline-offset-2 hover:underline"
            >
              パスワードを忘れた場合
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        © 2026 SyncotBase. All rights reserved.
      </p>
    </div>
  );
}

import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]" />}>
      <LoginForm />
    </Suspense>
  );
}
