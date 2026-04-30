/**
 * 個人情報保護方針 — 全文ページ
 *
 * URL: /privacy（全テナント共通・静的ページ）
 */

import type { Metadata } from "next";
import { Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "個人情報保護方針 — SyncotBase",
  description:
    "SyncotBaseにおける個人情報の取扱いに関する方針を説明しています。",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="mx-auto max-w-2xl">

        {/* ヘッダー */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm border border-gray-100">
            <Shield size={24} className="text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">個人情報保護方針</h1>
          <p className="mt-2 text-sm text-gray-500">運営：Rhythmwalker</p>
        </div>

        {/* 本文カード */}
        <div className="rounded-3xl border border-gray-100 bg-white px-8 py-10 shadow-sm space-y-8 text-sm leading-relaxed text-gray-700">

          <p>
            当サービス（以下「本サービス」）は、患者・利用者の皆様の個人情報を適切に保護・管理するため、以下の方針を定めます。
          </p>

          <Section title="取得する情報">
            <ul className="space-y-1 pl-1">
              <li>・氏名・ふりがな・生年月日</li>
              <li>・電話番号・メールアドレス</li>
              <li>・予約情報（日時・施術内容・担当スタッフ）</li>
              <li>・診療・施術に関する記録（要配慮個人情報を含む）</li>
              <li>・LINE ユーザーID（LINE連携をご利用の場合）</li>
            </ul>
          </Section>

          <Section title="利用目的">
            <ul className="space-y-1 pl-1">
              <li>・予約の受付・確定・変更・キャンセルのご連絡</li>
              <li>・前日リマインダーなどのお知らせ送信</li>
              <li>・診療・施術の記録および管理</li>
              <li>・本サービスの改善・品質向上</li>
            </ul>
          </Section>

          <Section title="要配慮個人情報について">
            <p>
              診療・施術に関する情報は、個人情報保護法上の「要配慮個人情報」に該当する場合があります。
              本サービスへの情報入力をもって、当該情報の取扱いにご同意いただいたものとみなします。
            </p>
          </Section>

          <Section title="第三者への提供">
            <p>取得した個人情報は、以下の場合を除き第三者へ提供しません。</p>
            <ul className="mt-2 space-y-1 pl-1">
              <li>・法令に基づく場合</li>
              <li>・患者様ご本人の同意がある場合</li>
            </ul>
          </Section>

          <Section title="委託">
            <p>
              予約システムの運用に際し、クラウドサービス（Vercel / Supabase 等）に情報処理を委託しています。
              委託先とは適切な安全管理を定めた契約を締結しています。
            </p>
          </Section>

          <Section title="安全管理措置">
            <p>
              個人情報への不正アクセス・漏洩・紛失・毀損を防止するため、技術的・組織的な安全管理措置を講じています。
            </p>
          </Section>

          <Section title="保管期間">
            <p>
              ご登録情報は、最終ご利用日から5年間保管します。
              保管期間終了後または削除依頼を受けた場合は、合理的な期間内に削除します。
            </p>
          </Section>

          <Section title="開示・訂正・削除のご請求">
            <p>
              マイページの「登録情報の確認・変更」からご自身で変更いただけます。
              その他のご要望は下記窓口へお申し付けください。
            </p>
          </Section>

          <Section title="お問い合わせ">
            <p>
              各医院の受付窓口または<br />
              <a
                href="mailto:contact@rhythmwalker.jp"
                className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800"
              >
                contact@rhythmwalker.jp
              </a>
              <br />
              までお問い合わせください。
            </p>
          </Section>

          <Section title="改定について">
            <p>
              本方針を改定する場合は、本ページ上での告知をもって通知に代えます。
            </p>
          </Section>

          {/* フッター */}
          <div className="border-t border-gray-100 pt-6 text-xs text-gray-400">
            制定日：2026年5月
          </div>
        </div>

        {/* 閉じる案内（別タブで開かれる想定） */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            このタブを閉じて前のページにお戻りください
          </p>
        </div>

      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-[13px] font-bold text-gray-900">■ {title}</h2>
      <div className="text-gray-600">{children}</div>
    </div>
  );
}
