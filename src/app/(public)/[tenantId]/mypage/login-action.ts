"use server";

/**
 * 患者マイページ ログイン / ログアウト Server Actions
 *
 * 認証方式: 生年月日（YYYYMMDD）× accessPin（4桁）
 * セッション: HMAC-SHA256 署名付きトークンを HttpOnly Cookie に保存
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSessionToken, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/mypage-session";
import { verifyPin, hashPin } from "@/lib/pin";

export type LoginState = { error?: string } | null;

export async function loginMypage(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const tenantSlug = (formData.get("tenantSlug") as string | null)?.trim() ?? "";
  const yyyymmdd   = (formData.get("birthDate")  as string | null)?.trim() ?? "";
  const pin        = (formData.get("accessPin")  as string | null)?.trim() ?? "";

  if (!/^\d{8}$/.test(yyyymmdd)) {
    return { error: "生年月日を正しく入力してください（例: 19830405）。" };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { error: "暗証番号は4桁の数字で入力してください。" };
  }

  // テナント照合
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { error: "医院情報が見つかりません。" };

  // 生年月日をUTC日付に変換してDB照合
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  const birthDate = new Date(Date.UTC(y, m - 1, d));

  // CLAUDE.md 絶対ルール: tenantId フィルタ必須
  // bcrypt 比較のため birthDate で候補を絞り込んだ後、PIN をアプリ側で照合する
  const candidates = await prisma.patient.findMany({
    where: { tenantId: tenant.id, isActive: true, birthDate },
    select: { id: true, accessPin: true },
  });

  let matchedId: string | null = null;
  let upgradePin = false;
  for (const c of candidates) {
    const result = await verifyPin(pin, c.accessPin);
    if (result.match) {
      matchedId  = c.id;
      upgradePin = result.needsUpgrade;
      break;
    }
  }

  if (!matchedId) {
    // 存在しないか認証失敗 — 詳細は漏らさない
    return { error: "生年月日または暗証番号が正しくありません。" };
  }

  // 移行: 平文 PIN をハッシュにアップグレード（次回以降は bcrypt で照合）
  if (upgradePin) {
    await prisma.patient.update({
      where: { id: matchedId },
      data:  { accessPin: await hashPin(pin) },
    }).catch((e) => console.error("[loginMypage] PIN upgrade failed:", e));
  }

  // セッショントークンを Cookie に保存
  const token = createSessionToken(matchedId, tenant.id);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   SESSION_MAX_AGE,
    path:     `/${tenantSlug}/mypage`,
  });

  redirect(`/${tenantSlug}/mypage`);
}

export async function logoutMypage(tenantSlug: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     `/${tenantSlug}/mypage`,
  });
  redirect(`/${tenantSlug}/mypage/login`);
}

/** 削除済み患者のセッション Cookie を無効化する（リダイレクトループ防止） */
export async function clearStaleSession(tenantSlug: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     `/${tenantSlug}/mypage`,
  });
}
