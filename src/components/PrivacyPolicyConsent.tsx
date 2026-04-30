"use client";

/**
 * 個人情報保護方針 — 同意チェックボックスUI
 *
 * 予約フォームの送信ボタン直前に配置する。
 * スクロール可能な小窓 + 同意チェックボックスを提供する。
 */

import { useState } from "react";
import { Shield } from "lucide-react";

type Props = {
  onAgreedChange: (agreed: boolean) => void;
};

export function PrivacyPolicyConsent({ onAgreedChange }: Props) {
  const [agreed, setAgreed] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setAgreed(checked);
    onAgreedChange(checked);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Shield size={14} className="shrink-0 text-gray-400" />
        <p className="text-xs font-semibold text-gray-500">個人情報保護方針</p>
      </div>

      {/* スクロール可能な規約本文 */}
      <div
        className="h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3.5 text-[11px] leading-relaxed text-gray-600 scroll-smooth"
        tabIndex={0}
        aria-label="個人情報保護方針の本文"
      >
        <p className="mb-2 font-bold text-gray-700">個人情報保護方針</p>
        <p className="mb-3 text-gray-500">運営：Rhythmwalker</p>

        <p className="mb-3">
          当サービス（以下「本サービス」）は、患者・利用者の皆様の個人情報を適切に保護・管理するため、以下の方針を定めます。
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ 取得する情報</p>
        <ul className="mb-3 list-none space-y-0.5 pl-2">
          <li>・氏名・ふりがな・生年月日</li>
          <li>・電話番号・メールアドレス</li>
          <li>・予約情報（日時・施術内容・担当スタッフ）</li>
          <li>・診療・施術に関する記録（要配慮個人情報を含む）</li>
          <li>・LINE ユーザーID（LINE連携をご利用の場合）</li>
        </ul>

        <p className="mb-1 font-semibold text-gray-700">■ 利用目的</p>
        <ul className="mb-3 list-none space-y-0.5 pl-2">
          <li>・予約の受付・確定・変更・キャンセルのご連絡</li>
          <li>・前日リマインダーなどのお知らせ送信</li>
          <li>・診療・施術の記録および管理</li>
          <li>・本サービスの改善・品質向上</li>
        </ul>

        <p className="mb-1 font-semibold text-gray-700">■ 要配慮個人情報について</p>
        <p className="mb-3">
          診療・施術に関する情報は、個人情報保護法上の「要配慮個人情報」に該当する場合があります。本サービスへの情報入力をもって、当該情報の取扱いにご同意いただいたものとみなします。
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ 第三者への提供</p>
        <p className="mb-3">
          取得した個人情報は、以下の場合を除き第三者へ提供しません。<br />
          ・法令に基づく場合<br />
          ・患者様ご本人の同意がある場合
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ 委託</p>
        <p className="mb-3">
          予約システムの運用に際し、クラウドサービス（Vercel / Supabase 等）に情報処理を委託しています。委託先とは適切な安全管理を定めた契約を締結しています。
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ 安全管理措置</p>
        <p className="mb-3">
          個人情報への不正アクセス・漏洩・紛失・毀損を防止するため、技術的・組織的な安全管理措置を講じています。
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ 保管期間</p>
        <p className="mb-3">
          ご登録情報は、最終ご利用日から5年間保管します。保管期間終了後または削除依頼を受けた場合は、合理的な期間内に削除します。
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ 開示・訂正・削除のご請求</p>
        <p className="mb-3">
          マイページの「登録情報の確認・変更」からご自身で変更いただけます。その他のご要望は下記窓口へお申し付けください。
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ お問い合わせ</p>
        <p className="mb-3">
          各医院の受付窓口または<br />
          contact@rhythmwalker.jp<br />
          までお問い合わせください。
        </p>

        <p className="mb-1 font-semibold text-gray-700">■ 改定について</p>
        <p className="mb-3">
          本方針を改定する場合は、本ページ上での告知をもって通知に代えます。
        </p>

        <p className="text-gray-400">制定日：2026年5月</p>
      </div>

      {/* 全文リンク */}
      <div className="text-right">
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-[var(--brand-medium)] underline underline-offset-2 hover:text-[var(--brand-dark)]"
        >
          全文はこちら →
        </a>
      </div>

      {/* 同意チェックボックス */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          id="privacy-agree"
          type="checkbox"
          checked={agreed}
          onChange={handleChange}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-medium)]"
        />
        <span className="text-xs leading-relaxed text-gray-700">
          <span className="font-semibold">個人情報保護方針に同意する</span>
          <span className="ml-1 text-gray-400">（必須）</span>
        </span>
      </label>
    </div>
  );
}
