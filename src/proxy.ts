/**
 * Proxy (Next.js 16 の Middleware 相当)
 *
 * CLAUDE.md 規約:
 *   - 未ログインユーザーは /login へリダイレクト
 *   - ログイン済みでも URL の tenantSlug とセッションの tenantSlug が一致しない場合は
 *     自分のダッシュボードへ強制送還（テナント間アクセスの完全遮断）
 *   - /admin 配下は isSuperAdmin === true のセッションのみアクセス可
 *   - SuperAdmin は /admin 以外にアクセスできない
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";

// 認証不要な公開パス
const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/cron",
  "/api/test-line",
  "/api/webhook/line",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?")
  )) return true;

  // 公開予約フォーム: /{tenantSlug}/reserve/* は認証不要
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[1] === "reserve") return true;

  // 患者マイページ: /{tenantSlug}/mypage/* は認証不要（マジックリンク方式）
  if (segments.length >= 2 && segments[1] === "mypage") return true;

  return false;
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const session      = req.auth;

  // ── 静的ファイル・Next.js 内部パスはスキップ ──
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── 公開ページへのアクセス ──
  if (isPublicPath(pathname)) {
    if (session?.user) {
      // ログイン済みでログインページにアクセス → 適切なトップへ
      if (pathname === "/login") {
        if (session.user.isSuperAdmin) {
          return NextResponse.redirect(new URL("/admin/tenants", req.url));
        }
        if (session.user.tenantSlug) {
          return NextResponse.redirect(
            new URL(`/${session.user.tenantSlug}/dashboard`, req.url)
          );
        }
      }
    }
    return NextResponse.next();
  }

  // ── 未ログイン → /login へリダイレクト ──
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── ルートパス "/" → ロールに応じてリダイレクト ──
  if (pathname === "/") {
    if (session.user.isSuperAdmin) {
      return NextResponse.redirect(new URL("/admin/tenants", req.url));
    }
    return NextResponse.redirect(
      new URL(`/${session.user.tenantSlug}/dashboard`, req.url)
    );
  }

  // ── /admin 配下 → SuperAdmin のみ許可 ──
  if (pathname.startsWith("/admin")) {
    if (!session.user.isSuperAdmin) {
      // テナントユーザーは自分のダッシュボードへ
      return NextResponse.redirect(
        new URL(`/${session.user.tenantSlug}/dashboard`, req.url)
      );
    }
    return NextResponse.next();
  }

  // ── SuperAdmin がテナントページにアクセス → /admin/tenants へ ──
  if (session.user.isSuperAdmin) {
    return NextResponse.redirect(new URL("/admin/tenants", req.url));
  }

  // ── テナントパスの tenantSlug 照合 ──
  const tenantSlugFromPath = pathname.split("/").filter(Boolean)[0];
  if (
    tenantSlugFromPath &&
    tenantSlugFromPath !== "api" &&
    tenantSlugFromPath !== session.user.tenantSlug
  ) {
    // 他テナントのページへのアクセス → 自分のダッシュボードへ強制送還
    return NextResponse.redirect(
      new URL(`/${session.user.tenantSlug}/dashboard`, req.url)
    );
  }

  // テナントスラッグをヘッダーに付与（下流コンポーネントで参照可能）
  const response = NextResponse.next();
  if (tenantSlugFromPath) {
    response.headers.set("x-tenant-slug", tenantSlugFromPath);
  }
  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
