"use client";

/**
 * カルテメディアアップロードセクション
 *
 * - ドラッグ＆ドロップ対応
 * - 画像はプレビュー、動画はインライン再生
 * - アップロードは /api/upload/karte-media Route Handler 経由
 * - 完了したファイルのパス一覧を親コンポーネントに通知する
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, X, ImageIcon, Video, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupabasePublic, KARTE_MEDIA_BUCKET } from "@/lib/supabase";

export type UploadedMedia = {
  /** アップロード前の一意ID（UI用） */
  tempId:      string;
  storagePath: string;
  mediaType:   "image" | "video";
  fileName:    string;
  fileSizeKb:  number;
  /** プレビュー用 ObjectURL（ローカル） */
  previewUrl:  string;
};

type UploadingItem = {
  tempId:     string;
  file:       File;
  progress:   "uploading" | "error";
  statusText?: string;
  error?:     string;
  previewUrl: string;
};

type Props = {
  tenantId: string;
  onChange: (media: UploadedMedia[]) => void;
};

const MAX_VIDEO_MB = 15;
const MAX_IMAGE_MB = 2;
const ACCEPT_TYPES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,image/heic,image/heif,.heic,.heif";

// ── 画像リサイズユーティリティ ──────────────────────────────────────────
async function resizeImageAsync(file: File, maxWidth: number, quality: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        // コンテキスト取得失敗時は元のファイルをフォールバックとして返す
        resolve(file);
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          // 拡張子を.jpgに置換
          const newName = file.name.replace(/\.[^/.]+$/, ".jpg");
          const resizedFile = new File([blob], newName, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(resizedFile);
        },
        "image/jpeg",
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // エラー時は元のファイルを返す
    };
    
    img.src = objectUrl;
  });
}

