/**
 * 院の基本設定ページ — Vertical Tabs 2カラム構成
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - tenantId はセッション由来の値のみ使用
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  Clock, CalendarClock, Link2, LayoutGrid, QrCode, UserCog, Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { BusinessHoursForm, type BusinessHourData } from "./BusinessHoursForm";
import { ReservationSlotsForm } from "./ReservationSlotsForm";
import { UserCredentialsForm } from "./UserCredentialsForm";
import { LineSettingsForm } from "./LineSettingsForm";
import { NotificationSettingsForm } from "./NotificationSettingsForm";
import { ClinicInfoForm } from "./ClinicInfoForm";
import { ReservationLinkCard } from "./ReservationLinkCard";
import { TrainingMetricsForm } from "./TrainingMetricsForm";
import { parseMetricsConfig } from "@/lib/training-metrics";
import { StaffManagementForm } from "./StaffManagementForm";
import { EmailCustomMessageForm } from "./EmailCustomMessageForm";
import { SettingsTabsClient, type TabId } from "./SettingsTabsClient";
import type { ReactNode } from "react";

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
      slotInterval:           true,
      maxCapacity:            true,
      lineChannelSecret:      true,
      lineChannelAccessToken: true,
      lineFriendUrl:          true,
      lineEnabled:            true,
      emailEnabled:           true,
      phone:                  true,
      address:                true,
      trainingMetricsConfig:  true,
      plan:                   true,
      emailCustomMessage:     true,
      emailConfirmMsg:        true,
      emailChangeMsg:         true,
      emailReminderMsg:       true,
      lineConfirmMsg:         true,
      lineChangeMsg:          true,
      lineReminderMsg:        true,
      emailReceiveMsg:        true,
      lineReceiveMsg:         true,
      emailRejectMsg:         true,
      lineRejectMsg:          true,
    },
  });
  if (!tenant) notFound();

  // ── 独立クエリを並列実行 ──
  const loginId = session?.user?.loginId ?? "";
  const [karteFeature, trainingFeature, rawHours, user] = await Promise.all([
    prisma.tenantSetting.findUnique({
      where:  { tenantId_featureKey: { tenantId: tenant.id, featureKey: "karte_mode" } },
      select: { featureValue: true },
    }),
    prisma.tenantSetting.findUnique({
      where:  { tenantId_featureKey: { tenantId: tenant.id, featureKey: "training_record" } },
      select: { featureValue: true },
    }),
    prisma.businessHour.findMany({
      where:   { tenantId: tenant.id },
      select:  { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, hasLunchBreak: true, lunchStart: true, lunchEnd: true },
      orderBy: { dayOfWeek: "asc" },
    }),
    loginId
      ? prisma.user.findUnique({ where: { loginId }, select: { email: true } })
      : Promise.resolve(null),
  ]);
  const isProfessional  = karteFeature?.featureValue === "professional";
  const trainingEnabled = trainingFeature?.featureValue === "true";

  const staffs = isProfessional
    ? await prisma.staff.findMany({
        where:   { tenantId: tenant.id, isActive: true },
        orderBy: { name: "asc" },
        select:  { id: true, name: true, role: true },
      })
    : [];
  const metricsConfig    = parseMetricsConfig(tenant.trainingMetricsConfig);
  const businessHours: BusinessHourData[] = rawHours;

  // 予約URL
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const reservationUrl = `${appUrl}/${slug}/reserve`;

  // ── タブ定義 ──
  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: "basic",       label: "基本情報",   icon: <Clock size={15} /> },
    { id: "reservation", label: "予約設定",   icon: <CalendarClock size={15} /> },
    { id: "external",    label: "外部連携",   icon: <Link2 size={15} /> },
    { id: "display",     label: "表示カスタム", icon: <LayoutGrid size={15} /> },
    // isProfessional が有効な場合のみ追加されるため下で条件判定
    ...(isProfessional ? [{ id: "staff" as TabId, label: "スタッフ管理", icon: <Users size={15} /> }] : []),
    { id: "patients",    label: "集患ツール",  icon: <QrCode size={15} /> },
    { id: "account",     label: "アカウント",  icon: <UserCog size={15} /> },
  ];

  // ── タブコンテンツ ──
  const panels: Record<TabId, ReactNode> = {
    // ── 基本情報タブ ──
    basic: (
      <div className="space-y-8">
        <section>
          <SectionHeader
            title="営業時間・昼休み"
            description="週間カレンダーの表示範囲に反映されます"
          />
          <div className="mt-4">
            <BusinessHoursForm
              key={JSON.stringify(businessHours)}
              tenantSlug={slug}
              businessHours={businessHours}
              slotInterval={tenant.slotInterval}
              maxCapacity={tenant.maxCapacity}
            />
          </div>
        </section>

        <div className="border-t border-gray-100" />

        <section>
          <SectionHeader
            title="電話番号・住所"
            description="メール・LINE通知の本文と、公開予約フォームの完了画面に表示されます"
          />
          <div className="mt-4">
            <ClinicInfoForm
              tenantSlug={slug}
              phone={tenant.phone}
              address={tenant.address}
            />
          </div>
        </section>
      </div>
    ),

    // ── 予約設定タブ ──
    reservation: (
      <div className="space-y-2">
        <SectionHeader
          title="予約スロット設定"
          description="スロット間隔・同時予約上限・インターバルを設定します"
        />
        <div className="mt-4">
          <ReservationSlotsForm
            tenantSlug={slug}
            slotInterval={tenant.slotInterval}
            maxCapacity={tenant.maxCapacity}
            businessHours={businessHours}
          />
        </div>
      </div>
    ),

    // ── 外部連携タブ ──
    external: (
      <div className="space-y-8">
        <section>
          <SectionHeader
            title="LINE 連携設定"
            description="予約通知・リマインダーをLINEで送信するための設定"
          />
          <div className="mt-4">
            <LineSettingsForm
              tenantSlug={slug}
              tenantId={tenant.id}
              lineChannelSecret={tenant.lineChannelSecret}
              lineChannelAccessToken={tenant.lineChannelAccessToken}
              lineFriendUrl={tenant.lineFriendUrl}
            />
          </div>
        </section>

        <div className="border-t border-gray-100" />

        <section>
          <SectionHeader
            title="通知設定"
            description="LINE・メールによる患者への通知手段を選択します"
          />
          <div className="mt-4">
            <NotificationSettingsForm
              tenantSlug={slug}
              lineEnabled={tenant.lineEnabled}
              emailEnabled={tenant.emailEnabled}
            />
          </div>
        </section>

        <div className="border-t border-gray-100" />

        <section>
          <SectionHeader
            title="通知カスタムメッセージ"
            description="予約確定・変更・リマインドのメール/LINEに添付する独自メッセージです（プロプラン限定）"
          />
          <div className="mt-4">
            <EmailCustomMessageForm
              tenantSlug={slug}
              tenantName={tenant.name}
              isPro={tenant.plan === "pro"}
              emailConfirmMsg={tenant.emailConfirmMsg}
              emailChangeMsg={tenant.emailChangeMsg}
              emailReminderMsg={tenant.emailReminderMsg}
              emailReceiveMsg={tenant.emailReceiveMsg}
              lineReceiveMsg={tenant.lineReceiveMsg}
              lineConfirmMsg={tenant.lineConfirmMsg}
              lineChangeMsg={tenant.lineChangeMsg}
              lineReminderMsg={tenant.lineReminderMsg}
              emailRejectMsg={tenant.emailRejectMsg}
              lineRejectMsg={tenant.lineRejectMsg}
            />
          </div>
        </section>
      </div>
    ),

    // ── スタッフ管理タブ ──
    staff: isProfessional ? (
      <div className="space-y-2">
        <SectionHeader
          title="スタッフ管理"
          description="予約メニューで担当枠として指定できるスタッフの一覧を管理します"
        />
        <div className="mt-4">
          <StaffManagementForm tenantId={tenant.id} staffs={staffs} />
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users size={40} className="mb-3 text-gray-200" />
        <p className="text-sm font-medium text-gray-400">スタッフ管理は現在無効です</p>
      </div>
    ),

    // ── 表示カスタムタブ ──
    display: trainingEnabled ? (
      <div className="space-y-2">
        <SectionHeader
          title="体組成指標の表示設定"
          description="トレーニングカルテとグラフに表示する項目を ON/OFF できます"
        />
        <div className="mt-4">
          <TrainingMetricsForm
            initial={metricsConfig}
          />
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <LayoutGrid size={40} className="mb-3 text-gray-200" />
        <p className="text-sm font-medium text-gray-400">
          表示カスタム設定は現在このテナントでは無効です
        </p>
        <p className="mt-1 text-xs text-gray-300">
          トレーニング記録機能が有効なテナントのみ設定できます
        </p>
      </div>
    ),

    // ── 集患ツールタブ ──
    patients: (
      <div className="space-y-2">
        <SectionHeader
          title="集患ツール"
          description="患者向け予約フォームのURLとQRコードを院内掲示やSNSにご活用ください"
        />
        <ReservationLinkCard reservationUrl={reservationUrl} />
      </div>
    ),

    // ── アカウントタブ ──
    account: loginId ? (
      <div className="space-y-2">
        <SectionHeader
          title="アカウント情報"
          description="ログインID・メール・パスワードを変更できます"
        />
        <div className="mt-4">
          <UserCredentialsForm
            currentLoginId={loginId}
            currentEmail={user?.email ?? ""}
          />
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <UserCog size={40} className="mb-3 text-gray-200" />
        <p className="text-sm font-medium text-gray-400">アカウント情報を取得できませんでした</p>
      </div>
    ),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── ページヘッダー ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">設定</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          院の営業時間・予約設定・アカウント情報を管理します
        </p>
      </div>

      {/* ── 2カラム Vertical Tabs ── */}
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-gray-100" />}>
        <SettingsTabsClient tabs={tabs} panels={panels} />
      </Suspense>

    </div>
  );
}

// ── セクションヘッダー ────────────────────────────────────────────────
function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="mt-0.5 text-xs text-gray-400">{description}</p>
    </div>
  );
}
