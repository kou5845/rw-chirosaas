"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, PlusCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/layout/LogoutButton";

const NAV_ITEMS = [
  { label: "テナント一覧",   href: "/admin/tenants",     icon: Building2   },
  { label: "新規医院登録",   href: "/admin/tenants/new", icon: PlusCircle  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-white">

      {/* ロゴ */}
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
          <Activity size={16} />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">SyncotBase</p>
          <p className="text-[10px] font-medium text-[var(--brand-dark)]">システム管理</p>
        </div>
      </div>

      {/* ナビ */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/admin/tenants" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--brand-bg)] text-[var(--brand-darker)]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon
                size={16}
                className={active ? "text-[var(--brand)]" : "text-gray-400"}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* フッター */}
      <div className="border-t border-gray-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-gray-700">管理者</p>
            <p className="text-[10px] text-gray-400">super_admin</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
