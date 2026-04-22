/**
 * [tenantId] ダッシュボード共通レイアウト
 *
 * CLAUDE.md 規約:
 *   - tenantId パスパラメータ = テナントの subdomain フィールド
 *   - Prisma クエリには必ず tenant_id を含めること
 *   - テナントが存在しない場合は notFound() を返す
 */

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantBySlug, getTenantFeatures } from "@/lib/tenant-cache";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Toaster } from "sonner";

type Props = {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>; // Next.js 15+ は params が Promise
};

export default async function DashboardLayout({ children, params }: Props) {
  const { tenantId: slug } = await params;
  const session = await auth();

  // テナントをサブドメインで検索（5分間キャッシュ: 2回目以降はDBアクセスなし）
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  // テナントが無効化されている場合は即時ブロック
  // proxy.ts は JWT のみ検証しDB呼び出しが行えないため、このレイアウトで DB チェックする
  if (!tenant.isActive) {
    redirect("/login?error=disabled");
  }

  // 機能フラグ（キャッシュ）と承認待ち件数（リアルタイム）を並列取得
  const [features, pendingCount] = await Promise.all([
    // フィーチャートグル: キャッシュ済み（DB アクセスなし）
    getTenantFeatures(tenant.id),
    // 承認待ち件数: 常に最新が必要 CLAUDE.md 絶対ルール: tenant_id フィルタ必須
    prisma.appointment.count({
      where: { tenantId: tenant.id, status: "pending" },
    }),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9FAFB]">
      {/* サイドバー */}
      <Sidebar
        tenantSlug={slug}
        tenantName={tenant.name}
        loginId={session?.user?.loginId}
        trainingEnabled={features.trainingEnabled}
      />

      {/* メインエリア */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header tenantName={tenant.name} pendingCount={pendingCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
