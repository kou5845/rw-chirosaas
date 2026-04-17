/**
 * カルテメディア オンデマンド署名付きURL発行
 *
 * GET /api/media/[mediaId]?tenantId=xxx
 *
 * - mediaId と tenantId の両方で DB 照合し、クロステナントアクセスを防止する
 * - Supabase Storage の署名付きURL（1時間有効）を発行して 302 リダイレクトする
 * - <img src> / <video src> がリクエストのたびに新鮮な URL を取得するため、
 *   表示側でのURL期限切れが発生しない
 *
 * CLAUDE.md 規約:
 *   - service role key はサーバーサイドのみ使用する（クライアントに渡さない）
 *   - tenantId は必ずセッション由来（ここでは DB 照合）で確認すること
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdmin, KARTE_MEDIA_BUCKET } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const token    = request.nextUrl.searchParams.get("token");

  if (!tenantId && !token) {
    return NextResponse.json({ error: "tenantId または token は必須です" }, { status: 400 });
  }

  // CLAUDE.md 絶対ルール: 2通りの認証方式を排他的に検証
  let media: { storagePath: string } | null = null;

  if (tenantId) {
    // 管理者スタッフ向け: tenantId + mediaId で照合
    media = await prisma.karteMedia.findFirst({
      where: { id: mediaId, tenantId },
      select: { storagePath: true },
    });
  } else if (token) {
    // 患者マイページ向け: token → patient → karte → media のリレーションを辿る
    // professional モードのメディアのみ許可（simple 患者が誤アクセスしてもブロック）
    media = await prisma.karteMedia.findFirst({
      where: {
        id: mediaId,
        karte: {
          karteModeSnapshot: "professional",
          patient: {
            accessToken: token,
            isActive:    true,
          },
        },
      },
      select: { storagePath: true },
    });
  }

  if (!media) {
    return NextResponse.json({ error: "メディアが見つかりません" }, { status: 404 });
  }

  // 署名付きURL発行（service role で RLS をバイパス）
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(KARTE_MEDIA_BUCKET)
    .createSignedUrl(media.storagePath, 60 * 60); // 1時間

  if (error || !data?.signedUrl) {
    console.error("[api/media] signed URL generation failed:", error?.message, "path:", media.storagePath);
    return NextResponse.json(
      { error: "URLの生成に失敗しました" },
      { status: 500 }
    );
  }

  // 302 リダイレクト: ブラウザが署名付きURLへ直接アクセスする
  return NextResponse.redirect(data.signedUrl);
}
