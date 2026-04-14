/**
 * カルテメディアアップロード Route Handler
 *
 * POST /api/upload/karte-media
 *   FormData: { file: File, tenantId: string }
 *   → Supabase Storage にアップロードし、storagePath を返す
 *
 * CLAUDE.md 規約:
 *   - service role key はサーバーサイドのみ使用する（クライアントに渡さない）
 *   - 1ファイル最大 50MB の制限を適用する
 *   - ファイルパスは tenantId/karteId(temp)/uuid.ext の形式で保存する
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin, KARTE_MEDIA_BUCKET } from "@/lib/supabase";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file     = formData.get("file")     as File | null;
    const tenantId = formData.get("tenantId") as string | null;

    if (!file || !tenantId) {
      return NextResponse.json({ error: "file と tenantId は必須です" }, { status: 400 });
    }

    // ── バリデーション ──────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `ファイルサイズは50MB以下にしてください（${(file.size / 1024 / 1024).toFixed(1)}MB）` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "対応していないファイル形式です（JPEG/PNG/GIF/WebP/MP4/WebM/MOV）" },
        { status: 400 }
      );
    }

    // ── ストレージパス生成（tenantId/temp/uuid.ext）────────────────
    const ext      = file.name.split(".").pop() ?? "bin";
    const uuid     = crypto.randomUUID();
    const filePath = `${tenantId}/temp/${uuid}.${ext}`;

    const bytes  = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);

    // ── Supabase Storage へアップロード（service role で RLS をバイパス）──
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.storage
      .from(KARTE_MEDIA_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert:      false,
      });

    if (error) {
      console.error("[upload/karte-media] Storage error:", error);
      return NextResponse.json({ error: "アップロードに失敗しました: " + error.message }, { status: 500 });
    }

    const mediaType = file.type.startsWith("video/") ? "video" : "image";

    return NextResponse.json({
      storagePath: filePath,
      mediaType,
      fileName:    file.name,
      fileSizeKb:  Math.ceil(file.size / 1024),
    });
  } catch (e) {
    console.error("[upload/karte-media] Error:", e);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
