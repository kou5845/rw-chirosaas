/**
 * 院の基本設定ページ
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - tenantId はセッション由来の値のみ使用
 */

import { notFound } from "next/navigation";
import { Settings, Info, Clock, Coffee, UserCog, MessageCircle, Bell, MapPin, QrCode } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { SettingsForm, type BusinessHourData } from "./SettingsForm";
import { UserCredentialsForm } from "./UserCredentialsForm";
import { LineSettingsForm } from "./LineSettingsForm";
import { NotificationSettingsForm } from "./NotificationSettingsForm";
import { ClinicInfoForm } from "./ClinicInfoForm";
import { ReservationLinkCard } from "./ReservationLinkCard";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { tenantId: slug } = await params;

  const session = await auth();

  // CLAUDE.md 絶対ルール: tenantId フィルタ必須
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: {
      id:                     true,
      name:                   true,
      lunchStartTime:         true,
      lunchEndTime:           true,
      slotInterval:           true,
      maxCapacity:            true,
      lineChannelSecret:      true,
      lineChannelAccessToken: true,
      lineFriendUrl:          true,
      lineEnabled:            true,
      emailEnabled:           true,
      phone:                  true,
      address:                true,
    },
  });
  if (!tenant) notFound();

  // 曜日別営業時間（全7曜日）
  const rawHours = await prisma.businessHour.findMany({
    where:   { tenantId: tenant.id },
    select:  { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
    orderBy: { dayOfWeek: "asc" },
  });
  const businessHours: BusinessHourData[] = rawHours;

  // ログイン中ユーザーの資格情報
  const loginId = session?.user?.loginId ?? "";
  const user    = loginId
    ? await prisma.user.findUnique({
        where:  { loginId },
        select: { email: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* ── ページヘッダー ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">設定</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          院の営業時間・昼休み・アカウント情報を管理します
        </p>
      </div>

      {/* ── 営業設定カード ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <Settings size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">営業時間・昼休み</p>
              <p className="text-xs text-[var(--brand-dark)]/70">週間カレンダーの表示範囲に反映されます</p>
            </div>
          </div>
        </div>
        <SettingsForm
          key={JSON.stringify(businessHours) + tenant.lunchStartTime + tenant.lunchEndTime + tenant.slotInterval + tenant.maxCapacity}
          tenantSlug={slug}
          businessHours={businessHours}
          lunchStartTime={tenant.lunchStartTime}
          lunchEndTime={tenant.lunchEndTime}
          slotInterval={tenant.slotInterval}
          maxCapacity={tenant.maxCapacity}
        />
      </div>

      {/* ── 基本情報カード ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <MapPin size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">基本情報</p>
              <p className="text-xs text-[var(--brand-dark)]/70">電話番号・住所を設定します。通知メールや予約完了画面に反映されます</p>
            </div>
          </div>
        </div>
        <ClinicInfoForm
          tenantSlug={slug}
          phone={tenant.phone}
          address={tenant.address}
        />
      </div>

      {/* ── LINE 連携設定カード ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <MessageCircle size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">LINE 連携設定</p>
              <p className="text-xs text-[var(--brand-dark)]/70">予約通知・リマインダーをLINEで送信するための設定</p>
            </div>
          </div>
        </div>
        <LineSettingsForm
          tenantSlug={slug}
          tenantId={tenant.id}
          lineChannelSecret={tenant.lineChannelSecret}
          lineChannelAccessToken={tenant.lineChannelAccessToken}
          lineFriendUrl={tenant.lineFriendUrl}
        />
      </div>

      {/* ── 宣伝用リンクカード ── */}
      {(() => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const reservationUrl = `${appUrl}/${slug}/reserve`;
        return (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
                  <QrCode size={15} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--brand-darker)]">宣伝用リンク</p>
                  <p className="text-xs text-[var(--brand-dark)]/70">患者向け予約フォームのURLとQRコードを院内掲示やSNSにご活用ください</p>
                </div>
              </div>
            </div>
            <ReservationLinkCard reservationUrl={reservationUrl} />
          </div>
        );
      })()}

      {/* ── 通知設定カード ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <Bell size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">通知設定</p>
              <p className="text-xs text-[var(--brand-dark)]/70">LINE・メールによる患者への通知手段を選択します</p>
            </div>
          </div>
        </div>
        <NotificationSettingsForm
          tenantSlug={slug}
          lineEnabled={tenant.lineEnabled}
          emailEnabled={tenant.emailEnabled}
        />
      </div>

      {/* ── アカウント情報カード ── */}
      {loginId && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
                <UserCog size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--brand-darker)]">アカウント情報</p>
                <p className="text-xs text-[var(--brand-dark)]/70">ログインID・メール・パスワードを変更できます</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5">
            <UserCredentialsForm
              currentLoginId={loginId}
              currentEmail={user?.email ?? ""}
            />
          </div>
        </div>
      )}

      {/* ── インフォパネル ── */}
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] p-5">
        <div className="flex items-start gap-3">
          <Info size={16} className="mt-0.5 shrink-0 text-[var(--brand-medium)]" />
          <div className="space-y-2 text-sm text-[var(--brand-dark)]">
            <p className="font-semibold">設定の反映について</p>
            <ul className="space-y-1 text-xs text-[var(--brand-dark)]/80 list-disc list-inside">
              <li>
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} />
                  <strong>営業時間</strong>: 各曜日の開始・終了時間に合わせてカレンダーの表示範囲が変わります
                </span>
              </li>
              <li>
                <span className="inline-flex items-center gap-1">
                  <Coffee size={11} />
                  <strong>昼休み</strong>: 対象時間帯がカレンダー上でグレー表示されます
                </span>
              </li>
              <li>休診に設定した曜日は「定休日」としてグレーで表示されます</li>
              <li>ログインIDの変更は次回ログイン時から有効になります</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
}
