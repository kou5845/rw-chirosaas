"use server";

/**
 * 患者プロフィール更新 Server Action
 *
 * セキュリティ:
 *   - セッション Cookie を検証し、ログイン中の患者自身のレコードのみ更新する
 *   - 更新対象は phone と email のみ。displayName / nameKana は絶対に変更しない
 *   - CLAUDE.md 絶対ルール: Prisma クエリに tenantId を含める
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifySessionToken, COOKIE_NAME } from "@/lib/mypage-session";

export type UpdateProfileState = {
  success?: boolean;
  errors?: { phone?: string; email?: string; general?: string };
} | null;

export async function updatePatientProfile(
  _prev: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const tenantSlug = (formData.get("tenantSlug") as string | null)?.trim() ?? "";
  const phone      = (formData.get("phone")      as string | null)?.trim() ?? "";
  const email      = (formData.get("email")      as string | null)?.trim() || null;

  // ── セッション検証 ──
  const jar      = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value ?? "";
  const session   = cookieVal ? verifySessionToken(cookieVal) : null;
  if (!session) {
    return { errors: { general: "セッションが無効です。ログインし直してください。" } };
  }

  // ── テナント照合（CLAUDE.md: tenantId はセッション由来の値で確認）──
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant || tenant.id !== session.tenantId) {
    return { errors: { general: "認証エラーが発生しました。" } };
  }

  // ── 入力バリデーション ──
  const errors: NonNullable<UpdateProfileState>["errors"] = {};

  if (!phone) {
    errors.phone = "電話番号を入力してください。";
  } else if (!/^[\d\-\s]{10,13}$/.test(phone)) {
    errors.phone = "正しい電話番号を入力してください（例: 090-1234-5678）。";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "正しいメールアドレスを入力してください。";
  }

  if (Object.keys(errors).length > 0) return { errors };

  // ── 更新（phone / email のみ。名前フィールドは data に含めない）──
  await prisma.patient.updateMany({
    where: {
      id:       session.patientId,
      tenantId: tenant.id, // CLAUDE.md 絶対ルール
    },
    data: {
      phone,
      email,
    },
  });

  revalidatePath(`/${tenantSlug}/mypage`);
  return { success: true };
}
