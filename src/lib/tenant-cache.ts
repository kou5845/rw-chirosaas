/**
 * テナント情報・機能フラグのサーバーキャッシュ
 *
 * Next.js の unstable_cache を使って、テナント情報とフィーチャートグルを
 * サーバー側でキャッシュする。
 *
 * キャッシュ戦略:
 *   - テナント情報（name, plan 等）: 5分間キャッシュ
 *   - 機能フラグ（trainingEnabled 等）: 5分間キャッシュ
 *   - 設定変更後は手動で revalidateTag("tenant") を呼ぶ
 *
 * CLAUDE.md 規約: 全クエリに tenant_id を含めること（このファイルでも遵守）
 */

import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// ─── テナント基本情報（レイアウト・各ページで使用）──────────────────────────
export const getTenantBySlug = unstable_cache(
  async (slug: string) => {
    return prisma.tenant.findUnique({
      where: { subdomain: slug },
      select: {
        id:                     true,
        name:                   true,
        isActive:               true,
        plan:                   true,
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
      },
    });
  },
  // キャッシュキー: slug が変わると別エントリになる
  ["tenant-by-slug"],
  {
    revalidate: 300, // 5分
    tags:       ["tenant"],
  }
);

// ─── 機能フラグ（karte_mode, training_record）────────────────────────────────
export const getTenantFeatures = unstable_cache(
  async (tenantId: string) => {
    const [karteFeature, trainingFeature] = await Promise.all([
      prisma.tenantSetting.findUnique({
        where:  { tenantId_featureKey: { tenantId, featureKey: "karte_mode" } },
        select: { featureValue: true },
      }),
      prisma.tenantSetting.findUnique({
        where:  { tenantId_featureKey: { tenantId, featureKey: "training_record" } },
        select: { featureValue: true },
      }),
    ]);
    return {
      isProfessional:  karteFeature?.featureValue === "professional",
      trainingEnabled: trainingFeature?.featureValue === "true",
    };
  },
  ["tenant-features"],
  {
    revalidate: 300, // 5分
    tags:       ["tenant", "tenant-features"],
  }
);

// ─── 営業時間（設定ページ・予約ページで使用）─────────────────────────────────
export const getTenantBusinessHours = unstable_cache(
  async (tenantId: string) => {
    return prisma.businessHour.findMany({
      where:   { tenantId },
      select:  { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, hasLunchBreak: true, lunchStart: true, lunchEnd: true },
      orderBy: { dayOfWeek: "asc" },
    });
  },
  ["tenant-business-hours"],
  {
    revalidate: 300,
    tags:       ["tenant", "tenant-business-hours"],
  }
);

// ─── スタッフ一覧（複数ページで使用）────────────────────────────────────────
export const getTenantStaff = unstable_cache(
  async (tenantId: string) => {
    const staffs = await prisma.staff.findMany({
      where:   { tenantId, isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return staffs.map(s => ({ id: s.id, displayName: s.name }));
  },
  ["tenant-staff"],
  {
    revalidate: 300,
    tags:       ["tenant", "tenant-staff"],
  }
);

// ─── サービスマスタ（予約・患者詳細ページで使用）─────────────────────────────
export const getTenantServices = unstable_cache(
  async (tenantId: string) => {
    return prisma.service.findMany({
      where:   { tenantId, isActive: true },
      select:  { id: true, name: true, duration: true, intervalMin: true, price: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },
  ["tenant-services"],
  {
    revalidate: 300,
    tags:       ["tenant", "tenant-services"],
  }
);
