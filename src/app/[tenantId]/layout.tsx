/**
 * [tenantId] ダッシュボード共通レイアウト
 *
 * CLAUDE.md 規約:
 *   - tenantId パスパラメータ = テナントの subdomain フィールド
 *   - Prisma クエリには必ず tenant_id を含めること
 *   - テナントが存在しない場合は notFound() を返す
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

type Props = {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>; // Next.js 15+ は params が Promise
};

export default async function DashboardLayout({ children, params }: Props) {
  const { tenantId: slug } = await params;

  // テナントをサブドメイン（URL スラッグ）で検索
  const tenant = await prisma.tenant.findUnique({
    where: { subdomain: slug },
    select: {
      id:   true,
      name: true,
    },
  });

  if (!tenant) notFound();

  // フィーチャートグル: training_record の値を取得
  const trainingFeature = await prisma.tenantSetting.findUnique({
    where: {
      tenantId_featureKey: {
        tenantId:   tenant.id,
        featureKey: "training_record",
      },
    },
    select: { featureValue: true },
  });
  const trainingEnabled = trainingFeature?.featureValue === "true";

  // 承認待ち件数（ヘッダーバッジ用）
  const pendingCount = await prisma.appointment.count({
    where: {
      tenantId: tenant.id, // CLAUDE.md 絶対ルール: tenant_id フィルタ必須
      status: "pending",
    },
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9FAFB]">
      {/* サイドバー */}
      <Sidebar
        tenantSlug={slug}
        tenantName={tenant.name}
        trainingEnabled={trainingEnabled}
      />

      {/* メインエリア */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header tenantName={tenant.name} pendingCount={pendingCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
