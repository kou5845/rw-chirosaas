/**
 * 患者マイページ専用レイアウト
 *
 * - 認証不要（proxy.ts で mypage/* を公開パス許可済み）
 * - Sidebar / Header を持たないクリーン・モバイル向けレイアウト
 * - (public) route group 内に配置し、[tenantId]/layout.tsx の影響を受けない
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "マイページ",
};

export default function MypageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#F9FAFB]">
      {children}
    </div>
  );
}
