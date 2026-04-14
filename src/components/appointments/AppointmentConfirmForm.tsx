"use client";

/**
 * 予約承認フォーム（Client Component）
 * useActionState で Server Action のエラー状態を表示し、
 * useFormStatus でボタンの pending 状態を制御する。
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { confirmAppointment } from "@/app/[tenantId]/appointments/actions";

// ── 送信ボタン（useFormStatus で pending 状態を取得）─────────────
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        // 最低 44px は globals.css で保証済み。ここでは h-12 (48px) に設定し
        // 忙しい先生が片手で確実に押せるよう大きめのターゲットを確保する。
        "flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-[15px] font-bold shadow-sm transition-all",
        pending
          ? "cursor-not-allowed bg-gray-100 text-gray-400"
          : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98] active:bg-emerald-700"
      )}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
          処理中...
        </>
      ) : (
        <>
          <Check size={18} strokeWidth={2.5} />
          承認する
        </>
      )}
    </button>
  );
}

// ── フォーム本体 ─────────────────────────────────────────────────
type Props = {
  appointmentId: string;
  tenantId:      string;
  tenantSlug:    string;
};

export function AppointmentConfirmForm({ appointmentId, tenantId, tenantSlug }: Props) {
  const [state, formAction] = useActionState(confirmAppointment, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="tenantId"      value={tenantId} />
      <input type="hidden" name="tenantSlug"    value={tenantSlug} />

      {state?.error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
