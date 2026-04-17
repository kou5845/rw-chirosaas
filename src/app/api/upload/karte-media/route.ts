/**
 * カルテメディアアップロード 署名付きURL生成 Route Handler
 *
 * POST /api/upload/karte-media
 *   JSON: { fileName: string, fileType: string, fileSize: number, tenantId: string }
 *   → Supabase Storage への署名付きアップロードURL (Token) を発行する
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, KARTE_MEDIA_BUCKET } from "@/lib/supabase";

const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;  // 2MB (クライアントでリサイズ済み想定)

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
];

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileType, fileSize, tenantId } = await request.json();

    if (!fileName || !fileType || !tenantId || fileSize == null) {
      return NextResponse.json({ error: "fileName, fileType, fileSize, tenantId は必須です" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: "対応していないファイル形式です（JPEG/PNG/GIF/WebP/MP4/WebM/MOV）" },
        { status: 400 }
      );
    }

    // サイズ上限チェック（サーバー側でも検証）
    const isVideo = fileType.startsWith("video/");
    if (isVideo && fileSize > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: `動画サイズは15MB以下にしてください（${(fileSize / 1024 / 1024).toFixed(1)}MB）` },
        { status: 400 }
      );
    }
    if (!isVideo && fileSize > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: `画像サイズは2MB以下にしてください（${(fileSize / 1024 / 1024).toFixed(1)}MB）` },
        { status: 400 }
      );
    }

    // ── ストレージパス生成（tenantId/temp/uuid.ext）────────────────
    const ext      = fileName.split(".").pop() ?? "bin";
    const uuid     = crypto.randomUUID();
    const filePath = `${tenantId}/temp/${uuid}.${ext}`;

    // ── 署名付きアップロードURL生成 ──
    // service role を用いて、特定パスに対するアップロード権限(Token)を生成
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(KARTE_MEDIA_BUCKET)
      .createSignedUploadUrl(filePath);

    if (error || !data) {
      console.error("[upload/karte-media] Signed URL error:", error);
      return NextResponse.json({ error: "アップロードURLの生成に失敗しました: " + (error?.message || "Unknown") }, { status: 500 });
    }

    return NextResponse.json({
      storagePath: filePath,
      token: data.token,
    });
  } catch (e) {
    console.error("[upload/karte-media] Error:", e);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
