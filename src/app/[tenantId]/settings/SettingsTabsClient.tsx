"use client";

/**
 * 設定ページ — 縦タブ（Vertical Tabs）クライアントラッパー
 *
 * - URL クエリ ?tab=xxx と選択タブを双方向同期
 * - router.replace + { scroll: false } でスクロール位置を維持
 * - useSearchParams で初期タブをURL由来で決定
 */

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type TabId =
  | "basic"
  | "reservation"
  | "external"
  | "display"
  | "staff"
  | "patients"
  | "account";

const TAB_IDS: TabId[] = ["basic", "reservation", "external", "display", "staff", "patients", "account"];
const DEFAULT_TAB: TabId = "basic";

type TabItem = {
  id:    TabId;
  label: string;
  icon:  React.ReactNode;
};

type Props = {
  tabs:   TabItem[];
  panels: Record<TabId, React.ReactNode>;
};

export function SettingsTabsClient({ tabs, panels }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // URL由来の初期タブ（不正値はデフォルトにフォールバック）
  const rawTab    = searchParams.get("tab") ?? DEFAULT_TAB;
  const activeTab: TabId = TAB_IDS.includes(rawTab as TabId)
    ? (rawTab as TabId)
    : DEFAULT_TAB;

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-col gap-4 md:flex-row md:gap-6">
      {/* ── タブナビ（モバイル: 横スクロール / デスクトップ: 縦カラム）── */}
      <TabsList className="w-full flex-row overflow-x-auto gap-0.5 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm md:w-44 md:flex-col md:shrink-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="
              flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5
              text-sm font-medium text-gray-500 transition-colors
              hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]
              data-[state=active]:bg-[var(--brand-bg)]
              data-[state=active]:text-[var(--brand-darker)]
              data-[state=active]:font-semibold
              md:w-full
            "
          >
            <span className="shrink-0">{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {/* ── 右カラム: コンテンツ ── */}
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="px-6 py-6">
              {panels[tab.id]}
            </div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
