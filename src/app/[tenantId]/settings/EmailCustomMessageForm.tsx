"use client";

import { useActionState, useState } from "react";
import {
  Sparkles, Save, Loader2, Mail, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  updateNotificationCustomMessage,
  type NotificationCustomMessageState,
} from "./actions";

// ── 型定義 ────────────────────────────────────────────────────────────
type Platform  = "email" | "line";
type NotifType = "confirm" | "change" | "reminder" | "reject";

export type MessageSet = {
  emailConfirmMsg:  string | null;
  emailChangeMsg:   string | null;
  emailReminderMsg: string | null;
  emailRejectMsg:   string | null;
  lineConfirmMsg:   string | null;
  lineChangeMsg:    string | null;
  lineReminderMsg:  string | null;
  lineRejectMsg:    string | null;
};

type Props = MessageSet & {
  tenantSlug: string;
  tenantName: string;
  isPro:      boolean;
};

const MAX_LEN = 500;

// ── ラベル定義 ────────────────────────────────────────────────────────
const PLATFORM_LABELS: Record<Platform, string> = {
  email: "メール",
  line:  "LINE",
};
const TYPE_LABELS: Record<NotifType, string> = {
  confirm:  "予約確定",
  change:   "予約変更",
  reminder: "リマインド",
  reject:   "お断り",
};

function getFieldKey(platform: Platform, type: NotifType): keyof MessageSet {
  const map: Record<`${Platform}:${NotifType}`, keyof MessageSet> = {
    "email:confirm":  "emailConfirmMsg",
    "email:change":   "emailChangeMsg",
    "email:reminder": "emailReminderMsg",
    "email:reject":   "emailRejectMsg",
    "line:confirm":   "lineConfirmMsg",
    "line:change":    "lineChangeMsg",
    "line:reminder":  "lineReminderMsg",
    "line:reject":    "lineRejectMsg",
  };
  return map[`${platform}:${type}`];
}

// ── メールプレビュー ───────────────────────────────────────────────────

const BRAND  = "#2E9BB8";
const ACCENT = "#1D7A94";
const BG     = "#F0FAFB";

const EMAIL_PREVIEW_HEADERS: Record<NotifType, { title: string; sub: string; color: string }> = {
  confirm:  { title: "ご予約が確定しました", sub: "下記の内容でご予約を承りました。", color: "#10B981" },
  change:   { title: "ご予約日時が変更されました", sub: "日時が以下のように変更されました。", color: "#3B82F6" },
  reminder: { title: "明日のご予約リマインダー", sub: "明日のご予約をお知らせします。", color: "#F59E0B" },
  reject:   { title: "ご予約についてのお知らせ", sub: "誠に恐れ入りますが、下記予約をお断りさせていただきます。", color: "#EF4444" },
};

