/**
 * 患者マイページ URL ユーティリティ
 *
 * - buildMypageUrl: tenantSlug + accessToken から完全なURLを生成する
 * - ensurePatientAccessToken: 患者に accessToken がなければ生成して保存する
 *
 * CLAUDE.md 規約:
 *   - NEXT_PUBLIC_APP_URL 環境変数が未設定の場合は VERCEL_URL をフォールバックとして使う
 *   - accessToken は Node.js crypto.randomUUID() で生成（128bit UUID v4）
 */

import { prisma } from "@/lib/prisma";

// ── アプリのベースURL ──────────────────────────────────────────────
// NEXT_PUBLIC_APP_URL="https://chiro-saas.jp"（本番）または "http://localhost:3000"（開発）
function getAppBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url.replace(/\/$/, ""); // 末尾スラッシュを除去

  // Vercel 自動設定フォールバック
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

/**
 * 患者専用マイページの完全 URL を生成する。
 *
 * @param tenantSlug  - テナントの subdomain（URL スラッグ）
 * @param accessToken - Patient.accessToken（UUID）
 * @returns 例: https://chiro-saas.jp/yamada-seikotsu/mypage/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export function buildMypageUrl(tenantSlug: string, accessToken: string): string {
  return `${getAppBaseUrl()}/${tenantSlug}/mypage/${accessToken}`;
}

/**
 * 患者の accessToken が未設定であれば新規生成して DB に保存し、最新のトークンを返す。
 *
 * 既存のトークンがある場合はそのまま返す（上書きしない）。
 *
 * CLAUDE.md 絶対ルール: tenantId フィルタで他テナントへのアクセスを遮断する
 *
 * @param patientId - 対象患者の ID
 * @param tenantId  - テナント ID（クロステナント防止）
 * @returns accessToken 文字列（既存 or 新規生成）
 */
export async function ensurePatientAccessToken(
  patientId: string,
  tenantId:  string,
): Promise<string> {
  // 現在のトークンを取得
  const patient = await prisma.patient.findFirst({
    where:  { id: patientId, tenantId },
    select: { accessToken: true },
  });

  if (!patient) {
    throw new Error(`[ensurePatientAccessToken] 患者が見つかりません: patientId=${patientId}`);
  }

  // すでにトークンがあればそのまま返す
  if (patient.accessToken) {
    return patient.accessToken;
  }

  // 新規生成して DB に保存
  const newToken = crypto.randomUUID();
  await prisma.patient.update({
    where: { id: patientId },
    data:  { accessToken: newToken },
  });

  console.log(`[mypage] accessToken 自動発行: patientId=${patientId}`);
  return newToken;
}
