"use client";

/**
 * 新規医院登録フォーム
 *
 * CLAUDE.md デザインコンセプト: 「信頼」「清潔」「静謐」
 */

import { useActionState, useState } from "react";
import {
  Building2, Hash, KeyRound, Mail, Lock,
  Eye, EyeOff, PlusCircle, Loader2, AlertCircle,
  CheckCircle2, Copy, Check, ExternalLink, Sparkles,
  Phone, MapPin,
} from "lucide-react";
import { registerClinicAction, type RegisterClinicActionState } from "./actions";

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const errCls  = "border-red-300 bg-red-50/50";
const labelCls = "flex items-center gap-1.5 text-sm font-medium text-gray-700";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-1.5 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
      aria-label="コピー"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

export function RegisterClinicForm() {
  const [state, action, isPending] = useActionState<RegisterClinicActionState, FormData>(
    registerClinicAction,
    null
  );
  const [showPw, setShowPw] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"standard" | "pro">("standard");

  const errors = state?.success === false ? state.errors : undefined;

  // ── 登録完了画面 ──────────────────────────────────────────────
  if (state?.success) {
    const { tenantName, subdomain, loginId, email } = state;
    const loginUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/login`;

    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 size={24} className="text-emerald-600" />
          </div>
          <p className="text-base font-bold text-emerald-800">医院を登録しました</p>
          <p className="mt-1 text-sm text-emerald-700">{tenantName}</p>
        </div>

        {/* 発行情報 */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50/60 px-6 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">発行されたログイン情報</p>
          </div>
          <div className="divide-y divide-gray-50 px-6">
            {[
              { label: "ログインURL",   value: loginUrl },
              { label: "テナントID",    value: subdomain },
              { label: "ログインID",    value: loginId   },
              { label: "メールアドレス", value: email     },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3">
                <span className="text-xs font-medium text-gray-500 w-28 shrink-0">{label}</span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="truncate font-mono text-sm text-gray-800">{value}</span>
                  <CopyButton value={value} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <a
            href="/admin/tenants"
            className="flex-1 flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            テナント一覧へ戻る
          </a>
          <a
            href={loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand-medium)] text-sm font-semibold text-white hover:bg-[var(--brand-dark)] transition-colors"
          >
            <ExternalLink size={14} />
            ログイン画面を開く
          </a>
        </div>
      </div>
    );
  }

  // ── 入力フォーム ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg">
      <form action={action} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <Building2 size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">新規医院登録</p>
              <p className="text-xs text-[var(--brand-dark)]/70">登録後すぐにログインできます</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">

          {/* 全体エラー */}
          {errors?.general && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{errors.general}</span>
            </div>
          )}

          {/* 医院名 */}
          <div>
            <label htmlFor="clinicName" className={labelCls}>
              <Building2 size={13} className="text-gray-400" />
              医院名
            </label>
            <input
              id="clinicName"
              name="clinicName"
              type="text"
              required
              autoFocus
              placeholder="例: やまだ整骨院"
              className={`mt-1.5 ${inputCls} ${errors?.clinicName ? errCls : ""}`}
            />
            {errors?.clinicName && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.clinicName}
              </p>
            )}
          </div>

          {/* テナントID */}
          <div>
            <label htmlFor="subdomain" className={labelCls}>
              <Hash size={13} className="text-gray-400" />
              テナントID
              <span className="ml-1 text-[11px] font-normal text-gray-400">（URL用: 小文字英数字・ハイフン）</span>
            </label>
            <div className="relative mt-1.5">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 select-none pointer-events-none">
                /
              </span>
              <input
                id="subdomain"
                name="subdomain"
                type="text"
                required
                placeholder="例: yamada"
                className={`${inputCls} pl-6 ${errors?.subdomain ? errCls : ""}`}
              />
            </div>
            {errors?.subdomain && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.subdomain}
              </p>
            )}
          </div>

          {/* プラン選択 */}
          <div>
            <label className={labelCls}>
              <Sparkles size={13} className="text-gray-400" />
              プラン
            </label>
            <input type="hidden" name="plan" value={selectedPlan} />
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              {(["standard", "pro"] as const).map((plan) => {
                const isSelected = selectedPlan === plan;
                return (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={[
                      "flex flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors",
                      isSelected
                        ? "border-[var(--brand)] bg-[var(--brand-bg)] ring-1 ring-[var(--brand)]"
                        : "border-gray-200 bg-white hover:border-gray-300",
                    ].join(" ")}
                  >
                    <span className={`text-sm font-semibold ${isSelected ? "text-[var(--brand-darker)]" : "text-gray-700"}`}>
                      {plan === "standard" ? "Standard" : "Pro"}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {plan === "standard" ? "シンプルな運用向け" : "高機能・複数スタッフ向け"}
                    </span>
                  </button>
                );
              })}
            </div>
            {errors?.plan && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.plan}
              </p>
            )}
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">基本情報（任意）</p>

          {/* 電話番号 */}
          <div>
            <label htmlFor="phone" className={labelCls}>
              <Phone size={13} className="text-gray-400" />
              電話番号
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="例: 03-1234-5678"
              className={`mt-1.5 ${inputCls}`}
            />
            <p className="mt-1.5 text-xs text-gray-400">通知メールや予約完了画面に表示されます</p>
          </div>

          {/* 住所 */}
          <div>
            <label htmlFor="address" className={labelCls}>
              <MapPin size={13} className="text-gray-400" />
              住所
            </label>
            <input
              id="address"
              name="address"
              type="text"
              placeholder="例: 東京都渋谷区代々木1-2-3 渋谷ビル2F"
              className={`mt-1.5 ${inputCls}`}
            />
            <p className="mt-1.5 text-xs text-gray-400">Googleマップリンクの生成に使用されます</p>
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">管理者アカウント</p>

          {/* ログインID */}
          <div>
            <label htmlFor="loginId" className={labelCls}>
              <KeyRound size={13} className="text-gray-400" />
              ログインID
            </label>
            <input
              id="loginId"
              name="loginId"
              type="text"
              required
              placeholder="例: yamada-admin"
              className={`mt-1.5 ${inputCls} ${errors?.loginId ? errCls : ""}`}
            />
            {errors?.loginId && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.loginId}
              </p>
            )}
          </div>

          {/* メール */}
          <div>
            <label htmlFor="email" className={labelCls}>
              <Mail size={13} className="text-gray-400" />
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="例: admin@yamada-seikotsu.jp"
              className={`mt-1.5 ${inputCls} ${errors?.email ? errCls : ""}`}
            />
            {errors?.email && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.email}
              </p>
            )}
          </div>

          {/* パスワード */}
          <div>
            <label htmlFor="password" className={labelCls}>
              <Lock size={13} className="text-gray-400" />
              初期パスワード
              <span className="ml-1 text-[11px] font-normal text-gray-400">（8文字以上）</span>
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                placeholder="初期パスワードを設定"
                className={`${inputCls} pr-11 ${errors?.password ? errCls : ""}`}
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
            {errors?.password && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.password}
              </p>
            )}
          </div>
        </div>

        {/* 送信ボタン */}
        <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending
              ? <><Loader2 size={15} className="animate-spin" />登録中…</>
              : <><PlusCircle size={15} />医院を登録する</>
            }
          </button>
        </div>
      </form>
    </div>
  );
}