export function MediaUploadSection({ tenantId, onChange }: Props) {
  const [uploaded,   setUploaded]   = useState<UploadedMedia[]>([]);
  const [uploading,  setUploading]  = useState<UploadingItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 親に変更通知
  useEffect(() => { onChange(uploaded); }, [uploaded, onChange]);

  // ObjectURL のクリーンアップ
  useEffect(() => {
    return () => {
      uploaded.forEach((m) => URL.revokeObjectURL(m.previewUrl));
      uploading.forEach((u) => URL.revokeObjectURL(u.previewUrl));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const tempId = crypto.randomUUID();
    let previewUrl = URL.createObjectURL(file); // 一時的なプレビューURL
    
    // UI反映
    setUploading((prev) => [...prev, { tempId, file, progress: "uploading", previewUrl }]);

    // ── 画像リサイズ処理・HEIC変換 ──
    const isVideo = file.type.startsWith("video/");
    let targetFile = file;

    const isHeic = file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
    
    if (isHeic) {
      try {
        setUploading((prev) => prev.map((u) => u.tempId === tempId ? { ...u, statusText: "HEIC変換中..." } : u));
        const heic2any = (await import("heic2any")).default;
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.8,
        });
        const blobArray = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        const newName = file.name.replace(/\.[^/.]+$/, ".jpg");
        targetFile = new File([blobArray], newName, { type: "image/jpeg", lastModified: Date.now() });
      } catch (e) {
        console.warn("HEIC conversion failed:", e);
        setUploading((prev) => prev.map((u) => u.tempId === tempId ? { ...u, progress: "error", error: "HEIC変換に失敗しました", statusText: undefined } : u));
        return;
      }
    }
    
    if (!isVideo) {
      try {
        setUploading((prev) => prev.map((u) => u.tempId === tempId ? { ...u, statusText: "リサイズ中..." } : u));
        targetFile = await resizeImageAsync(targetFile, 2000, 0.8);
        // リサイズ後のプレビューURLに差し替え
        const newPreviewUrl = URL.createObjectURL(targetFile);
        setUploading((prev) => prev.map((u) => u.tempId === tempId ? { ...u, previewUrl: newPreviewUrl, statusText: "アップロード中..." } : u));
        URL.revokeObjectURL(previewUrl);
        previewUrl = newPreviewUrl;
      } catch (e) {
        console.warn("Resize failed:", e);
      }
    } else {
      setUploading((prev) => prev.map((u) => u.tempId === tempId ? { ...u, statusText: "アップロード中..." } : u));
    }

    // ── サイズ制限バリデーション ──
    const maxMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (targetFile.size > maxMb * 1024 * 1024) {
      setUploading((prev) =>
        prev.map((u) => u.tempId === tempId ? { ...u, progress: "error", error: `${isVideo ? "動画" : "リサイズ後画像"}サイズが${maxMb}MBを超えています` } : u)
      );
      return;
    }

    try {
      // 1. API Route に署名付きURLの作成をリクエスト
      const reqBody = {
        fileName: targetFile.name,
        fileType: targetFile.type,
        fileSize: targetFile.size,
        tenantId,
      };

      const res = await fetch("/api/upload/karte-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      const { storagePath, token } = json;

      // 2. 署名付きURLを用いて Supabase Storage に直接アップロード
      const supabase = createSupabasePublic();
      const { error: uploadError } = await supabase.storage
        .from(KARTE_MEDIA_BUCKET)
        .uploadToSignedUrl(storagePath, token, targetFile);

      if (uploadError) throw new Error("アップロードに失敗しました: " + uploadError.message);

      const media: UploadedMedia = {
        tempId,
        storagePath,
        mediaType:   isVideo ? "video" : "image",
        fileName:    targetFile.name,
        fileSizeKb:  Math.ceil(targetFile.size / 1024),
        previewUrl,
      };

      setUploading((prev) => prev.filter((u) => u.tempId !== tempId));
      setUploaded((prev) => [...prev, media]);
    } catch (e: any) {
      console.error("[uploadFile] fetch error:", e);
      setUploading((prev) =>
        prev.map((u) => u.tempId === tempId ? { ...u, progress: "error", error: e.message || "通信エラーが発生しました" } : u)
      );
    }
  }, [tenantId]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(uploadFile);
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  function removeUploaded(tempId: string) {
    setUploaded((prev) => {
      const item = prev.find((m) => m.tempId === tempId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((m) => m.tempId !== tempId);
    });
  }

  function removeUploading(tempId: string) {
    setUploading((prev) => {
      const item = prev.find((u) => u.tempId === tempId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((u) => u.tempId !== tempId);
    });
  }

  const hasItems = uploaded.length > 0 || uploading.length > 0;

  return (
    <div className="space-y-3">
      {/* ── ドロップゾーン ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 transition-all",
          isDragOver
            ? "border-[var(--brand)] bg-[var(--brand-bg)]"
            : "border-gray-200 bg-gray-50/50 hover:border-[var(--brand-border)] hover:bg-[var(--brand-bg)]/40"
        )}
      >
        <div className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl transition-colors",
          isDragOver ? "bg-[var(--brand-bg)]" : "bg-white shadow-sm"
        )}>
          <Upload size={22} className={isDragOver ? "text-[var(--brand)]" : "text-gray-400"} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            {isDragOver ? "ここにドロップしてアップロード" : "クリックまたはドラッグ＆ドロップ"}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            JPEG/PNG/HEIC（最大2MB）、MP4/MOV（最大15MB）
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_TYPES}
          multiple
          className="sr-only"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* ── プレビューグリッド ── */}
      {hasItems && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

          {/* アップロード完了済み */}
          {uploaded.map((media) => (
            <MediaPreviewCard
              key={media.tempId}
              previewUrl={media.previewUrl}
              mediaType={media.mediaType}
              fileName={media.fileName}
              fileSizeKb={media.fileSizeKb}
              status="done"
              onRemove={() => removeUploaded(media.tempId)}
            />
          ))}

          {/* アップロード中 / エラー */}
          {uploading.map((item) => (
            <MediaPreviewCard
              key={item.tempId}
              previewUrl={item.previewUrl}
              mediaType={item.file.name.toLowerCase().endsWith(".heic") ? "image" : item.file.type.startsWith("video/") ? "video" : "image"}
              fileName={item.file.name}
              fileSizeKb={Math.ceil(item.file.size / 1024)}
              status={item.progress}
              statusText={item.statusText}
              errorMsg={item.error}
              onRemove={() => removeUploading(item.tempId)}
            />
          ))}
        </div>
      )}

      {/* ファイル数サマリ */}
      {uploaded.length > 0 && (
        <p className="text-xs text-gray-400">
          {uploaded.filter((m) => m.mediaType === "image").length}枚の画像・
          {uploaded.filter((m) => m.mediaType === "video").length}本の動画
          をアップロード済み
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// プレビューカード
// ─────────────────────────────────────────────────────────────────────────────

function MediaPreviewCard({
  previewUrl, mediaType, fileName, fileSizeKb,
  status, statusText, errorMsg, onRemove,
}: {
  previewUrl: string;
  mediaType:  "image" | "video";
  fileName:   string;
  fileSizeKb: number;
  status:     "done" | "uploading" | "error";
  statusText?: string;
  errorMsg?:  string;
  onRemove:   () => void;
}) {
  return (
    <div className={cn(
      "group relative overflow-hidden rounded-xl border bg-white shadow-sm",
      status === "error" ? "border-red-200" : "border-gray-100"
    )}>
      {/* メディア表示 */}
      <div className="relative aspect-video overflow-hidden bg-gray-100">
        {mediaType === "video" ? (
          <video
            src={previewUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={fileName}
            className="h-full w-full object-cover"
          />
        )}

        {/* アップロード中オーバーレイ */}
        {status === "uploading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 backdrop-blur-[1px]">
            <Loader2 size={24} className="animate-spin text-white" />
            {statusText && (
              <span className="text-[10px] font-medium tracking-wide text-white drop-shadow-md">
                {statusText}
              </span>
            )}
          </div>
        )}

        {/* 削除ボタン */}
        {status !== "uploading" && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="削除"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ファイル情報 */}
      <div className="px-2.5 py-2">
        {status === "error" ? (
          <p className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={11} className="shrink-0" />
            <span className="truncate">{errorMsg ?? "エラー"}</span>
          </p>
        ) : (
          <div className="flex items-center gap-1.5">
            {mediaType === "video"
              ? <Video size={11} className="shrink-0 text-gray-400" />
              : <ImageIcon size={11} className="shrink-0 text-gray-400" />
            }
            <p className="truncate text-xs text-gray-500">{fileName}</p>
            <span className="ml-auto shrink-0 text-[10px] text-gray-400">
              {fileSizeKb < 1024
                ? `${fileSizeKb}KB`
                : `${(fileSizeKb / 1024).toFixed(1)}MB`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
