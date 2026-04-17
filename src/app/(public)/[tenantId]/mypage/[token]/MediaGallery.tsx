"use client";

/**
 * 患者マイページ — メディアギャラリー
 *
 * - 全カルテ（施術・トレーニング両方）のメディアを表示
 * - 施術・トレーニング両方のメディアがある場合はセクション分割して表示
 * - 各サムネイルに撮影日バッジを重ねて時系列を把握しやすくする
 * - ライトボックスで拡大表示
 */

import { useState } from "react";
import { X, Play, ImageIcon, Dumbbell, Sparkles } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export type MediaItem = {
  id:        string;
  mediaType: string;
  karteType: string;   // "MEDICAL" | "TRAINING"
  karteDate: string;   // ISO 8601
};

type Props = {
  media: MediaItem[];
  token: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/** "MM/DD" 形式の短い日付ラベル */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// サムネイルグリッド（内部コンポーネント）
// ─────────────────────────────────────────────────────────────────────────────

function ThumbnailGrid({
  items,
  token,
  onOpen,
}: {
  items:  MediaItem[];
  token:  string;
  onOpen: (url: string, type: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((m) => {
        const url = `/api/media/${m.id}?token=${token}`;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(url, m.mediaType)}
            className="group relative aspect-square overflow-hidden rounded-2xl border border-gray-100 bg-gray-50"
          >
            {m.mediaType === "video" ? (
              <>
                <video
                  src={`${url}#t=0.1`}
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
                    <Play size={14} className="text-white" fill="white" />
                  </div>
                </div>
              </>
            ) : (
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                loading="lazy"
              />
            )}

            {/* 日付バッジ */}
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[9px] font-semibold leading-tight text-white/90 backdrop-blur-sm">
              {shortDate(m.karteDate)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MediaGallery — メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function MediaGallery({ media, token }: Props) {
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <ImageIcon size={24} className="text-gray-200" />
        <p className="mt-2 text-xs text-gray-300">写真・動画がまだありません</p>
      </div>
    );
  }

  const medicalItems   = media.filter((m) => m.karteType === "MEDICAL");
  const trainingItems  = media.filter((m) => m.karteType === "TRAINING");
  const hasBothTypes   = medicalItems.length > 0 && trainingItems.length > 0;

  return (
    <>
      {hasBothTypes ? (
        /* ── 施術・トレーニング 両方のメディアがある場合: セクション分割 ── */
        <div className="space-y-5">
          {/* 施術セクション */}
          <div>
            <div className="mb-2.5 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[var(--brand-dark)]" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                施術の記録
              </p>
              <span className="rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-semibold text-gray-400">
                {medicalItems.length}
              </span>
            </div>
            <ThumbnailGrid items={medicalItems} token={token} onOpen={(url, type) => setLightbox({ url, type })} />
          </div>

          <div className="h-px bg-gray-100" />

          {/* トレーニングセクション */}
          <div>
            <div className="mb-2.5 flex items-center gap-1.5">
              <Dumbbell size={12} className="text-amber-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                トレーニングの記録
              </p>
              <span className="rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-semibold text-gray-400">
                {trainingItems.length}
              </span>
            </div>
            <ThumbnailGrid items={trainingItems} token={token} onOpen={(url, type) => setLightbox({ url, type })} />
          </div>
        </div>
      ) : (
        /* ── 片方のみ: グループヘッダーなしで一覧表示 ── */
        <ThumbnailGrid items={media} token={token} onOpen={(url, type) => setLightbox({ url, type })} />
      )}

      {/* 件数フッター */}
      <p className="mt-3 text-right text-[10px] text-gray-300">
        計 {media.length} 件
      </p>

      {/* ライトボックス */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div className="relative z-10 flex max-h-full max-w-full items-center justify-center">
            {lightbox.type === "video" ? (
              <video
                src={lightbox.url}
                controls
                autoPlay
                className="max-h-[85dvh] max-w-full rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={lightbox.url}
                alt=""
                className="max-h-[85dvh] max-w-full rounded-2xl object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="閉じる"
              className="absolute -top-12 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
