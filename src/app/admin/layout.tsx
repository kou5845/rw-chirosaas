/**
 * システム管理者専用レイアウト
 *
 * CLAUDE.md 規約:
 *   - proxy.ts で isSuperAdmin チェック済み
 *   - このレイアウトは /admin 配下のみ使用する
 */

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts でのチェックに加えてサーバーサイドでも二重確認
  const session = await auth();
  if (!session?.user?.isSuperAdmin) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-[#F9FAFB]">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
