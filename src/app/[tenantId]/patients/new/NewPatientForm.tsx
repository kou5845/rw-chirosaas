"use client";

/**
 * 患者新規登録フォーム（Client Component）
 *
 * CLAUDE.md 規約:
 *   - モバイルファースト・44px タップターゲット保証
 *   - エラーはフィールド直下にインライン表示
 */

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Loader2, AlertCircle } from "lucide-react";
import { createPatient, type CreatePatientState } from "./actions";

type Props = {
  tenantId:   string;
  tenantSlug: string;
};

// 年の選択肢: 現在年 〜 100年前
const THIS_YEAR = new Date().getFullYear();
const YEARS  = Array.from({ length: 101 }, (_, i) => THIS_YEAR - i);
const MONTHS = Array.from({ length: 12  }, (_, i) => i + 1);
const DAYS   = Array.from({ length: 31  }, (_, i) => i + 1);

const inputBase =
  "mt-2 block w-full rounded-xl border px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const inputNormal = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputError  = "border-red-300 bg-red-50/50";
const selectBase  =
  "mt-2 block rounded-xl border px-3 py-3 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors appearance-none cursor-pointer";

export function NewPatientForm({ tenantId, tenantSlug }: Props) {
  const [state, action, isPending] = useActionState<CreatePatientState, FormData>(
    createPatient,
    null
  );

  const errors = state?.errors;

  return (
    <>
      {/* ── ページヘッダー ── */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${tenantSlug}/patients`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
          aria-label="患者一覧に戻る"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-800">患者を新規登録</h1>
          <p className="mt-0.5 text-sm text-gray-500">基本情報を入力して登録してください</p>
        </div>
      </div>

      {/* ── フォームカード ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* カードヘッダー */}
        <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <UserPlus size={15} />
            </div>
            <span className="text-sm font-semibold text-[var(--brand-darker)]">基本情報</span>
          </div>
        </div>

        <form action={action} className="space-y-0">

          <div className="divide-y divide-gray-50 px-6">

            {/* 全体エラー */}
            {errors?.general && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mt-6 text-sm text-red-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{errors.general}</span>
              </div>
            )}

            {/* 氏名（漢字） */}
            <div className="py-5">
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                氏名（漢字）
                <span className="ml-1.5 text-xs font-normal text-red-500">必須</span>
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                placeholder="例: 山田 太郎"
                className={`${inputBase} ${errors?.displayName ? inputError : inputNormal}`}
              />
              {errors?.displayName && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={12} />
                  {errors.displayName}
                </p>
              )}
            </div>

            {/* ふりがな */}
            <div className="py-5">
              <label htmlFor="nameKana" className="block text-sm font-medium text-gray-700">
                ふりがな（ひらがな）
                <span className="ml-1.5 text-xs font-normal text-red-500">必須</span>
              </label>
              <input
                id="nameKana"
                name="nameKana"
                type="text"
                autoComplete="off"
                placeholder="例: やまだ たろう"
                className={`${inputBase} ${errors?.nameKana ? inputError : inputNormal}`}
              />
              {errors?.nameKana && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={12} />
                  {errors.nameKana}
                </p>
              )}
            </div>

            {/* 電話番号 */}
            <div className="py-5">
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                電話番号
                <span className="ml-1.5 text-xs font-normal text-red-500">必須</span>
              </label>
              <p className="mt-0.5 text-xs text-gray-400">ハイフンなし</p>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="例: 090-1234-5678"
                className={`${inputBase} ${errors?.phone ? inputError : inputNormal}`}
              />
              {errors?.phone && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={12} />
                  {errors.phone}
                </p>
              )}
            </div>

            {/* メールアドレス */}
            <div className="py-5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                メールアドレス
                <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
              </label>
              <p className="mt-0.5 text-xs text-gray-400">予約確認メールの送信先</p>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="例: yamada@example.com"
                className={`${inputBase} ${errors?.email ? inputError : inputNormal}`}
              />
              {errors?.email && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={12} />
                  {errors.email}
                </p>
              )}
            </div>

            {/* 生年月日（年・月・日セレクト）*/}
            <div className="py-5">
              <p className="block text-sm font-medium text-gray-700">
                生年月日
                <span className="ml-1.5 text-xs font-normal text-red-500">必須</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-400">マイページのログインIDとして使用されます</p>

              <div className="mt-2 flex items-center gap-2">
                {/* 年 */}
                <div className="relative flex-1">
                  <select
                    name="birthYear"
                    defaultValue=""
                    className={`${selectBase} w-full ${errors?.birthDate ? "border-red-300" : "border-gray-200 hover:border-[var(--brand-border)]"}`}
                  >
                    <option value="">年</option>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                </div>

                {/* 月 */}
                <div className="relative w-24">
                  <select
                    name="birthMonth"
                    defaultValue=""
                    className={`${selectBase} w-full ${errors?.birthDate ? "border-red-300" : "border-gray-200 hover:border-[var(--brand-border)]"}`}
                  >
                    <option value="">月</option>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                </div>

                {/* 日 */}
                <div className="relative w-20">
                  <select
                    name="birthDay"
                    defaultValue=""
                    className={`${selectBase} w-full ${errors?.birthDate ? "border-red-300" : "border-gray-200 hover:border-[var(--brand-border)]"}`}
                  >
                    <option value="">日</option>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>{d}日</option>
                    ))}
                  </select>
                </div>
              </div>

              {errors?.birthDate && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle size={12} />
                  {errors.birthDate}
                </p>
              )}
            </div>

          </div>

          {/* ── アクションボタン ── */}
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-6 py-4">
            <Link
              href={`/${tenantSlug}/patients`}
              className="flex h-11 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
            >
              キャンセル
            </Link>

            <button
              type="submit"
              disabled={isPending}
              className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  登録中…
                </>
              ) : (
                <>
                  <UserPlus size={15} />
                  患者を登録する
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
