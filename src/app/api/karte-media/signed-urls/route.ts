/**
 * カルテメディア 署名付きURL一括取得
 *
 * GET /api/karte-media/signed-urls?karteId=xxx&tenantId=xxx
 *
 * CLAUDE.md 規約:
 *   - tenantId と karteId の両方で照合し、クロステナントアクセスを防止する
 *   - service role key はサーバーサイドのみ使用すること（クライアントに渡さない）
 *   - 署名付きURLの有効期限は 300秒（編集中の操作時間を考慮）
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdmin, KARTE_MEDIA_BUCKET } from "@/lib/supabase";

const SIGNED_URL_EXPIRES = 300; // 5分

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const karteId  = searchParams.get("karteId");
  const tenantId = searchParams.get("tenantId");

  if (!karteId || !tenantId) {
    return NextResponse.json(
      { error: "karteId と tenantId は必須です" },
      { status: 400 }
    );
  }

  // ── CLAUDE.md 絶対ルール: tenantId + karteId 両方で照合 ──────────
  const karte = await prisma.karte.findFirst({
    where: { id: karteId, tenantId },
    select: { id: true },
  });
  if (!karte) {
    return NextResponse.json(
      { error: "カルテが見つかりません" },
      { status: 404 }
    );
  }

  // ── KarteMedia 一覧取得 ─────────────────────────────────────────
  const mediaList = await prisma.karteMedia.findMany({
    where:   { karteId, tenantId }, // CLAUDE.md 絶対ルール
    select:  { id: true, storagePath: true, mediaType: true, fileSizeKb: true },
    orderBy: { createdAt: "asc" },
  });

  if (mediaList.length === 0) {
    return NextResponse.json({ media: [] });
  }

  // ── 署名付きURL発行（service role でRLSバイパス）─────────────────
  const supabase = createSupabaseAdmin();
  const results  = await Promise.all(
    mediaList.map(async (m) => {
      const { data, error } = await supabase.storage
        .from(KARTE_MEDIA_BUCKET)
        .createSignedUrl(m.storagePath, SIGNED_URL_EXPIRES);

      return {
        id:         m.id,
        signedUrl:  error ? null : data?.signedUrl ?? null,
        mediaType:  m.mediaType as "image" | "video",
        fileSizeKb: m.fileSizeKb,
        storagePath: m.storagePath,
      };
    })
  );

  // サインURL取得失敗のものを除外して返す
  const media = results.filter((r) => r.signedUrl !== null);
  return NextResponse.json({ media });
}