function EmailPreview({
  tenantName,
  notifType,
  customMessage,
}: {
  tenantName:    string;
  notifType:     NotifType;
  customMessage: string;
}) {
  const hasMsg = customMessage.trim().length > 0;
  const hdr    = EMAIL_PREVIEW_HEADERS[notifType];

  return (
    <div style={{
      backgroundColor: "#f5f5f5",
      borderRadius: 12,
      padding: "20px 12px",
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      fontSize: 12,
    }}>
      <div style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        maxWidth: 460,
        margin: "0 auto",
      }}>
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
        <div style={{
          backgroundColor: BG,
          padding: "14px 24px",
          textAlign: "center",
          borderBottom: `1px solid #B2E4EF`,
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: "bold", color: hdr.color }}>
            {hdr.title}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6B7280" }}>
            {hdr.sub}
          </p>
        </div>

        {/* 宛名 */}
        <div style={{ padding: "16px 24px 0" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>
            <span style={{ fontWeight: "bold" }}>山田 太郎</span> 様
          </p>
        </div>

        {/* 予約内容 */}
        <div style={{ padding: "12px 24px" }}>
          <div style={{
            backgroundColor: BG,
            borderRadius: 10,
            border: `1px solid #B2E4EF`,
            overflow: "hidden",
          }}>
            <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid #D1EEF5` }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: "bold", color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
                予約内容
              </p>
            </div>
            {[
              { label: "📅 日付",     value: "5月1日（木）" },
              { label: "⏰ 時間",     value: "14:00 〜 15:00" },
              { label: "💆 メニュー", value: "整体コース（60分）" },
              { label: "💴 料金",     value: "¥5,000" },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                style={{
                  padding: "8px 14px",
                  borderBottom: i < arr.length - 1 ? `1px solid #D1EEF5` : "none",
                  display: "flex",
                  gap: 8,
                }}
              >
                <span style={{ width: "40%", fontSize: 10, color: "#6B7280" }}>{row.label}</span>
                <span style={{ fontSize: 11, fontWeight: "bold", color: "#111827" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* カスタムメッセージ */}
        {hasMsg ? (
          <div style={{ padding: "0 24px 14px" }}>
            <div style={{
              backgroundColor: "#FFFDF5",
              border: "1px solid #FDE68A",
              borderRadius: 8,
              padding: "12px 14px",
            }}>
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
            <div style={{
              border: "1.5px dashed #FDE68A",
              borderRadius: 8,
              padding: "12px 14px",
              textAlign: "center",
            }}>
              <p style={{ margin: 0, fontSize: 10, color: "#D1B06B" }}>
                ← ここにカスタムメッセージが表示されます
              </p>
            </div>
          </div>
        )}

        {/* フッター */}
        <div style={{
          backgroundColor: "#F9FAFB",
          borderTop: "1px solid #E5E7EB",
          padding: "12px 24px",
          textAlign: "center",
        }}>
          <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>
            このメールは {tenantName || "〇〇整骨院"} の予約システムから自動送信されています。
          </p>
        </div>
      </div>
    </div>
  );
}

// ── LINEプレビュー ────────────────────────────────────────────────────

const LINE_BASE_MESSAGES: Record<NotifType, (name: string) => string> = {
  confirm: (name) =>
    `【ご予約確定のお知らせ】\n${name} のご予約が確定しました。\n\n📅 5月1日(木) 14:00〜15:00\n💆 整体コース（60分）\n💴 ¥5,000\n\nご来院をお待ちしております。`,
  change: (name) =>
    `【ご予約変更のお知らせ】\n${name} のご予約日時が変更されました。\n\n▼ 変更前\n📅 4月30日(水) 10:00〜11:00\n\n▼ 変更後\n📅 5月1日(木) 14:00〜15:00\n💆 整体コース（60分）`,
  reminder: (name) =>
    `【明日のご予約リマインダー】\n${name} への明日のご予約をお知らせします。\n\n📅 5月1日(木) 14:00〜15:00\n💆 整体コース（60分）\n\nお忘れなくご来院ください。`,
  reject: (name) =>
    `【ご予約についてのお知らせ】\n${name} です。\n\n📅 5月1日(木) 14:00〜15:00\n💆 整体コース（60分）\n\n誠に恐れ入りますが、ご希望の日時はお受けできませんでした。\n別の日程をご検討いただけますと幸いです。`,
};

function LinePreview({
  tenantName,
  notifType,
  customMessage,
}: {
  tenantName:    string;
  notifType:     NotifType;
  customMessage: string;
}) {
  const clinic    = tenantName || "〇〇整骨院";
  const baseText  = LINE_BASE_MESSAGES[notifType](clinic);
  const hasCustom = customMessage.trim().length > 0;
  const fullText  = hasCustom
    ? `${baseText}\n\n─────────────────\n${customMessage}`
    : baseText;

  return (
    <div style={{
      backgroundColor: "#8cabd0",
      borderRadius: 12,
      padding: "16px 12px",
      fontFamily: "'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif",
    }}>
      {/* タイムスタンプ */}
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.9)",
          backgroundColor: "rgba(0,0,0,0.18)",
          padding: "2px 10px",
          borderRadius: 10,
        }}>
          5月1日(木) 14:00
        </span>
      </div>

      {/* 吹き出し（左側：公式アカウントから） */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {/* 医院アイコン */}
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: "#00B900",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "#fff",
          fontWeight: "bold",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        }}>
          院
        </div>

        <div style={{ maxWidth: "calc(100% - 46px)" }}>
          {/* アカウント名 */}
          <p style={{
            margin: "0 0 4px",
            fontSize: 9,
            color: "rgba(255,255,255,0.95)",
            fontWeight: "600",
          }}>
            {clinic}
          </p>

          {/* メッセージ吹き出し */}
          <div style={{
            backgroundColor: "#fff",
            borderRadius: "0 14px 14px 14px",
            padding: "10px 14px",
            fontSize: 10.5,
            color: "#111",
            lineHeight: 1.75,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            display: "inline-block",
          }}>
            {fullText}
          </div>

          {/* カスタムメッセージ未入力ガイド */}
          {!hasCustom && (
            <div style={{
              marginTop: 8,
              border: "1.5px dashed rgba(255,255,255,0.6)",
              borderRadius: 10,
              padding: "8px 14px",
              textAlign: "center",
            }}>
              <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.85)" }}>
                ↑ ここにカスタムメッセージが追記されます
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── メインフォーム ────────────────────────────────────────────────────
export function EmailCustomMessageForm({
  tenantSlug,
  tenantName,
  isPro,
  emailConfirmMsg,
  emailChangeMsg,
  emailReminderMsg,
  emailRejectMsg,
  lineConfirmMsg,
  lineChangeMsg,
  lineReminderMsg,
  lineRejectMsg,
}: Props) {
  const [state, action, isPending] = useActionState<
    NotificationCustomMessageState,
    FormData
  >(updateNotificationCustomMessage, null);

  const [platform,   setPlatform]  = useState<Platform>("email");
  const [notifType,  setNotifType] = useState<NotifType>("confirm");

  // 6種類のメッセージをローカルで管理
  const [messages, setMessages] = useState<MessageSet>({
    emailConfirmMsg:  emailConfirmMsg  ?? "",
    emailChangeMsg:   emailChangeMsg   ?? "",
    emailReminderMsg: emailReminderMsg ?? "",
    emailRejectMsg:   emailRejectMsg   ?? "",
    lineConfirmMsg:   lineConfirmMsg   ?? "",
    lineChangeMsg:    lineChangeMsg    ?? "",
    lineReminderMsg:  lineReminderMsg  ?? "",
    lineRejectMsg:    lineRejectMsg    ?? "",
  });

  const fieldKey    = getFieldKey(platform, notifType);
  const currentMsg  = messages[fieldKey] ?? "";
  const remaining   = MAX_LEN - currentMsg.length;

  function handleChange(val: string) {
    setMessages((prev) => ({ ...prev, [fieldKey]: val }));
  }

  // ── プロプラン以外はロック表示 ──
  if (!isPro) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
        <Sparkles size={28} className="text-gray-300" />
        <p className="text-sm font-semibold text-gray-400">プロプラン限定機能</p>
        <p className="max-w-xs text-xs text-gray-300">
          プロプランにアップグレードすると、予約確定・変更・リマインドのメール/LINEに
          オリジナルメッセージを添付できます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── プラットフォーム × 通知種別 セレクター ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* プラットフォームタブ */}
        <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-0.5">
          {(["email", "line"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                platform === p
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              {p === "email" ? <Mail size={12} /> : <MessageCircle size={12} />}
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>

        <span className="text-gray-300">/</span>

        {/* 通知種別タブ */}
        <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-0.5">
          {(["confirm", "change", "reminder", "reject"] as NotifType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setNotifType(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                notifType === t
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── 入力 + プレビュー ── */}
      <form action={action} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="platform"   value={platform} />
        <input type="hidden" name="notifType"  value={notifType} />

        {/* ── 左列: 入力欄 ── */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              カスタムメッセージ
              <span className="ml-2 text-xs font-normal text-gray-400">
                （任意 · 最大{MAX_LEN}文字）
              </span>
            </label>
            <textarea
              name="message"
              rows={8}
              maxLength={MAX_LEN}
              placeholder={`例:\nご来院の際は保険証をお持ちください。\nご不明な点はお気軽にお電話ください。`}
              value={currentMsg}
              onChange={(e) => handleChange(e.target.value)}
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
                <p className="text-xs text-gray-400">改行はそのまま通知に反映されます</p>
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
              保存しました。次回の通知送信から反映されます。
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

        {/* ── 右列: プレビュー ── */}
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            {platform === "email" ? (
              <Mail size={13} className="text-gray-400" />
            ) : (
              <MessageCircle size={13} className="text-gray-400" />
            )}
            <p className="text-xs font-semibold text-gray-500">
              プレビュー（実際の通知の見え方）
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100">
            {platform === "email" ? (
              <EmailPreview
                tenantName={tenantName}
                notifType={notifType}
                customMessage={currentMsg}
              />
            ) : (
              <LinePreview
                tenantName={tenantName}
                notifType={notifType}
                customMessage={currentMsg}
              />
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-gray-300">
            ※ダミーデータで表示しています。実際の患者名・予約内容が入ります。
          </p>
        </div>
      </form>
    </div>
  );
}
