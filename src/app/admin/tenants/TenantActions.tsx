"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, PowerOff, Power, Loader2 } from "lucide-react";
import { toggleTenantStatusAction } from "./actions";

type Props = {
  tenant: {
    id:       string;
    isActive: boolean;
    name:     string;
  };
};

export function TenantActions({ tenant }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending,   startTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  function handleToggle() {
    if (tenant.isActive) {
      setConfirmOpen(true);
    } else {
      execToggle(true);
    }
  }

  function execToggle(setActive: boolean) {
    setToggleError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await toggleTenantStatusAction(tenant.id, setActive);
      if (!result.success) {
        setToggleError(result.error ?? "エラーが発生しました。");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {toggleError && <span className="text-xs text-red-500">{toggleError}</span>}

        <Link
          href={`/admin/tenants/${tenant.id}`}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <Pencil size={12} />
          編集
        </Link>

        <button
          onClick={handleToggle}
          disabled={isPending}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            tenant.isActive
              ? "border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100"
              : "border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
          }`}
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : tenant.isActive ? (
            <PowerOff size={12} />
          ) : (
            <Power size={12} />
          )}
          {tenant.isActive ? "無効化" : "有効化"}
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                <PowerOff size={18} className="text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">医院を無効化しますか？</p>
                <p className="mt-1 text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{tenant.name}</span>
                  のスタッフは即時ログインできなくなります。
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 h-10 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => execToggle(false)}
                className="flex-1 h-10 rounded-xl bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
              >
                無効化する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
