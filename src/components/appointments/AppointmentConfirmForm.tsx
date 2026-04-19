"use client";

/**
 * 予約承認 / お断りフォーム（Client Component）
 *
 * - 承認: confirmAppointment Server Action → エメラルドボタン
 * - お断り: rejectAppointment Server Action → 赤outline ボタン + window.confirm
 */

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { confirmAppointment } from "@/app/[tenantId]/appointments/actions";
import { rejectAppointment } from "@/app/[tenantId]/appointments/actions";

// ── 承認ボタン ────────────────────────────────────────────────────────

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
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

// ── お断りボタン ──────────────────────────────────────────────────────

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-[13px] font-semibold transition-all",
        pending
          ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
          : "border-red-200 bg-red-50 text-red-600 hover:border-red-300 hover:bg-red-100 active:scale-[0.98]"
      )}
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
          処理中...
        </>
      ) : (
        <>
          <X size={14} strokeWidth={2.5} />
          お断りする
        </>
      )}
    </button>
  );
}

// ── フォーム本体 ──────────────────────────────────────────────────────

type Props = {
  appointmentId: string;
  tenantId:      string;
  tenantSlug:    string;
};

export function AppointmentConfirmForm({ appointmentId, tenantId, tenantSlug }: Props) {
  const [confirmState, confirmAction] = useActionState(confirmAppointment, null);
  const [rejectState,  rejectAction]  = useActionState(rejectAppointment,  null);
  const rejectFormRef = useRef<HTMLFormElement>(null);

  function handleRejectSubmit(e: React.FormEvent) {
    const ok = window.confirm("この予約をお断りしますか？\n患者へお断りの通知が送信されます。");
    if (!ok) e.preventDefault();
  }

  const hidden = (
    <>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="tenantId"      value={tenantId} />
      <input type="hidden" name="tenantSlug"    value={tenantSlug} />
    </>
  );

  return (
    <div className="space-y-2">
      {/* 承認フォーム */}
      <form action={confirmAction}>
        {hidden}
        {confirmState?.error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={14} className="shrink-0" />
            {confirmState.error}
          </div>
        )}
        <ConfirmButton />
      </form>

      {/* お断りフォーム */}
      <form ref={rejectFormRef} action={rejectAction} onSubmit={handleRejectSubmit}>
        {hidden}
        {rejectState?.error && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={14} className="shrink-0" />
            {rejectState.error}
          </div>
        )}
        <RejectButton />
      </form>
    </div>
  );
}
