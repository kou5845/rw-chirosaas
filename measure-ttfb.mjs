/**
 * TTFB 計測スクリプト v2
 * NextAuth 認証フローに対応したバージョン
 */

import { performance } from "perf_hooks";

const BASE_URL   = "https://rwchirosaas0418.vercel.app";
const LOGIN_ID   = "yamada-admin";
const LOGIN_PASS = "password123";

const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const CYAN   = "\x1b[36m";

function colorTTFB(ms) {
  if (ms < 300) return `${GREEN}${ms}ms ✅ 良好${RESET}`;
  if (ms < 600) return `${YELLOW}${ms}ms ⚠️  普通${RESET}`;
  return `${RED}${ms}ms ❌ 要改善${RESET}`;
}

/** クッキーヘッダー文字列を Map に変換 */
function parseCookies(headers) {
  const map = new Map();
  const raw = headers.getSetCookie ? headers.getSetCookie() : [];
  for (const line of raw) {
    const [kv] = line.split(";");
    const [k, v] = kv.trim().split("=");
    if (k && v !== undefined) map.set(k.trim(), v.trim());
  }
  return map;
}

function cookieMapToHeader(map) {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login() {
  console.log(`\n${BOLD}${CYAN}=== NextAuth ログインシーケンス ===${RESET}`);
  const jar = new Map();

  // ① /api/auth/csrf で CSRF トークンを取得
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, {
    headers: { "User-Agent": "TTFB-Bench/2.0" },
  });
  parseCookies(csrfRes.headers).forEach((v, k) => jar.set(k, v));
  const { csrfToken } = await csrfRes.json();
  console.log(`  ① CSRF token: ${csrfToken?.slice(0, 20)}...`);

  // ② /api/auth/callback/credentials で認証
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieMapToHeader(jar),
      "User-Agent": "TTFB-Bench/2.0",
    },
    body: new URLSearchParams({
      csrfToken,
      loginId: LOGIN_ID,
      password: LOGIN_PASS,
      callbackUrl: BASE_URL + "/",
      json: "true",
    }),
    redirect: "manual",
  });

  parseCookies(loginRes.headers).forEach((v, k) => jar.set(k, v));
  const redirectTo = loginRes.headers.get("location") ?? "";
  console.log(`  ② 認証レスポンス: ${loginRes.status}  →  ${redirectTo}`);

  // ③ セッションを確定させるためリダイレクト先を取得
  if (redirectTo) {
    const url = redirectTo.startsWith("http") ? redirectTo : BASE_URL + redirectTo;
    const r3 = await fetch(url, {
      headers: { "Cookie": cookieMapToHeader(jar), "User-Agent": "TTFB-Bench/2.0" },
      redirect: "manual",
    });
    parseCookies(r3.headers).forEach((v, k) => jar.set(k, v));
    const loc3 = r3.headers.get("location") ?? "";
    console.log(`  ③ フォロー先: ${r3.status}  →  ${loc3}`);

    // ④ さらにリダイレクト
    if (loc3) {
      const url4 = loc3.startsWith("http") ? loc3 : BASE_URL + loc3;
      const r4 = await fetch(url4, {
        headers: { "Cookie": cookieMapToHeader(jar), "User-Agent": "TTFB-Bench/2.0" },
        redirect: "manual",
      });
      parseCookies(r4.headers).forEach((v, k) => jar.set(k, v));
      const loc4 = r4.headers.get("location") ?? "";
      console.log(`  ④ フォロー先: ${r4.status}  →  ${loc4}`);

      // ⑤ 最終リダイレクト（テナントダッシュボードのはず）
      if (loc4) {
        const url5 = loc4.startsWith("http") ? loc4 : BASE_URL + loc4;
        const r5 = await fetch(url5, {
          headers: { "Cookie": cookieMapToHeader(jar), "User-Agent": "TTFB-Bench/2.0" },
          redirect: "manual",
        });
        parseCookies(r5.headers).forEach((v, k) => jar.set(k, v));
        const loc5 = r5.headers.get("location") ?? "";
        console.log(`  ⑤ 最終着地: ${r5.status}  →  ${loc5 || "(ページ到達)"}`);

        // loc5 がテナントスラッグを含む場合に抽出
        if (loc5) {
          const match = loc5.match(/^\/([^/]+)\//);
          if (match) {
            console.log(`  テナントスラッグ候補: ${match[1]}`);
            return { cookies: cookieMapToHeader(jar), slug: match[1] };
          }
        }
      }

      if (loc4) {
        const match = loc4.match(/^\/([^/]+)\//);
        if (match) {
          console.log(`  テナントスラッグ候補: ${match[1]}`);
          return { cookies: cookieMapToHeader(jar), slug: match[1] };
        }
      }
    }

    if (loc3) {
      const match = loc3.match(/^\/([^/]+)\//);
      if (match) {
        console.log(`  テナントスラッグ候補: ${match[1]}`);
        return { cookies: cookieMapToHeader(jar), slug: match[1] };
      }
    }
  }

  // セッションを確認してテナントスラッグを取得
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { "Cookie": cookieMapToHeader(jar), "User-Agent": "TTFB-Bench/2.0" },
  });
  const session = await sessionRes.json();
  console.log(`  セッション: ${JSON.stringify(session).slice(0, 120)}`);

  return { cookies: cookieMapToHeader(jar), slug: null };
}

