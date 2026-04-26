"use client";

/**
 * 患者詳細ページ — 暗証番号表示 Client Component
 *
 * bcrypt 化以降、DB に平文PINは保存されない。
 * - ハッシュ済み（$2b...）または平文4桁の場合: ●●●● でマスク表示
 * - 再発行ボタン: 新しいPINを生成して一度だけ平文で表示（30秒後に自動非表示）
 * - 未設定の場合: 発行ボタンのみ表示
 */

import { useState, useEffect, useTransition } from "react";
import { RefreshCw, Copy, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { regeneratePin } from "./patient-actions";

type Props = {
  patientId:   string;
  tenantId:    string;
  tenantSlug:  string;
  /** DB上の accessPin 値（bcryptハッシュ or null） */
  accessPin:   string | null;
};

export function PinDisplay({ patientId, tenantId, tenantSlug, accessPin }: Props) {
  const [revealedPin, setRevealedPin]   = useState<string | null>(null);
  const [showPin,     setShowPin]       = useState(false);
  const [copied,      setCopied]        = useState(false);
  const [error,       setError]         = useState<string | null>(null);
  const [isPending,   startTransition]  = useTransition();

  // 再発行後に 30 秒で自動マスク
  useEffect(() => {
    if (!revealedPin) return;
    const t = setTimeout(() => {
      setRevealedPin(null);
      setShowPin(false);
    }, 30_000);
    return () => clearTimeout(t);
  }, [revealedPin]);

  const hasPin = !!accessPin; // 設定済み（ハッシュ化済みも含む）

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
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
                    aria-label={showPin ? "非表示" : "表示"}
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
          {revealedPin && showPin && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              aria-label="コピー"
            >
              {copied
                ? <><Check size={11} className="text-emerald-500" />コピー済</>
                : <><Copy size={11} />コピー</>
              }
            </button>
          )}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isPending}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={hasPin ? "PIN再発行" : "PIN発行"}
          >
            {isPending
              ? <Loader2 size={11} className="animate-spin" />
              : <RefreshCw size={11} />
            }
            {hasPin ? "再発行" : "発行"}
          </button>
        </div>
      </div>

      {error && (
        <p className="px-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
