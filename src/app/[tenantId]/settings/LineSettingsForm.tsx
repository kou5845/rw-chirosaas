"use client";

/**
 * LINE 連携設定フォーム
 *
 * - Webhook URL をワンクリックでコピー（window.location.origin にフォールバック）
 * - Channel Secret は伏せ字 + 表示トグル
 * - Channel Access Token はテキストエリア
 */

import { useActionState, useEffect, useState } from "react";
import {
  Save, Loader2, AlertCircle, CheckCircle2,
  Copy, Check, Eye, EyeOff, Unlink,
} from "lucide-react";
import { updateLineSettings, disconnectLineSettings, type LineSettingsState, type DisconnectLineState } from "./actions";

type Props = {
  tenantSlug:             string;
  tenantId:               string;
  lineChannelSecret:      string | null;
  lineChannelAccessToken: string | null;
  lineFriendUrl:          string | null;
};

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-400 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";

export function LineSettingsForm({ tenantSlug, tenantId, lineChannelSecret, lineChannelAccessToken, lineFriendUrl }: Props) {
  const [state,           action,           isPending]           = useActionState<LineSettingsState,    FormData>(updateLineSettings,    null);
  const [disconnectState, disconnectAction, isDisconnectPending] = useActionState<DisconnectLineState, FormData>(disconnectLineSettings, null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const webhookUrl = mounted ? `${window.location.origin}/api/webhook/line/${tenantId}` : "";

  const [copied,          setCopied]          = useState(false);
  const [showSecret,      setShowSecret]      = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const isConnected = !!(lineChannelSecret && lineChannelAccessToken);

  async function copyWebhook() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
    <form action={action} className="px-6 py-5 space-y-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      {/* 全体エラー */}
      {state?.errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{state.errors.general}</span>
        </div>
      )}

      {/* 保存成功 */}
      {state?.success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>LINE連携設定を保存しました</span>
        </div>
      )}
      {disconnectState?.success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>LINE連携を解除しました</span>
        </div>
      )}
      {disconnectState?.errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{disconnectState.errors.general}</span>
        </div>
      )}

      {/* ── Webhook URL ── */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Webhook URL
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-xs text-gray-600">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={copyWebhook}
            className="shrink-0 flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
            aria-label="Webhook URLをコピー"
          >
            {copied
              ? <><Check size={13} className="text-emerald-500" />コピー済</>
              : <><Copy size={13} />コピー</>
            }
          </button>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">
          LINE Developers コンソールの「Webhook URL」に貼り付けてください。
        </p>
      </div>

      {/* ── Channel Secret ── */}
      <div>
        <label
          htmlFor={`line-secret-${tenantId}`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          Channel Secret
        </label>
        <div className="relative">
          <input
            id={`line-secret-${tenantId}`}
            name="lineChannelSecret"
            type={showSecret ? "text" : "password"}
            defaultValue={lineChannelSecret ?? ""}
            placeholder="未設定"
            autoComplete="off"
            className={`${inputCls} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={showSecret ? "隠す" : "表示する"}
          >
            {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* ── Channel Access Token ── */}
      <div>
        <label
          htmlFor={`line-token-${tenantId}`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          Channel Access Token
        </label>
        <textarea
          id={`line-token-${tenantId}`}
          name="lineChannelAccessToken"
          rows={3}
          defaultValue={lineChannelAccessToken ?? ""}
          placeholder="未設定"
          className={`${inputCls} resize-none font-mono text-xs leading-relaxed`}
        />
      </div>

      {/* ── 友だち追加URL ── */}
      <div>
        <label
          htmlFor={`line-friend-url-${tenantId}`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          友だち追加URL
        </label>
        <input
          id={`line-friend-url-${tenantId}`}
          name="lineFriendUrl"
          type="url"
          defaultValue={lineFriendUrl ?? ""}
          placeholder="https://line.me/R/ti/p/@xxxxx"
          className={inputCls}
        />
        <p className="mt-1.5 text-xs text-gray-400">
          LINE公式アカウントの「友だち追加URL」を入力してください。予約完了画面に「公式LINEを友だち追加」ボタンが表示されます。
        </p>
      </div>

      {/* ── 保存ボタン / 解除ボタン ── */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        {isConnected ? (
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            <Unlink size={15} />
            LINE連携を解除する
          </button>
        ) : (
          <div />
        )}
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <><Loader2 size={15} className="animate-spin" />保存中…</>
          ) : (
            <><Save size={15} />保存する</>
          )}
        </button>
      </div>

    </form>

    {/* ── 解除確認ダイアログ（メインformの外に配置） ── */}
    {confirmDisconnect && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
              <Unlink size={18} className="text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">LINE連携を解除しますか？</p>
              <p className="mt-1 text-sm text-gray-500">
                Channel Secret・Access Token・友だち追加URLをすべて削除します。解除後はLINE通知が送信されなくなります。
              </p>
            </div>
          </div>
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              className="flex-1 h-10 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <form action={disconnectAction} className="flex-1">
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <button
                type="submit"
                disabled={isDisconnectPending}
                onClick={() => setConfirmDisconnect(false)}
                className="w-full h-10 rounded-xl bg-red-500 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDisconnectPending ? (
                  <Loader2 size={14} className="animate-spin mx-auto" />
                ) : (
                  "解除する"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
