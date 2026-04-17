"use client";

/**
 * 患者マイページ共有セクション
 *
 * - accessToken が null の場合: 「マイページURLを発行」ボタンを表示
 * - accessToken がある場合: QRコード + URLコピー + URL失効ボタンを表示
 *
 * CLAUDE.md 規約:
 *   - Server Action 経由でトークン生成/失効を行い、直接 DB 操作は行わない
 *   - accessToken はページ表示後もクライアントに保持されるが、128bit UUIDのため推測不可能
 */

import { useState, useTransition } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Link2, Copy, RefreshCw, Trash2, Loader2, CheckCheck,
  ExternalLink, QrCode, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateMypageToken, revokeMypageToken } from "./patient-actions";

type Props = {
  patientId:    string;
  patientName:  string;
  tenantId:     string;
  tenantSlug:   string;
  accessToken:  string | null;
};

export function MypageShareSection({
  patientId,
  patientName,
  tenantId,
  tenantSlug,
  accessToken: initialToken,
}: Props) {
  const [token,       setToken]       = useState<string | null>(initialToken);
  const [showQR,      setShowQR]      = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [isPending,   startTransition] = useTransition();
  const [error,       setError]       = useState<string | null>(null);

  // ブラウザのオリジンを使ってURLを構築（SSR時はundefined対応）
  const origin    = typeof window !== "undefined" ? window.location.origin : "";
  const mypageUrl = token ? `${origin}/${tenantSlug}/mypage/${token}` : null;

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateMypageToken(patientId, tenantId, tenantSlug);
      if (result.success) {
        setToken(result.token);
        toast.success("マイページURLを発行しました");
      } else {
        setError(result.error);
        toast.error("発行に失敗しました", { description: result.error });
      }
    });
  }

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateMypageToken(patientId, tenantId, tenantSlug);
      if (result.success) {
        setToken(result.token);
        setCopied(false);
        toast.success("URLを再発行しました（旧URLは無効になりました）");
      } else {
        setError(result.error);
        toast.error("再発行に失敗しました", { description: result.error });
      }
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeMypageToken(patientId, tenantId, tenantSlug);
      if (result.success) {
        setToken(null);
        setShowQR(false);
        toast.success("マイページURLを失効させました");
      } else {
        setError(result.error ?? "失効に失敗しました");
        toast.error("失効に失敗しました");
      }
    });
  }

  async function handleCopy() {
    if (!mypageUrl) return;
    try {
      await navigator.clipboard.writeText(mypageUrl);
      setCopied(true);
      toast.success("URLをコピーしました");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  }

  return (
    <div className="border-t border-gray-100 p-5">
      {/* セクションタイトル */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--brand-bg)]">
          <Link2 size={12} className="text-[var(--brand-dark)]" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          患者マイページ
        </p>
        {token && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
            <CheckCheck size={10} />
            通知に自動添付
          </span>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={11} className="shrink-0" />
          {error}
        </div>
      )}

      {!token ? (
        /* ── トークン未発行 ── */
        <div className="mt-3">
          <p className="mb-2.5 text-xs text-gray-400">
            発行したURLを患者に共有すると、ログイン不要でマイページを閲覧できます。
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] text-xs font-semibold text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending
              ? <><Loader2 size={13} className="animate-spin" />発行中…</>
              : <><Link2 size={13} />URLを発行する</>
            }
          </button>
        </div>
      ) : (
        /* ── トークン発行済み ── */
        <div className="mt-3 space-y-2.5">
          {/* URLコピーバー */}
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="flex-1 truncate text-xs text-gray-500 font-mono">
              {mypageUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="URLをコピー"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                copied
                  ? "bg-emerald-50 text-emerald-600"
                  : "text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              )}
            >
              {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
            </button>
          </div>

          {/* ボタン群 */}
          <div className="flex gap-2">
            {/* QRコード表示 */}
            <button
              type="button"
              onClick={() => setShowQR((v) => !v)}
              className={cn(
                "flex flex-1 h-8 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors",
                showQR
                  ? "border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand-dark)]"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              <QrCode size={12} />QRコード
            </button>

            {/* マイページを開く */}
            <a
              href={mypageUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 h-8 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              <ExternalLink size={12} />プレビュー
            </a>
          </div>

          {/* QRコード */}
          {showQR && mypageUrl && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-medium text-gray-400">
                {patientName} 様 マイページ
              </p>
              <QRCodeCanvas
                value={mypageUrl}
                size={160}
                bgColor="#ffffff"
                fgColor="#111827"
                level="M"
                className="rounded-xl"
              />
              <p className="text-[10px] text-gray-300">スマートフォンで読み取ってください</p>
            </div>
          )}

          {/* 危険ゾーン: 再発行・失効 */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={isPending}
              aria-label="URLを再発行（旧URLを無効化）"
              className="flex flex-1 h-7 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-400 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              再発行
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={isPending}
              aria-label="URLを失効させる"
              className="flex flex-1 h-7 items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              失効
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
