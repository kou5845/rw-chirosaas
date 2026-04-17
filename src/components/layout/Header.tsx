"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";

/** パスセグメントから日本語のページタイトルを返す */
function resolvePageTitle(pathname: string): { label: string; sub?: string } {
  const segment = pathname.split("/").filter(Boolean)[1] ?? "";
  const map: Record<string, { label: string; sub?: string }> = {
    dashboard:    { label: "ダッシュボード" },
    appointments: { label: "予約一覧",       sub: "予約の確認・承認・管理" },
    patients:     { label: "患者管理",       sub: "患者情報の登録・編集" },
    karte:        { label: "カルテ",         sub: "施術記録の入力・参照" },
    training:     { label: "トレーニングメニュー管理", sub: "種目マスタ・実施記録" },
    settings:     { label: "設定",           sub: "テナント設定・フィーチャートグル" },
  };
  return map[segment] ?? { label: segment };
}

type Props = {
  tenantName: string;
  /** 承認待ち件数（バッジ表示用） */
  pendingCount?: number;
};

export function Header({ tenantName, pendingCount = 0 }: Props) {
  const pathname = usePathname();
  const { label, sub } = resolvePageTitle(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6">
      {/* ── 左: パンくず + タイトル ── */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="font-medium text-gray-600">{tenantName}</span>
        <ChevronRight size={14} />
        <span className="font-semibold text-gray-800">{label}</span>
        {sub && (
          <>
            <ChevronRight size={14} />
            <span className="hidden text-gray-400 sm:inline">{sub}</span>
          </>
        )}
      </div>

      {/* ── 右: アクション ── */}
      <div className="flex items-center gap-2">
        {/* 通知ベル */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
          aria-label="通知"
        >
          <Bell size={18} />
          {pendingCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand)] text-[9px] font-bold text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
