"use client";

/**
 * 患者詳細ページ — 暗証番号表示 Client Component
 *
 * AES-256-GCM 暗号化済みPINはサーバーが復号して表示できる。
 * bcrypt形式（旧）は不可逆のため「再発行」で新PINに置き換える。
 *
 * UI フロー:
 *   - [表示] ボタン → revealPin() → 現在のPINを表示（30秒で自動非表示）
 *   - [再発行] ボタン → regeneratePin() → 新PINを生成・表示（30秒で自動非表示）
 *   - 表示中: [目アイコン]（表示/非表示）と [コピー] ボタン
 */

import { useState, useEffect, useTransition } from "react";
import { RefreshCw, Copy, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { regeneratePin, revealPin } from "./patient-actions";

type Props = {
  patientId:   string;
  tenantId:    string;
  tenantSlug:  string;
  /** DB上の accessPin 値（AES暗号化 or bcryptハッシュ or null） */
  accessPin:   string | null;
};

const AUTO_HIDE_MS = 30_000; // 30秒で自動非表示

export function PinDisplay({ patientId, tenantId, tenantSlug, accessPin }: Props) {
  const [revealedPin,  setRevealedPin]  = useState<string | null>(null);
  const [showPin,      setShowPin]      = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [needsReissue, setNeedsReissue] = useState(false);

  const [isRevealing,  startReveal]     = useTransition();
  const [isReissuing,  startReissue]    = useTransition();

  const hasPin      = !!accessPin;
  // AES暗号化済みか否かで「表示」ボタンを出すか決める
  const isEncrypted = !!accessPin?.startsWith("enc1:");

  // 30秒で自動非表示
  useEffect(() => {
    if (!revealedPin) return;
    const t = setTimeout(() => {
      setRevealedPin(null);
      setShowPin(false);
    }, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [revealedPin]);

  // ── 現在のPINを表示 ──
  function handleReveal() {
    setError(null);
    setNeedsReissue(false);
    startReveal(async () => {
      const result = await revealPin(patientId, tenantId);
      if (result.success) {
        setRevealedPin(result.pin);
        setShowPin(true);
      } else {
        setError(result.error);
        if (result.needsReissue) setNeedsReissue(true);
      }
    });
  }

  // ── PIN再発行 ──
  function handleRegenerate() {
    setError(null);
    setNeedsReissue(false);
    startReissue(async () => {
      const result = await regeneratePin(patientId, tenantId, tenantSlug);
      if (result.success) {
        setRevealedPin(result.pin);
        setShowPin(true);
      } else {
        setError(result.error);
      }
    });
  }

  async function handleCopy() {
    if (!revealedPin) return;
    await navigator.clipboard.writeText(revealedPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // 表示する値
  const displayPin = revealedPin
    ? (showPin ? revealedPin : "●●●●")
    : (hasPin  ? "●●●●"     : null);

  const isPending = isRevealing || isReissuing;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl bg-white border border-[var(--brand-border)] px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            PASS（暗証番号）
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            {displayPin ? (
              <>
                <p className="font-mono text-lg font-bold tracking-[0.3em] text-[var(--brand-dark)]">
                  {displayPin}
                </p>
                {revealedPin && (
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPin ? "非表示にする" : "表示する"}
                  >
                    {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm font-normal text-gray-300">未設定</p>
            )}
          </div>
          {revealedPin && (
            <p className="mt-1 text-[10px] text-amber-500">
              ※ 30秒後に自動的に非表示になります
            </p>
          )}
        </div>

        {/* アクションボタン群 */}
        <div className="flex items-center gap-1.5 ml-3 shrink-0">
          {/* コピーボタン（PIN表示中のみ）*/}
          {revealedPin && showPin && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {copied
                ? <><Check size={11} className="text-emerald-500" />コピー済</>
                : <><Copy size={11} />コピー</>
              }
            </button>
          )}

          {/* 表示ボタン（AES暗号化済み・未表示時のみ）*/}
          {isEncrypted && !revealedPin && (
            <button
              type="button"
              onClick={handleReveal}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--brand-dark)] hover:bg-[var(--brand-light)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRevealing
                ? <Loader2 size={11} className="animate-spin" />
                : <Eye size={11} />
              }
              表示
            </button>
          )}

          {/* 再発行ボタン */}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isPending}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={hasPin ? "暗証番号を再発行" : "暗証番号を発行"}
          >
            {isReissuing
              ? <Loader2 size={11} className="animate-spin" />
              : <RefreshCw size={11} />
            }
            {hasPin ? "再発行" : "発行"}
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <p className="px-1 text-xs text-red-600">
          {error}
          {needsReissue && (
            <button
              type="button"
              onClick={handleRegenerate}
              className="ml-2 font-semibold underline underline-offset-2 hover:text-red-800 transition-colors"
            >
              今すぐ再発行 →
            </button>
          )}
        </p>
      )}
    </div>
  );
}
