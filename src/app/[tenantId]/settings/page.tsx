/**
 * 院の基本設定ページ
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { notFound } from "next/navigation";
import { Settings, Info, Clock, Coffee } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SettingsForm, type BusinessHourData } from "./SettingsForm";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { tenantId: slug } = await params;

  // CLAUDE.md 絶対ルール: tenantId フィルタ必須
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: {
      id:             true,
      name:           true,
      lunchStartTime: true,
      lunchEndTime:   true,
      slotInterval:   true,
      maxCapacity:    true,
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* ── ページヘッダー ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">設定</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          院の営業時間・昼休みを管理します
        </p>
      </div>

      {/* ── 営業設定カード ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* カードヘッダー */}
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

        {/*
          key でリマウントすることでサーバー再描画後に defaultValue が正しく反映される
        */}
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
              <li>
                休診に設定した曜日は「定休日」としてグレーで表示されます
              </li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
}
