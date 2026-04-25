"use client";

/**
 * 古いセッション Cookie のクリアとログインフォーム表示を担当するクライアントコンポーネント。
 *
 * Server Component から Cookie を削除できないため、
 * useEffect で clearStaleSession Server Action を呼び出す。
 * 削除後はログインフォームが有効になる。
 */

import { useEffect, useState } from "react";
import { MypageLoginForm } from "./MypageLoginForm";
import { clearStaleSession } from "./login-action";

type Props = {
  tenantSlug: string;
  clinicName: string;
};

export function MypageStaleSessionClearer({ tenantSlug, clinicName }: Props) {
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    clearStaleSession(tenantSlug).then(() => setCleared(true));
  }, [tenantSlug]);

  if (!cleared) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F9FAFB]">
        <p className="text-sm text-gray-400">セッションを初期化中...</p>
      </div>
    );
  }

  return <MypageLoginForm tenantSlug={tenantSlug} clinicName={clinicName} />;
}
