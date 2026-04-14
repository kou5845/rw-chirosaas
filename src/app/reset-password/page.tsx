"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Activity, Eye, EyeOff, Lock, Loader2, AlertCircle, CheckCircle2, ArrowLeft,
} from "lucide-react";
import { useState, Suspense } from "react";
import { resetPassword, type ResetPasswordState } from "@/app/forgot-password/actions";

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, action, isPending] = useActionState<ResetPasswordState, FormData>(
    resetPassword,
    null
  );
  const [showPw,  setShowPw]  = useState(false);
  const [showCnf, setShowCnf] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 text-center px-8 py-8">
        <AlertCircle size={40} className="text-red-400" />
        <p className="font-semibold text-gray-800">リンクが無効です</p>
        <p className="text-sm text-gray-500">
          このリンクは無効か期限切れです。再度パスワード再設定を申請してください。
        </p>
        <Link href="/forgot-password" className="text-sm text-[var(--brand-dark)] hover:underline">
          再設定ページへ →
        </Link>
      </div>
    );
  }

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-4 text-center px-8 py-8">
        <CheckCircle2 size={40} className="text-emerald-500" />
        <div>
          <p className="font-semibold text-gray-800">パスワードを変更しました</p>
          <p className="mt-1 text-sm text-gray-500">新しいパスワードでログインしてください。</p>
        </div>
        <Link
          href="/login"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <ArrowLeft size={14} />
          ログインへ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="px-8 py-8">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">新しいパスワードを設定</h1>

      {state?.error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />

        {/* 新しいパスワード */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            新しいパスワード
            <span className="ml-1 text-xs font-normal text-gray-400">（8文字以上）</span>
          </label>
          <div className="relative mt-1.5">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="8文字以上で入力"
              className={`${inputCls} pl-10 pr-11`}
            />
            <button type="button" onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "非表示" : "表示"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* 確認用パスワード */}
        <div>
          <label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700">
            パスワード（確認）
          </label>
          <div className="relative mt-1.5">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              id="passwordConfirm"
              name="passwordConfirm"
              type={showCnf ? "text" : "password"}
              autoComplete="new-password"
              required
              placeholder="もう一度入力"
              className={`${inputCls} pl-10 pr-11`}
            />
            <button type="button" onClick={() => setShowCnf((v) => !v)}
              aria-label={showCnf ? "非表示" : "表示"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showCnf ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-medium)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          {isPending
            ? <><Loader2 size={16} className="animate-spin" />変更中…</>
            : <><Lock size={16} />パスワードを変更する</>
          }
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-8 py-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Activity size={28} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-white">パスワード再設定</p>
        </div>
        <Suspense fallback={<div className="px-8 py-8 text-sm text-gray-400">読み込み中…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
