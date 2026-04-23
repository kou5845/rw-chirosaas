"use client";

import { useActionState, useState } from "react";
import { Sparkles, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateEmailCustomMessage,
  type EmailCustomMessageState,
} from "./actions";

type Props = {
  tenantSlug:          string;
  isPro:               boolean;
  initialMessage:      string | null;
};

const MAX_LEN = 500;

export function EmailCustomMessageForm({ tenantSlug, isPro, initialMessage }: Props) {
  const [state, action, isPending] = useActionState<EmailCustomMessageState, FormData>(
    updateEmailCustomMessage,
    null
  );
  const [value, setValue] = useState(initialMessage ?? "");
  const remaining = MAX_LEN - value.length;

  if (!isPro) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
        <Sparkles size={28} className="text-gray-300" />
        <p className="text-sm font-semibold text-gray-400">プロプラン限定機能</p>
        <p className="max-w-xs text-xs text-gray-300">
          プロプランにアップグレードすると、予約確定・受付・リマインダーメールに
          オリジナルメッセージを添付できます。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      <div>
        <label htmlFor="emailCustomMessage" className="mb-1.5 block text-sm font-medium text-gray-700">
          カスタムメッセージ
          <span className="ml-2 text-xs font-normal text-gray-400">（任意 · 最大{MAX_LEN}文字）</span>
        </label>
        <textarea
          id="emailCustomMessage"
          name="emailCustomMessage"
          rows={5}
          maxLength={MAX_LEN}
          placeholder={"例:\nご来院の際は保険証をお持ちください。\nご不明な点はお気軽にお電話ください。"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
          className={cn(
            "w-full resize-none rounded-xl border bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-300 outline-none transition",
            "focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20",
            state?.errors?.message ? "border-red-300" : "border-gray-200",
            isPending && "opacity-60"
          )}
        />
        <div className="mt-1 flex items-center justify-between">
          {state?.errors?.message ? (
            <p className="text-xs text-red-500">{state.errors.message}</p>
          ) : (
            <p className="text-xs text-gray-400">
              改行はメール内の<code className="rounded bg-gray-100 px-1">&lt;br&gt;</code>に変換されます
            </p>
          )}
          <p className={cn("text-xs tabular-nums", remaining < 50 ? "text-amber-500" : "text-gray-300")}>
            {remaining}
          </p>
        </div>
      </div>

      {state?.errors?.general && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-xs text-red-600">{state.errors.general}</p>
      )}

      {state?.success && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
          保存しました。次回のメール送信から反映されます。
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all",
          "bg-[var(--brand)] hover:bg-[var(--brand-dark)] active:scale-[0.98]",
          isPending && "cursor-not-allowed opacity-60"
        )}
      >
        {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        保存する
      </button>
    </form>
  );
}
