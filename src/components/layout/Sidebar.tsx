"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Dumbbell,
  Syringe,
  BarChart2,
  Settings,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "./LogoutButton";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  /** フィーチャーキー: このキーが false の場合は非表示 */
  featureKey?: "training";
};

const NAV_ITEMS: NavItem[] = [
  { label: "ダッシュボード",         href: "dashboard",    icon: LayoutDashboard },
  { label: "予約一覧",               href: "appointments", icon: CalendarDays },
  { label: "患者管理",               href: "patients",     icon: Users },
  { label: "予約分析",               href: "analytics",    icon: BarChart2 },
  { label: "施術メニュー管理",       href: "services",     icon: Syringe },
  {
    label:      "トレーニングメニュー管理",
    href:       "trainings",
    icon:       Dumbbell,
    featureKey: "training",
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: "設定", href: "settings", icon: Settings },
];

type Props = {
  tenantSlug:      string;
  tenantName:      string;
  /** ログイン中のユーザーのログインID */
  loginId?:        string;
  /** training_record フィーチャートグルの値 */
  trainingEnabled: boolean;
  /** モバイルでサイドバーが開いているか */
  isOpen?:         boolean;
  /** モバイルで閉じるときのコールバック */
  onClose?:        () => void;
};

export function Sidebar({ tenantSlug, tenantName, loginId, trainingEnabled, isOpen = false, onClose }: Props) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === `/${tenantSlug}/${href}` ||
    pathname.startsWith(`/${tenantSlug}/${href}/`);

  const renderNavItem = (item: NavItem) => {
    // フィーチャートグルで無効な項目は非表示
    if (item.featureKey === "training" && !trainingEnabled) {
      return null;
    }

    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <li key={item.href}>
        <Link
          href={`/${tenantSlug}/${item.href}`}
          onClick={onClose}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
            active
              ? "bg-[var(--brand-bg)] text-[var(--brand-dark)]"
              : "text-gray-500 hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
          )}
        >
          {/* アクティブインジケーター */}
          <span
            className={cn(
              "absolute left-0 h-8 w-0.5 rounded-r-full bg-[var(--brand)] transition-all duration-150",
              active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
            )}
          />
          <Icon
            size={18}
            className={cn(
              "shrink-0 transition-colors",
              active
                ? "text-[var(--brand-dark)]"
                : "text-gray-400 group-hover:text-[var(--brand-medium)]"
            )}
          />
          <span className="truncate">{item.label}</span>
          {active && (
            <ChevronRight
              size={14}
              className="ml-auto text-[var(--brand-medium)]"
            />
          )}
        </Link>
      </li>
    );
  };

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-gray-100 bg-white transition-transform duration-200",
        // モバイル: fixed overlay、デスクトップ: 通常レイアウト
        "fixed inset-y-0 left-0 z-30 md:relative md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* ── ヘッダー: テナント名 ── */}
      <div className="flex items-center gap-3 border-b border-[var(--brand-light)] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-4 py-5">
        {/* ロゴアイコン (仮) */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <span className="text-lg font-bold text-white">
            {tenantName.charAt(0)}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white/70">
            SyncotBase
          </p>
          <p className="truncate text-sm font-semibold text-white">
            {tenantName}
          </p>
        </div>
      </div>

      {/* ── メインナビ ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="relative space-y-0.5">
          {NAV_ITEMS.map(renderNavItem)}
        </ul>
      </nav>

      {/* ── ボトムナビ ── */}
      <div className="border-t border-gray-100 px-3 py-3">
        <ul className="relative space-y-0.5">
          {BOTTOM_ITEMS.map(renderNavItem)}
        </ul>

        {/* ログイン中のユーザー情報 + ログアウト */}
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--brand)]/10 to-transparent px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)] text-sm font-semibold text-[var(--brand-dark)]">
            {(loginId ?? "管").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-700">
              {loginId ?? "管理者"}
            </p>
            <p className="truncate text-[10px] text-gray-400">ログイン中</p>
          </div>
          <div className="shrink-0">
            <LogoutButton />
          </div>
        </div>
      </div>
    </aside>
  );
}
