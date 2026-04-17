"use client";

/**
 * BeforeAfterCompareTab — 写真 Before/After 比較ビューアー
 *
 * - 過去カルテの写真から任意の2枚を選択して左右/上下比較
 * - シンクロズーム・パン（ポインターイベント + ホイール）
 * - 全画面表示モード（患者向けタブレット提示対応）
 * - デザイン: 暗背景で写真を引き立て、操作系は白で清潔感を維持
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Columns2,
  Rows2,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ImageOff,
  Camera,
  X,
} from "lucide-react";
import { formatDateJa } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export type PhotoForCompare = {
  mediaId:   string;
  karteDate: Date;
};

type Props = {
  photos:   PhotoForCompare[];
  tenantId: string;
};

type Transform = { scale: number; x: number; y: number };
type Layout    = "side" | "stack";
type Slot      = "before" | "after";

const INITIAL_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

function mediaUrl(mediaId: string, tenantId: string) {
  return `/api/media/${mediaId}?tenantId=${tenantId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotBadge — Before / After ラベル
// ─────────────────────────────────────────────────────────────────────────────

function SlotBadge({ slot }: { slot: Slot }) {
  return slot === "before" ? (
    <span className="inline-flex items-center rounded-full bg-sky-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow backdrop-blur-sm">
      Before
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-400/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-900 shadow backdrop-blur-sm">
      After
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PhotoThumbnail — ギャラリーのサムネイル1枚
// ─────────────────────────────────────────────────────────────────────────────

function PhotoThumbnail({
  photo,
  tenantId,
  isSelectedAs,
  onSelect,
}: {
  photo:        PhotoForCompare;
  tenantId:     string;
  isSelectedAs: Slot | null;
  onSelect:     (slot: Slot) => void;
}) {
  const url = mediaUrl(photo.mediaId, tenantId);

  return (
    <div
      className={cn(
        "group relative shrink-0 w-[120px] overflow-hidden rounded-xl border-2 transition-all duration-200",
        isSelectedAs === "before" && "border-sky-400 ring-2 ring-sky-300/60",
        isSelectedAs === "after"  && "border-amber-400 ring-2 ring-amber-300/60",
        !isSelectedAs             && "border-transparent hover:border-gray-300",
      )}
    >
      {/* サムネイル画像 */}
      <div className="h-[90px] bg-zinc-800">
        <img
          src={url}
          alt={formatDateJa(photo.karteDate)}
          loading="lazy"
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      {/* 選択中バッジ */}
      {isSelectedAs && (
        <div className="absolute left-1.5 top-1.5">
          <SlotBadge slot={isSelectedAs} />
        </div>
      )}

      {/* 日付ラベル */}
      <div className="bg-white px-2 py-1.5 text-center">
        <p className="text-[10px] leading-tight text-gray-500">
          {formatDateJa(photo.karteDate)}
        </p>
      </div>

      {/* ホバー時の選択ボタン */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onSelect("before")}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold shadow transition-colors",
            isSelectedAs === "before"
              ? "bg-sky-400 text-white"
              : "bg-white/90 text-zinc-800 hover:bg-sky-400 hover:text-white",
          )}
        >
          Before
        </button>
        <button
          type="button"
          onClick={() => onSelect("after")}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold shadow transition-colors",
            isSelectedAs === "after"
              ? "bg-amber-400 text-zinc-900"
              : "bg-white/90 text-zinc-800 hover:bg-amber-400 hover:text-zinc-900",
          )}
        >
          After
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompareViewer — 比較ビューアー本体（ズーム・パン対応）
// ─────────────────────────────────────────────────────────────────────────────

