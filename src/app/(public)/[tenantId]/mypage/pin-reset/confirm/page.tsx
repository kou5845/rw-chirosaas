/**
 * 暗証番号再設定 確認ページ（Step 2）
 *
 * URL: /{tenantSlug}/mypage/pin-reset/confirm?token=<token>
 *
 * トークンを検証し、有効なら PinResetConfirmForm を表示する。
 * 無効・期限切れはエラー画面を表示する。
 */

import Link     from "next/link";
import { notFound } from "next/navigation";
import { prisma }   from "@/lib/prisma";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PinResetConfirmForm } from "./PinResetConfirmForm";

type Props = {
  params:       Promise<{ tenantId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PinResetConfirmPage({ params, searchParams }: Props) {
  const { tenantId: slug } = await params;
  const { token }          = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  // トークン形式チェック（DB 問い合わせ前の早期リジェクト）
  const isValidFormat = token && /^[0-9a-f]{64}$/.test(token);

  const isTokenValid = isValidFormat
    ? !!(await prisma.patient.findFirst({
        where: {
          tenantId:               tenant.id,
          pinResetToken:          token,
          pinResetTokenExpiresAt: { gt: new Date() },
          isActive:               true,
        },
        select: { id: true },
      }))
    : false;

  if (!isTokenValid) {
    return (
      <div className="mx-auto max-w-md min-h-dvh bg-[#F9FAFB]">
        <header className="relative overflow-hidden bg-gradient-to-br from-red-400 to-red-500 px-6 pt-16 pb-12">
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#F9FAFB] to-transparent" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 shadow-sm">
            <AlertTriangle size={22} className="text-white" />
          </div>
          <h1 className="relative mt-4 text-2xl font-bold tracking-tight text-white">
            リンクが無効です
          </h1>
          <p className="relative mt-1 text-sm text-white/60">{tenant.name}</p>
        </header>

        <div className="px-4 -mt-2 pb-20">
          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-md px-6 py-8 space-y-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              このリンクは無効または有効期限（24時間）が切れています。<br />
              お手数ですが、もう一度再設定をお申し込みください。
            </p>
            <Link
              href={`/${slug}/mypage/pin-reset`}
              className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-[var(--brand-medium)] text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-dark)]"
            >
              再設定をやり直す
            </Link>
            <Link
              href={`/${slug}/mypage/login`}
              className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft size={12} />
              ログインページへ戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PinResetConfirmForm
      tenantSlug={slug}
      clinicName={tenant.name}
      token={token!}
    />
  );
}
