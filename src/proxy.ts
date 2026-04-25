/**
 * Proxy (Next.js Middleware 相当)
 *
 * CLAUDE.md 規約:
 *   - 未ログインユーザーは /login へリダイレクト
 *   - ログイン済みでも URL の tenantSlug とセッションの tenantSlug が一致しない場合は
 *     自分のダッシュボードへ強制送還（テナント間アクセスの完全遮断）
 *   - /admin 配下は isSuperAdmin === true のセッションのみアクセス可
 *   - SuperAdmin は /admin 以外にアクセスできない
 *
 * セキュリティ:
 *   - レートリミット: ログイン・PIN再発行・予約作成エンドポイントを保護
 *     Upstash 未設定時はスキップ（開発環境フォールバック）
 */

import { auth } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";
import {
  loginRatelimit,
  pinResetRatelimit,
  reserveRatelimit,
  isRedisAvailable,
} from "@/lib/rate-limit";

// ── 認証不要な公開パス ────────────────────────────────────────────

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

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[1] === "reserve") return true;
  if (segments.length >= 2 && segments[1] === "mypage")  return true;

  return false;
}

// ── IP アドレス取得 ────────────────────────────────────────────────

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
}

// ── レートリミット設定 ────────────────────────────────────────────

type RateLimitRule = {
  limiter: typeof loginRatelimit;
  label:   string;
};

function getRateLimitRule(pathname: string): RateLimitRule | null {
  if (pathname.endsWith("/mypage/login"))     return { limiter: loginRatelimit,    label: "login" };
  if (pathname.endsWith("/mypage/pin-reset")) return { limiter: pinResetRatelimit, label: "pin-reset" };
  if (/\/reserve(\/.*)?$/.test(pathname))    return { limiter: reserveRatelimit,   label: "reserve" };
  return null;
}

async function applyRateLimit(req: NextRequest): Promise<NextResponse | null> {
  if (!isRedisAvailable()) return null;

  const rule = getRateLimitRule(req.nextUrl.pathname);
  if (!rule) return null;

  const key = `${getClientIp(req)}:${rule.label}`;
  try {
    const { success, limit, remaining, reset } = await rule.limiter.limit(key);
    if (!success) {
      const retryAfterSec = Math.ceil((reset - Date.now()) / 1000);
      console.warn(`[proxy] Rate limit exceeded: key=${key}`);
      return new NextResponse(
        JSON.stringify({
          error: "リクエストが多すぎます。しばらくしてからもう一度お試しください。",
          retryAfter: retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            "Content-Type":          "application/json",
            "Retry-After":           String(retryAfterSec),
            "X-RateLimit-Limit":     String(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset":     String(reset),
          },
        }
      );
    }
  } catch (e) {
    // Redis エラー時はフェイルオープン（可用性優先）
    console.error("[proxy] Rate limit error:", e instanceof Error ? e.message : e);
  }
  return null;
}

// ── Proxy 本体 ────────────────────────────────────────────────────

export const proxy = auth(async (req) => {
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

  // ── レートリミットチェック（公開エンドポイント保護）──
  const rateLimitResponse = await applyRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  // ── 公開ページへのアクセス ──
  if (isPublicPath(pathname)) {
    if (session?.user) {
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
    return NextResponse.redirect(
      new URL(`/${session.user.tenantSlug}/dashboard`, req.url)
    );
  }

  // テナントスラッグをヘッダーに付与
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
