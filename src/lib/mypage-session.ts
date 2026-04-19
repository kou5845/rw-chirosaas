/**
 * 患者マイページ セッション管理
 *
 * HMAC-SHA256 で署名したトークンを HttpOnly Cookie に保存する。
 * Node.js 組み込み crypto を使用し、外部依存なし。
 */

import crypto from "node:crypto";

export const COOKIE_NAME    = "chiro_mp";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30日（秒）

interface SessionPayload {
  patientId: string;
  tenantId:  string;
  exp:       number;
}

function getSecret(): string {
  return process.env.MYPAGE_SESSION_SECRET ?? "dev-secret-change-in-production";
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(patientId: string, tenantId: string): string {
  const payload: SessionPayload = {
    patientId,
    tenantId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string): { patientId: string; tenantId: string } | null {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;

  const data     = token.slice(0, lastDot);
  const incoming = token.slice(lastDot + 1);
  const expected = sign(data);

  // 定長比較でタイミング攻撃を防止
  const inBuf  = Buffer.from(incoming, "base64url");
  const exBuf  = Buffer.from(expected, "base64url");
  if (inBuf.length !== exBuf.length) return null;
  if (!crypto.timingSafeEqual(inBuf, exBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { patientId: payload.patientId, tenantId: payload.tenantId };
  } catch {
    return null;
  }
}
