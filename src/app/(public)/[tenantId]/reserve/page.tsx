/**
 * 患者向け公開予約フォームページ
 *
 * - 認証不要（proxy.ts でパブリックパスとして許可済み）
 * - テナント情報・営業時間を Server Component で取得し、ReserveForm に渡す
 * - URL: /{tenantSlug}/reserve
 */

import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/mypage-session";
import { ReserveForm, type BusinessHourSummary, type ServiceSummary, type LockedPatient } from "./ReserveForm";
import { ReserveTriage } from "./ReserveTriage";

type Props = {
  params:       Promise<{ tenantId: string }>;
  searchParams: Promise<{ name?: string; kana?: string; phone?: string; email?: string; rt?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { tenantId: slug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { name: true },
  });
  return {
    title: tenant ? `${tenant.name} — 予約フォーム` : "予約フォーム",
  };
}

export default async function ReservePage({ params, searchParams }: Props) {
  const { tenantId: slug } = await params;
  const { name, kana, phone: prefillPhone, email: prefillEmail, rt } = await searchParams;

  // CLAUDE.md: tenantId は DB 照合で確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true, isActive: true, phone: true, address: true, lineEnabled: true, lineFriendUrl: true },
  });

  if (!tenant || !tenant.isActive) notFound();

  // マイページからの遷移: 署名付きトークンで患者を識別し、フィールドをロック
  let lockedPatient: LockedPatient | null = null;
  if (rt) {
    const session = verifySessionToken(decodeURIComponent(rt));
    if (session && session.tenantId === tenant.id) {
      const patient = await prisma.patient.findFirst({
        where:  { id: session.patientId, tenantId: tenant.id, isActive: true },
        select: { id: true, displayName: true, nameKana: true, phone: true, email: true, lineUserId: true },
      });
      if (patient) lockedPatient = patient;
    }
  }

  // 曜日別営業フラグのみ取得（実際のスロット可否は Client からの Server Action で判定）
  const rawHours = await prisma.businessHour.findMany({
    where:   { tenantId: tenant.id },
    select:  { dayOfWeek: true, isOpen: true },
    orderBy: { dayOfWeek: "asc" },
  });

  const businessHours: BusinessHourSummary[] = rawHours;

  // 施術マスタ（メニュー選択 + スロット可否算出に使用）
  const rawServices = await prisma.service.findMany({
    where:   { tenantId: tenant.id, isActive: true },
    select:  { id: true, name: true, duration: true, intervalMin: true, price: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const services: ServiceSummary[] = rawServices;

  return (
    <div className="min-h-screen bg-[#F0FAFB]">

      {/* ── ヘッダー ── */}
      <header className="border-b border-[var(--brand-border)] bg-white backdrop-blur-sm supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-medium)]">
            <CalendarDays size={18} className="text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-800">{tenant.name}</p>
            <p className="text-xs text-gray-400">オンライン予約フォーム</p>
          </div>
        </div>
      </header>

      {/* ── メインコンテンツ ── */}
      <main className="mx-auto max-w-lg px-4 py-6">

        {lockedPatient ? (
          /* ── 2回目以降の方（?rt=<token> でロック済み）── */
          <>
            <div className="mb-5 rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-4 sm:px-5">
              <p className="text-sm font-semibold text-gray-700">ご予約の流れ</p>
              <ol className="mt-2 space-y-1 text-xs text-gray-500 list-none">
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)] text-[10px] font-bold text-[var(--brand-dark)]">1</span>
                  ご希望の日付・時間を選択してください
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)] text-[10px] font-bold text-[var(--brand-dark)]">2</span>
                  登録情報を確認して申し込みください
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)] text-[10px] font-bold text-[var(--brand-dark)]">3</span>
                  スタッフ確認後、LINE または電話でご連絡します
                </li>
              </ol>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-5 shadow-sm sm:px-5 sm:py-6">
              <ReserveForm
                tenantSlug={slug}
                businessHours={businessHours}
                services={services}
                phone={tenant.phone}
                address={tenant.address}
                lineEnabled={tenant.lineEnabled}
                lineFriendUrl={tenant.lineFriendUrl}
                lockedPatient={lockedPatient}
              />
            </div>
          </>
        ) : (
          /* ── 振り分け画面（初めての方 / 2回目以降の方）── */
          <ReserveTriage
            tenantSlug={slug}
            clinicName={tenant.name}
            businessHours={businessHours}
            services={services}
            phone={tenant.phone}
            address={tenant.address}
            lineEnabled={tenant.lineEnabled}
            lineFriendUrl={tenant.lineFriendUrl}
            prefill={{ name, nameKana: kana, phone: prefillPhone, email: prefillEmail }}
          />
        )}

        {tenant.phone ? (
          <p className="mt-5 text-center text-xs text-gray-400">
            お電話でのご予約・変更・キャンセルは <span className="font-semibold text-gray-600">{tenant.phone}</span> までご連絡ください。
          </p>
        ) : (
          <p className="mt-5 text-center text-xs text-gray-400">
            お電話での予約も受け付けております。お気軽にご連絡ください。
          </p>
        )}
      </main>
    </div>
  );
}
