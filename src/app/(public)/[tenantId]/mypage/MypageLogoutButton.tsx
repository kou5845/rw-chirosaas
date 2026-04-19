"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutMypage } from "./login-action";

export function MypageLogoutButton({ tenantSlug }: { tenantSlug: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => logoutMypage(tenantSlug))}
      disabled={isPending}
      aria-label="ログアウト"
      className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
    >
      <LogOut size={16} />
    </button>
  );
}
