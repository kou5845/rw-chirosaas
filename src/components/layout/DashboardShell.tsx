"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

type Props = {
  tenantSlug:      string;
  tenantName:      string;
  loginId?:        string;
  trainingEnabled: boolean;
  pendingCount:    number;
  children:        React.ReactNode;
};

export function DashboardShell({
  tenantSlug,
  tenantName,
  loginId,
  trainingEnabled,
  pendingCount,
  children,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9FAFB]">
      {/* モバイル用オーバーレイ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* サイドバー */}
      <Sidebar
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        loginId={loginId}
        trainingEnabled={trainingEnabled}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* メインエリア */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          tenantName={tenantName}
          pendingCount={pendingCount}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
