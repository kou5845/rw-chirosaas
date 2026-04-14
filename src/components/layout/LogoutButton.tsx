"use client";

/**
 * ログアウトボタン（クライアントコンポーネント）
 *
 * NextAuth v5 の signOut はサーバーアクションとして実行する。
 */

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      aria-label="ログアウト"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
    >
      <LogOut size={15} />
    </button>
  );
}
