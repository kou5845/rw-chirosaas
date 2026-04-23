"use client";

import { useActionState, useState } from "react";
import { Sparkles, Save, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateEmailCustomMessage,
  type EmailCustomMessageState,
} from "./actions";

type Props = {
  tenantSlug:     string;
  tenantName:     string;
  isPro:          boolean;
  initialMessage: string | null;
};

const MAX_LEN = 500;

// ─── メールプレビュー（受付メールの簡略再現）────────────────────────────
const BRAND  = "#2E9BB8";
const ACCENT = "#1D7A94";
const BG     = "#F0FAFB";

function EmailPreview({ tenantName, customMessage }: { tenantName: string; customMessage: string }) {
  const hasMsg = customMessage.trim().length > 0;

  return (
    <div
      style={{
        backgroundColor: "#f5f5f5",
        borderRadius: 12,
        padding: "20px 12px",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        fontSize: 12,
      }}
    >
      {/* カード */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          maxWidth: 460,
          margin: "0 auto",
        }}
      >
        {/* ヘッダー */}
        <div style={{ backgroundColor: BRAND, padding: "18px 24px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#fff", fontSize: 15, fontWeight: "bold" }}>
            {tenantName || "〇〇整骨院"}
          </p>
          <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.8)", fontSize: 10 }}>
            オンライン予約システム
          </p>
        </div>

        {/* ステータスバナー */}
        <div style={{ backgroundColor: BG, padding: "14px 24px", textAlign: "center", borderBottom: `1px solid #B2E4EF` }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: "bold", color: ACCENT }}>
            ご予約を受け付けました
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6B7280" }}>
            スタッフ確認後、改めて確定のご連絡をお送りします。
          </p>
        </div>

        {/* 宛名 */}
        <div style={{ padding: "16px 24px 0" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>
            <span style={{ fontWeight: "bold" }}>上田 剛輔</span> 様
          </p>
        </div>

        {/* 予約内容 */}
        <div style={{ padding: "12px 24px" }}>
          <div style={{ backgroundColor: BG, borderRadius: 10, border: `1px solid #B2E4EF`, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid #D1EEF5` }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: "bold", color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
                予約内容
              </p>
            </div>
            {[
              { label: "📅 日付",  value: "4月25日（土）" },
              { label: "⏰ 時間",  value: "14:00 〜 15:00" },
              { label: "💆 メニュー", value: "テスト施術2（60分）" },
              { label: "💴 料金",  value: "¥1,000" },
            ].map((row, i, arr) => (
              <div key={row.label} style={{ padding: "8px 14px", borderBottom: i < arr.length - 1 ? `1px solid #D1EEF5` : "none", display: "flex", gap: 8 }}>
                <span style={{ width: "40%", fontSize: 10, color: "#6B7280" }}>{row.label}</span>
                <span style={{ fontSize: 11, fontWeight: "bold", color: "#111827" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 標準メッセージ */}
        <div style={{ padding: "0 24px 14px" }}>
          <div style={{ backgroundColor: BG, border: `1px solid #B2E4EF`, borderRadius: 8, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 11, color: "#374151", lineHeight: 1.7 }}>
              スタッフが内容を確認の上、改めて確定通知をお送りします。<br />
              しばらくお待ちください。
            </p>
          </div>
        </div>

        {/* ─── カスタムメッセージ（リアルタイム反映） ─── */}
        {hasMsg ? (
          <div style={{ padding: "0 24px 14px" }}>
            <div
              style={{
                backgroundColor: "#FFFDF5",
                border: "1px solid #FDE68A",
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: "bold", color: "#92400E", textTransform: "uppercase", letterSpacing: 1 }}>
                ✉ {tenantName || "〇〇整骨院"} からのご案内
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "#374151", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {customMessage}
              </p>
            </div>
          </div>
        ) : (
          <div style={{ padding: "0 24px 14px" }}>
            <div
              style={{
                border: "1.5px dashed #FDE68A",
                borderRadius: 8,
                padding: "12px 14px",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontSize: 10, color: "#D1B06B" }}>
                ← ここにカスタムメッセージが表示されます
              </p>
            </div>
          </div>
        )}

        {/* フッター */}
        <div style={{ backgroundColor: "#F9FAFB", borderTop: "1px solid #E5E7EB", padding: "12px 24px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>
            このメールは {tenantName || "〇〇整骨院"} の予約システムから自動送信されています。
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── メインフォーム ────────────────────────────────────────────────────
export function EmailCustomMessageForm({ tenantSlug, tenantName, isPro, initialMessage }: Props) {
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
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      {/* 2カラムレイアウト: 左=入力、右=プレビュー */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── 左列: 入力欄 ── */}
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="emailCustomMessage" className="mb-1.5 block text-sm font-medium text-gray-700">
              カスタムメッセージ
              <span className="ml-2 text-xs font-normal text-gray-400">（任意 · 最大{MAX_LEN}文字）</span>
            </label>
            <textarea
              id="emailCustomMessage"
              name="emailCustomMessage"
              rows={8}
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
                  改行はメール内の改行として反映されます
                </p>
              )}
              <p className={cn("text-xs tabular-nums", remaining < 50 ? "text-amber-500" : "text-gray-300")}>
                残 {remaining}文字
              </p>
            </div>
          </div>

          {state?.errors?.general && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-xs text-red-600">
              {state.errors.general}
            </p>
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
              "flex w-fit items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all",
              "bg-[var(--brand)] hover:bg-[var(--brand-dark)] active:scale-[0.98]",
              isPending && "cursor-not-allowed opacity-60"
            )}
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            保存する
          </button>
        </div>

        {/* ── 右列: リアルタイムプレビュー ── */}
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Mail size={13} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-500">
              プレビュー（実際のメールの見え方）
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <EmailPreview tenantName={tenantName} customMessage={value} />
          </div>
          <p className="mt-1.5 text-[10px] text-gray-300">
            ※ダミーデータで表示しています。実際の患者名・予約内容が入ります。
          </p>
        </div>
      </div>
    </form>
  );
}