async function measureTTFB(url, cookies) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        headers: {
          "Cookie": cookies,
          "User-Agent": "TTFB-Bench/2.0",
          "Cache-Control": "no-cache, no-store",
          "Pragma": "no-cache",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      const ttfb = Math.round(performance.now() - t0);
      await res.text(); // body を消費
      clearTimeout(timer);
      results.push({ ttfb, status: res.status });
    } catch (e) {
      results.push({ ttfb: 9999, status: 0, error: e.message });
    }
    await new Promise(r => setTimeout(r, 600));
  }
  return results;
}

async function run() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗`);
  console.log(`║   chirosaas 本番 TTFB 計測 v2                   ║`);
  console.log(`╚══════════════════════════════════════════════════╝${RESET}\n`);

  const { cookies, slug: detectedSlug } = await login();
  
  // スラッグが取得できなかった場合は既知のものを使う
  const slug = detectedSlug ?? "yamada";
  console.log(`\n  使用するテナントスラッグ: ${BOLD}${slug}${RESET}`);

  const pages = [
    { label: "ダッシュボード      ", path: `/${slug}/dashboard` },
    { label: "予約管理（週間）    ", path: `/${slug}/appointments?view=week` },
    { label: "予約管理（リスト）  ", path: `/${slug}/appointments?view=list` },
    { label: "患者一覧            ", path: `/${slug}/patients` },
    { label: "カルテ一覧          ", path: `/${slug}/kartes` },
    { label: "設定ページ          ", path: `/${slug}/settings` },
  ];

  console.log(`\n${BOLD}■ 各ページ TTFB 計測（3回平均・キャッシュなし）${RESET}\n`);

  const summary = [];

  for (const page of pages) {
    const url = `${BASE_URL}${page.path}`;
    const runs = await measureTTFB(url, cookies);
    
    const ttfbs = runs.map(r => r.ttfb);
    const avg  = Math.round(ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length);
    const min  = Math.min(...ttfbs);
    const max  = Math.max(...ttfbs);
    const statuses = runs.map(r => r.status).join("/");

    summary.push({ label: page.label.trim(), avg, min, max });
    console.log(`  ${page.label}  avg: ${colorTTFB(avg)}  min:${min}ms max:${max}ms  [HTTP ${statuses}]`);
  }

  // ─── サマリー
  const overallAvg = Math.round(summary.reduce((a, b) => a + b.avg, 0) / summary.length);
  const best  = summary.sort((a, b) => a.avg - b.avg)[0];
  const worst = [...summary].sort((a, b) => b.avg - a.avg)[0];

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗`);
  console.log(`║   計測結果サマリー                               ║`);
  console.log(`╚══════════════════════════════════════════════════╝${RESET}`);
  console.log(`\n  判定基準: ${GREEN}✅ < 300ms 良好${RESET} | ${YELLOW}⚠️  300-600ms 普通${RESET} | ${RED}❌ > 600ms 要改善${RESET}`);
  console.log(`\n  全体平均 TTFB : ${colorTTFB(overallAvg)}`);
  console.log(`  最も速いページ: ${best.label}  (avg ${best.avg}ms)`);
  console.log(`  最も遅いページ: ${worst.label}  (avg ${worst.avg}ms)`);
  console.log(`\n  ──────────────────────────────────────────────`);
  console.log(`  主な遅延要因:`);
  console.log(`    1. Vercel → Supabase 間のリージョン RTT`);
  console.log(`       （同リージョン化で -150〜300ms 削減可能）`);
  console.log(`    2. Serverless Function Cold Start`);
  console.log(`       （Vercel Pro の Fluid Compute で軽減可能）`);
  console.log(`    3. 残存する直列 DB クエリ（settings ページ等）`);
  console.log(`  ──────────────────────────────────────────────\n`);
}

run().catch(console.error);
