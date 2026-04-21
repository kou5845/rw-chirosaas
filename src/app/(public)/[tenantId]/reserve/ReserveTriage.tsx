"use client";

/**
 * 予約フォーム 振り分け画面（初めての方 / 2回目以降の方）
 *
 * モード:
 *   "select" → 2つの選択カード
 *   "login"  → 2回目以降の方ログインフォーム（生年月日 × 暗証番号）
 *   "guest"  → 初めての方 → ReserveForm をそのまま表示
 *
 * ログイン成功時は loginForReserve が ?rt=<token> へリダイレクト。
 * page.tsx 側で rt を検出して lockedPatient を渡す既存フローへ合流する。
 */

import { useState } from "react";
import { useActionState } from "react";
import {
  ArrowLeft, ChevronRight, CreditCard, Loader2,
  AlertCircle, Lock, Sparkles,
} from "lucide-react";
import {
  ReserveForm,
  type BusinessHourSummary,
  type ServiceSummary,
} from "./ReserveForm";
import { loginForReserve, type TriageLoginState } from "./reserve-triage-action";

// ── 型定義 ──────────────────────────────────────────────────────────────

type TriageProps = {
  tenantSlug:    string;
  clinicName:    string;
  businessHours: BusinessHourSummary[];
  services:      ServiceSummary[];
  phone:         string | null;
  address:       string | null;
  lineEnabled:   boolean;
  lineFriendUrl: string | null;
  prefill?: {
    name?:     string | undefined;
    nameKana?: string | undefined;
    phone?:    string | undefined;
    email?:    string | undefined;
  };
};

type Mode = "select" | "login" | "guest";

// ── 共通スタイル ─────────────────────────────────────────────────────────

const inputBase =
  "block w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 " +
  "text-sm text-gray-800 font-mono placeholder:text-gray-300 " +
  "hover:border-[var(--brand-border)] focus:outline-none " +
  "focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors";

// ── ご予約の流れバナー ────────────────────────────────────────────────────

function StepsBanner() {
  return (
    <div className="mb-5 rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-4 sm:px-5">
      <p className="text-sm font-semibold text-gray-700">ご予約の流れ</p>
      <ol className="mt-2 space-y-1 text-xs text-gray-500 list-none">
        {[
          "ご希望の日付・時間を選択してください",
          "お名前と電話番号を入力して申し込みください",
          "スタッフ確認後、LINE または電話でご連絡します",
        ].map((text, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)] text-[10px] font-bold text-[var(--brand-dark)]">
              {i + 1}
            </span>
            {text}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── 振り分け選択カード ────────────────────────────────────────────────────

function TriageSelect({
  onGuest,
  onLogin,
}: {
  onGuest: () => void;
  onLogin: () => void;
}) {
  return (
    <div className="py-1">

      {/* タイトル */}
      <div className="mb-7 text-center">
        <p className="mb-2 text-[10px] font-bold tracking-[0.35em] text-[var(--brand-dark)] uppercase">
          Online Reservation
        </p>
        <h2 className="text-xl font-bold leading-snug text-gray-800">
          ご予約方法を
          <br className="sm:hidden" />
          お選びください
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          はじめての方も、ご来院済みの方も
          <br />
          かんたんにご予約いただけます
        </p>
      </div>

      {/* 装飾区切り */}
      <div className="mb-7 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--brand-border)]" />
        <div className="flex gap-1">
          <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
          <span className="h-1 w-3 rounded-full bg-[var(--brand)]" />
          <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
        </div>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--brand-border)]" />
      </div>

      {/* 選択カード */}
      <div className="grid gap-4 sm:grid-cols-2">

        {/* ── 初めての方 ── */}
        <button
          type="button"
          onClick={onGuest}
          className="group relative flex min-h-[188px] flex-col items-start gap-3 rounded-2xl border-2 border-[var(--brand-border)] bg-gradient-to-br from-[var(--brand-hover)] to-white px-5 py-6 text-left transition-all hover:border-[var(--brand-medium)] hover:shadow-[0_4px_20px_rgba(91,186,196,0.18)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        >
          {/* ドット地紋 */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle, #2B8C96 1px, transparent 1px)",
              backgroundSize:  "14px 14px",
            }}
            aria-hidden="true"
          />

          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-medium)] text-white shadow-sm">
            <Sparkles size={20} />
          </div>

          <div className="relative flex-1">
            <p className="mb-0.5 text-[9px] font-bold tracking-[0.3em] text-[var(--brand-dark)] uppercase">
              First Visit
            </p>
            <p className="text-lg font-bold leading-tight text-gray-800">
              初めての方
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              お名前・電話番号を入力して
              <br />
              かんたんにご予約いただけます
            </p>
          </div>

          <ChevronRight
            size={18}
            className="absolute bottom-4 right-4 text-[var(--brand-medium)] transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>

        {/* ── 2回目以降の方 ── */}
        <button
          type="button"
          onClick={onLogin}
          className="group relative flex min-h-[188px] flex-col items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white px-5 py-6 text-left transition-all hover:border-[var(--brand-medium)] hover:shadow-[0_4px_20px_rgba(91,186,196,0.18)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-800 text-white shadow-sm">
            <CreditCard size={20} />
          </div>

          <div className="flex-1">
            <p className="mb-0.5 text-[9px] font-bold tracking-[0.3em] text-gray-400 uppercase">
              Returning Patient
            </p>
            <p className="text-lg font-bold leading-tight text-gray-800">
              2回目以降の方
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              登録情報を引き継いで
              <br />
              スムーズにご予約いただけます
            </p>
          </div>

          <ChevronRight
            size={18}
            className="absolute bottom-4 right-4 text-gray-400 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </div>

      <p className="mt-5 text-center text-[11px] text-gray-300">
        ログイン情報はスタッフにお問い合わせください
      </p>
    </div>
  );
}

