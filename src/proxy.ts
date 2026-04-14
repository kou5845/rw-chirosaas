/**
 * Proxy (旧 Middleware) — テナント識別
 * Next.js 16 で middleware → proxy にリネーム
 *
 * ルール (CLAUDE.md):
 *   - [tenant_id] パスパラメータからテナント識別子を抽出し、リクエストヘッダーに付与する
 *   - 認証実装後: セッションの tenant_id とパスの tenant_id を照合し、不一致は 403 を返す
 *
 * 現フェーズ: auth 未実装のため、テナント識別子のヘッダー付与のみ行う
 */

import { NextRequest, NextResponse } from "next/server";

// テナントルートとして扱わないシステムパス
const SYSTEM_PATHS = new Set([
  "_next",
  "api",
  "favicon.ico",
  "public",
  "login",
  "signup",
]);

// Next.js 16: middleware → proxy にリネーム。export名も "proxy" が必須
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // パス先頭のセグメントを取得（例: /yamada/dashboard → "yamada"）
  const segments = pathname.split("/").filter(Boolean);
  const maybeSlug = segments[0];

  // システムパスはスルー
  if (!maybeSlug || SYSTEM_PATHS.has(maybeSlug)) {
    return NextResponse.next();
  }

  // テナントスラッグをヘッダーに付与してダウンストリームで参照可能にする
  const response = NextResponse.next();
  response.headers.set("x-tenant-slug", maybeSlug);

  // TODO (auth 実装時): Supabase セッションを取得し、
  //   session.user.tenant_id !== resolvedTenantId の場合は 403 を返す
  //   参考: src/proxy.ts のコメント（CLAUDE.md §マルチテナント運用のガードレール）

  return response;
}

export const config = {
  matcher: [
    /*
     * 以下を除く全パスにマッチさせる:
     *   - _next/static (静的ファイル)
     *   - _next/image  (画像最適化)
     *   - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