function CompareViewer({
  before,
  after,
  tenantId,
  layout,
  transform,
  onTransformChange,
  containerRef,
  isFullscreen,
  onZoomIn,
  onZoomOut,
  onReset,
  onLayoutToggle,
  onFullscreenToggle,
}: {
  before:             PhotoForCompare;
  after:              PhotoForCompare;
  tenantId:           string;
  layout:             Layout;
  transform:          Transform;
  onTransformChange:  (t: Transform) => void;
  containerRef:       (el: HTMLDivElement | null) => void;
  isFullscreen:       boolean;
  onZoomIn:           () => void;
  onZoomOut:          () => void;
  onReset:            () => void;
  onLayoutToggle:     () => void;
  onFullscreenToggle: () => void;
}) {
  const isDragging = useRef(false);
  const lastPos    = useRef({ x: 0, y: 0 });

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current = true;
    lastPos.current    = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    onTransformChange({ ...transform, x: transform.x + dx, y: transform.y + dy });
  }

  function handlePointerUp() {
    isDragging.current = false;
  }

  const imgStyle: React.CSSProperties = {
    transform:       `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    transformOrigin: "center center",
    willChange:      "transform",
    userSelect:      "none",
    WebkitUserSelect: "none",
    cursor:          isDragging.current ? "grabbing" : "grab",
    touchAction:     "none",
  };

  const beforeUrl = mediaUrl(before.mediaId, tenantId);
  const afterUrl  = mediaUrl(after.mediaId,  tenantId);

  return (
    <div className={cn(
      "relative flex flex-col overflow-hidden rounded-2xl bg-zinc-950",
      isFullscreen ? "h-full" : "h-[480px]",
    )}>

      {/* ── 画像エリア ── */}
      <div
        ref={containerRef}
        className={cn(
          "relative flex min-h-0 flex-1 select-none overflow-hidden",
          layout === "side"  ? "flex-row" : "flex-col",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: isDragging.current ? "grabbing" : "grab", touchAction: "none" }}
      >
        {/* Before パネル */}
        <div className={cn(
          "relative overflow-hidden",
          layout === "side" ? "flex-1 border-r border-zinc-700" : "flex-1 border-b border-zinc-700",
        )}>
          <img
            src={beforeUrl}
            alt="Before"
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
            style={imgStyle}
          />
          {/* Before ラベル */}
          <div className="pointer-events-none absolute bottom-3 left-3">
            <div className="flex flex-col gap-1">
              <SlotBadge slot="before" />
              <span className="rounded-lg bg-black/50 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-sm">
                {formatDateJa(before.karteDate)}
              </span>
            </div>
          </div>
        </div>

        {/* After パネル */}
        <div className={cn(
          "relative overflow-hidden",
          layout === "side" ? "flex-1" : "flex-1",
        )}>
          <img
            src={afterUrl}
            alt="After"
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
            style={imgStyle}
          />
          {/* After ラベル */}
          <div className="pointer-events-none absolute bottom-3 right-3 text-right">
            <div className="flex flex-col items-end gap-1">
              <SlotBadge slot="after" />
              <span className="rounded-lg bg-black/50 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-sm">
                {formatDateJa(after.karteDate)}
              </span>
            </div>
          </div>
        </div>

        {/* 中央区切りライン インジケーター */}
        {layout === "side" && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
            <div className="h-8 w-8 rounded-full border border-white/20 bg-black/40 backdrop-blur-sm" />
          </div>
        )}
      </div>

      {/* ── コントロールバー ── */}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-900/80 px-4 py-2.5 backdrop-blur-sm">
        {/* ズームコントロール */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="ズームアウト"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ZoomOut size={15} />
          </button>
          <span className="min-w-[44px] text-center text-xs font-mono text-white/50">
            {Math.round(transform.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="ズームイン"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={onReset}
            aria-label="リセット"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* 操作ヒント */}
        <p className="hidden text-[11px] text-white/30 sm:block">
          ドラッグで移動　ホイールでズーム
        </p>

        {/* レイアウト / 全画面 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onLayoutToggle}
            aria-label={layout === "side" ? "上下表示に切り替え" : "左右表示に切り替え"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            {layout === "side" ? <Rows2 size={15} /> : <Columns2 size={15} />}
          </button>
          <button
            type="button"
            onClick={onFullscreenToggle}
            aria-label={isFullscreen ? "全画面終了" : "全画面表示"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BeforeAfterCompareTab — メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function BeforeAfterCompareTab({ photos, tenantId }: Props) {
  // 日付の古い順に並べ替え（Before = 最古, After = 最新 がデフォルト）
  const sorted = [...photos].sort(
    (a, b) => new Date(a.karteDate).getTime() - new Date(b.karteDate).getTime(),
  );

  const [beforeId, setBeforeId] = useState<string | null>(
    sorted.length >= 2 ? sorted[0].mediaId : null,
  );
  const [afterId, setAfterId] = useState<string | null>(
    sorted.length >= 1 ? sorted[sorted.length - 1].mediaId : null,
  );
  const [layout,      setLayout]      = useState<Layout>("side");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transform,   setTransform]   = useState<Transform>(INITIAL_TRANSFORM);

  const beforePhoto = sorted.find((p) => p.mediaId === beforeId) ?? null;
  const afterPhoto  = sorted.find((p) => p.mediaId === afterId)  ?? null;

  // ── ホイールズーム（passive: false 必須）──
  const [viewerEl, setViewerEl] = useState<HTMLDivElement | null>(null);
  const viewerRef = useCallback((el: HTMLDivElement | null) => setViewerEl(el), []);

  useEffect(() => {
    if (!viewerEl) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = viewerEl!.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const mx   = e.clientX - cx;
      const my   = e.clientY - cy;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;

      setTransform((prev) => {
        const newScale = Math.max(0.25, Math.min(10, prev.scale * factor));
        const ratio    = newScale / prev.scale;
        return {
          scale: newScale,
          x:     mx * (1 - ratio) + prev.x * ratio,
          y:     my * (1 - ratio) + prev.y * ratio,
        };
      });
    }

    viewerEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewerEl.removeEventListener("wheel", handleWheel);
  }, [viewerEl]);

  // ESC で全画面解除
  useEffect(() => {
    if (!isFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  function handleSelect(mediaId: string, slot: Slot) {
    if (slot === "before") setBeforeId(mediaId);
    else                   setAfterId(mediaId);
  }

  function handleZoomIn()  { setTransform((p) => ({ ...p, scale: Math.min(10, p.scale * 1.2) })); }
  function handleZoomOut() { setTransform((p) => ({ ...p, scale: Math.max(0.25, p.scale / 1.2) })); }
  function handleReset()   { setTransform(INITIAL_TRANSFORM); }

  // ── 写真が不足している場合の空状態 ────────────────────────────
  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
          <Camera size={28} className="text-gray-300" />
        </div>
        <p className="mt-4 text-sm font-medium text-gray-400">
          比較できる写真がありません
        </p>
        <p className="mt-1 text-xs text-gray-300">
          カルテに写真を添付すると、ここで Before/After 比較ができます
        </p>
      </div>
    );
  }

  if (sorted.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
          <ImageOff size={28} className="text-gray-300" />
        </div>
        <p className="mt-4 text-sm font-medium text-gray-400">
          比較には2枚以上の写真が必要です
        </p>
        <p className="mt-1 text-xs text-gray-300">
          現在1枚の写真があります。もう1枚以上カルテに添付してください
        </p>
      </div>
    );
  }

  const viewerProps = {
    before:             beforePhoto!,
    after:              afterPhoto!,
    tenantId,
    layout,
    transform,
    onTransformChange:  setTransform,
    containerRef:       viewerRef,
    isFullscreen:       false,
    onZoomIn:           handleZoomIn,
    onZoomOut:          handleZoomOut,
    onReset:            handleReset,
    onLayoutToggle:     () => { setLayout((l) => (l === "side" ? "stack" : "side")); handleReset(); },
    onFullscreenToggle: () => setIsFullscreen(true),
  };

  return (
    <div className="space-y-5">

      {/* ── ギャラリー（写真選択）── */}
      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          写真を選んで Before / After に設定
        </p>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {sorted.map((photo) => {
            const isAs: Slot | null =
              photo.mediaId === beforeId ? "before"
              : photo.mediaId === afterId ? "after"
              : null;
            return (
              <PhotoThumbnail
                key={photo.mediaId}
                photo={photo}
                tenantId={tenantId}
                isSelectedAs={isAs}
                onSelect={(slot) => handleSelect(photo.mediaId, slot)}
              />
            );
          })}
        </div>
      </div>

      {/* ── 比較ビューアー（両スロットが埋まっている場合のみ）── */}
      {beforePhoto && afterPhoto ? (
        <CompareViewer {...viewerProps} />
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 py-12 text-center">
          <div>
            <p className="text-sm font-medium text-gray-400">
              Before と After の写真を選択してください
            </p>
            <p className="mt-1 text-xs text-gray-300">
              上のギャラリーから各スロットに1枚ずつ設定してください
            </p>
          </div>
        </div>
      )}

      {/* ── 全画面オーバーレイ ── */}
      {isFullscreen && beforePhoto && afterPhoto && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-zinc-950">
          {/* 全画面ヘッダー */}
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-5 py-3 backdrop-blur-sm">
            <p className="text-sm font-semibold text-white/80 tracking-wide">
              Before / After 比較
            </p>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              aria-label="全画面終了"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* 全画面ビューアー */}
          <div className="min-h-0 flex-1 p-4">
            <CompareViewer
              {...viewerProps}
              containerRef={viewerRef}
              isFullscreen={true}
              onFullscreenToggle={() => setIsFullscreen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
