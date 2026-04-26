"use server";

/**
 * 2回目以降の方向け 予約フォームへのログイン Server Action
 *
 * マイページと同じ認証方式（生年月日 × accessPin）だが、
 * セッション Cookie は設定せず 30 分有効の reserve token を発行し
 * /[slug]/reserve?rt=<token> へリダイレクトする。
 * ReserveForm が既存患者情報をロック表示する。
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createReserveToken } from "@/lib/mypage-session";
import { verifyPin, hashPin } from "@/lib/pin";

export type TriageLoginState = { error?: string } | null;

export async function loginForReserve(
  _prev: TriageLoginState,
  formData: FormData
): Promise<TriageLoginState> {
  const tenantSlug = (formData.get("tenantSlug") as string | null)?.trim() ?? "";
  const yyyymmdd   = (formData.get("birthDate")  as string | null)?.trim() ?? "";
  const pin        = (formData.get("accessPin")  as string | null)?.trim() ?? "";

  if (!/^\d{8}$/.test(yyyymmdd)) {
    return { error: "生年月日を正しく入力してください（例: 19830405）。" };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { error: "暗証番号は4桁の数字で入力してください。" };
  }

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { error: "医院情報が見つかりません。" };

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
    return { error: "生年月日または暗証番号が正しくありません。" };
  }

  // 移行: 平文 PIN をハッシュにアップグレード
  if (upgradePin) {
    await prisma.patient.update({
      where: { id: matchedId },
      data:  { accessPin: await hashPin(pin) },
    }).catch((e) => console.error("[loginForReserve] PIN upgrade failed:", e));
  }

  const token = createReserveToken(matchedId, tenant.id);
  redirect(`/${tenantSlug}/reserve?rt=${encodeURIComponent(token)}`);
}
