"use client";

/**
 * 宣伝用リンクカード
 *
 * 患者向け予約フォームの URL と QR コードを表示する。
 * - URL をクリップボードにコピー（Sonner トースト）
 * - QR コードを PNG としてダウンロード
 */

import { useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Props = {
  reservationUrl: string;
};

export function ReservationLinkCard({ reservationUrl }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);

  /** クリップボードコピー */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reservationUrl);
      toast.success("URLをコピーしました", {
        description: "チラシやSNSに貼り付けてご活用ください",
        duration: 3000,
      });
    } catch {
      toast.error("コピーに失敗しました", {
        description: "URLを手動でコピーしてください",
      });
    }
  }, [reservationUrl]);

  /** QR コードを PNG でダウンロード */
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) {
      toast.error("QRコードの取得に失敗しました");
      return;
    }

    // 余白付きの新しい canvas に描画
    const padding = 24;
    const size    = canvas.width + padding * 2;
    const out     = document.createElement("canvas");
    out.width     = size;
    out.height    = size;
    const ctx     = out.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(canvas, padding, padding);

    const link  = document.createElement("a");
    link.download = "reservation-qrcode.png";
    link.href     = out.toDataURL("image/png");
    link.click();

    toast.success("QRコードをダウンロードしました", { duration: 3000 });
  }, []);

  return (
    <div className="px-6 py-5 space-y-6">
      {/* URL セクション */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          予約フォーム URL
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={reservationUrl}
            className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 font-mono select-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-medium)]/30"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 text-sm font-semibold text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-light)] active:scale-[0.97]"
          >
            <Copy size={14} />
            コピー
          </button>
          <a
            href={reservationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="予約フォームを新しいタブで開く"
          >
            <ExternalLink size={14} />
          </a>
        </div>
        <p className="text-xs text-gray-400">
          このURLを院のSNS・チラシ・院内掲示に使用してください
        </p>
      </div>

      {/* 区切り */}
      <div className="h-px bg-gray-100" />

      {/* QR コードセクション */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          QR コード
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* QR 本体 */}
          <div
            ref={canvasRef}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <QRCodeCanvas
              value={reservationUrl}
              size={160}
              level="M"
              marginSize={1}
              style={{ display: "block" }}
            />
          </div>

          {/* 説明 + ダウンロード */}
          <div className="flex flex-col justify-center gap-3 sm:py-2">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                スマートフォンで読み取れます
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                院内のポスターやチラシに印刷しておくと、<br className="hidden sm:inline" />
                患者さまがその場でかんたんに予約できます。
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="flex w-fit items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] active:scale-[0.97]"
            >
              <Download size={14} />
              PNG をダウンロード
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