// ── ログインフォーム（2回目以降の方） ────────────────────────────────────

function TriageLoginForm({
  tenantSlug,
  onBack,
}: {
  tenantSlug: string;
  onBack:     () => void;
}) {
  const [state, action, isPending] = useActionState<TriageLoginState, FormData>(
    loginForReserve,
    null
  );

  return (
    <div>
      {/* 戻るボタン */}
      <button
        type="button"
        onClick={onBack}
        className="mb-5 flex items-center gap-1.5 rounded text-xs text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >
        <ArrowLeft size={13} />
        選択に戻る
      </button>

      {/* タイトル */}
      <div className="mb-6">
        <p className="mb-1 text-[9px] font-bold tracking-[0.35em] text-[var(--brand-dark)] uppercase">
          Returning Patient
        </p>
        <h3 className="text-xl font-bold text-gray-800">2回目以降の方</h3>
        <p className="mt-1 text-xs text-gray-400">
          登録情報を引き継いでスムーズにご予約いただけます
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="tenantSlug" value={tenantSlug} />

        {/* エラー */}
        {state?.error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        {/* 生年月日（ID） */}
        <div>
          <label
            htmlFor="triage-birthDate"
            className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
          >
            ID — 生年月日
          </label>
          <input
            id="triage-birthDate"
            name="birthDate"
            type="text"
            inputMode="numeric"
            maxLength={8}
            placeholder="例: 19830405"
            autoComplete="off"
            className={`${inputBase} tracking-[0.2em]`}
          />
          <p className="mt-1.5 px-1 text-[11px] text-gray-400">
            西暦8桁（例: 1983年4月5日 → 19830405）
          </p>
        </div>

        {/* 暗証番号（PASS） */}
        <div>
          <label
            htmlFor="triage-accessPin"
            className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-gray-400"
          >
            PASS — 暗証番号
          </label>
          <input
            id="triage-accessPin"
            name="accessPin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            autoComplete="current-password"
            className={`${inputBase} tracking-[0.4em] text-center text-lg`}
          />
          <p className="mt-1.5 px-1 text-[11px] text-gray-400">
            初回予約完了メールに記載の4桁の数字
          </p>
        </div>

        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={isPending}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gray-800 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              確認中…
            </>
          ) : (
            <>
              <Lock size={14} />
              ログインして予約へ進む
            </>
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-[11px] text-gray-300">
        ログイン情報はスタッフにお問い合わせください
      </p>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────

export function ReserveTriage({
  tenantSlug,
  clinicName: _clinicName,
  businessHours,
  services,
  phone,
  address,
  lineEnabled,
  lineFriendUrl,
  prefill,
}: TriageProps) {
  const [mode, setMode] = useState<Mode>("select");

  // 初めての方モード: ステップバナー + 通常の予約フォーム
  if (mode === "guest") {
    return (
      <>
        <StepsBanner />
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-5 shadow-sm sm:px-5 sm:py-6">
          <ReserveForm
            tenantSlug={tenantSlug}
            businessHours={businessHours}
            services={services}
            phone={phone}
            address={address}
            lineEnabled={lineEnabled}
            lineFriendUrl={lineFriendUrl}
            prefill={prefill}
          />
        </div>
      </>
    );
  }

  // 選択 / ログインモード: 共通カードラッパー
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-5 shadow-sm sm:px-5 sm:py-6">
      {mode === "login" ? (
        <TriageLoginForm
          tenantSlug={tenantSlug}
          onBack={() => setMode("select")}
        />
      ) : (
        <TriageSelect
          onGuest={() => setMode("guest")}
          onLogin={() => setMode("login")}
        />
      )}
    </div>
  );
}
