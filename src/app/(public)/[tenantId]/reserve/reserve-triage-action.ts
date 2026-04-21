"use server";

/**
 * 既存患者向け予約フォームへのログイン Server Action
 *
 * マイページの loginMypage と同じ認証方式（生年月日 × 暗証番号）だが、
 * セッション Cookie を設定せず、30 分有効の reserve token を発行して
 * /[slug]/reserve?rt=<token> へリダイレクトする。
 * これにより ReserveForm が既存患者情報をロック表示する。
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createReserveToken } from "@/lib/mypage-session";

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
  const patient = await prisma.patient.findFirst({
    where: {
      tenantId:  tenant.id,
      isActive:  true,
      birthDate,
      accessPin: pin,
    },
    select: { id: true },
  });

  if (!patient) {
    return { error: "生年月日または暗証番号が正しくありません。" };
  }

  const token = createReserveToken(patient.id, tenant.id);
  redirect(`/${tenantSlug}/reserve?rt=${encodeURIComponent(token)}`);
}
