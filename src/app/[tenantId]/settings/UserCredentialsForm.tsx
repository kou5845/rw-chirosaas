"use client";

/**
 * ログインID・メール・パスワード変更フォーム
 *
 * CLAUDE.md デザインコンセプト: 「信頼」「清潔」「静謐」
 */

import { useActionState, useState } from "react";
import {
  KeyRound, Mail, Lock, Eye, EyeOff,
  Save, Loader2, AlertCircle, CheckCircle2, UserCog,
} from "lucide-react";
import { updateUserCredentials, type CredentialsState } from "./user-credentials-action";

type Props = {
  currentLoginId: string;
  currentEmail:   string;
};

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const errCls = "border-red-300 bg-red-50/50";

export function UserCredentialsForm({ currentLoginId, currentEmail }: Props) {
  const [state, action, isPending] = useActionState<CredentialsState, FormData>(
    updateUserCredentials,
    null
  );

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [changePass,  setChangePass]  = useState(false);

  const errors = state?.errors;

  return (
    <form action={action} className="space-y-4">

      {/* エラー */}
      {errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{errors.general}</span>
        </div>
      )}

      {/* 成功 */}
      {state?.success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>変更を保存しました。次回ログイン時から新しいIDが有効になります。</span>
        </div>
      )}

      {/* ログインID */}
      <div>
        <label htmlFor="cred-loginId" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <KeyRound size={13} className="text-gray-400" />
          ログインID
        </label>
        <input
          id="cred-loginId"
          name="loginId"
          type="text"
          defaultValue={currentLoginId}
          autoComplete="username"
          placeholder="半角英数字・ハイフン・アンダーバー"
          className={`mt-1.5 ${inputCls} ${errors?.loginId ? errCls : ""}`}
        />
        {errors?.loginId && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={11} />{errors.loginId}
          </p>
        )}
      </div>

      {/* メールアドレス */}
      <div>
        <label htmlFor="cred-email" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <Mail size={13} className="text-gray-400" />
          メールアドレス
          <span className="text-[11px] font-normal text-gray-400">（パスワード再設定に使用）</span>
        </label>
        <input
          id="cred-email"
          name="email"
          type="email"
          defaultValue={currentEmail}
          autoComplete="email"
          placeholder="例: admin@example.com"
          className={`mt-1.5 ${inputCls} ${errors?.email ? errCls : ""}`}
        />
        {errors?.email && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={11} />{errors.email}
          </p>
        )}
      </div>

      {/* パスワード変更トグル */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/50">
        <button
          type="button"
          onClick={() => setChangePass((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
        >
          <span className="flex items-center gap-2">
            <Lock size={14} className="text-gray-400" />
            パスワードを変更する
          </span>
          <span className={`text-xs ${changePass ? "text-[var(--brand-dark)]" : "text-gray-400"}`}>
            {changePass ? "▲ 閉じる" : "▼ 開く"}
          </span>
        </button>

        {changePass && (
          <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3">
            {/* 現在のパスワード */}
            <div>
              <label htmlFor="cred-current-pw" className="block text-sm font-medium text-gray-700">
                現在のパスワード
              </label>
              <div className="relative mt-1.5">
                <input
                  id="cred-current-pw"
                  name="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="現在のパスワードを入力"
                  className={`${inputCls} pr-11 ${errors?.currentPassword ? errCls : ""}`}
                />
                <button type="button" onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? "非表示" : "表示"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors?.currentPassword && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={11} />{errors.currentPassword}
                </p>
              )}
            </div>

            {/* 新しいパスワード */}
            <div>
              <label htmlFor="cred-new-pw" className="block text-sm font-medium text-gray-700">
                新しいパスワード
                <span className="ml-1 text-[11px] font-normal text-gray-400">（8文字以上）</span>
              </label>
              <div className="relative mt-1.5">
                <input
                  id="cred-new-pw"
                  name="newPassword"
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="新しいパスワードを入力"
                  className={`${inputCls} pr-11 ${errors?.newPassword ? errCls : ""}`}
                />
                <button type="button" onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "非表示" : "表示"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors?.newPassword && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={11} />{errors.newPassword}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending
            ? <><Loader2 size={15} className="animate-spin" />保存中…</>
            : <><Save size={15} />変更を保存する</>
          }
        </button>
      </div>
    </form>
  );
}

// セクションヘッダー用のアイコン（settings page.tsx でインポートして使用）
export { UserCog };
