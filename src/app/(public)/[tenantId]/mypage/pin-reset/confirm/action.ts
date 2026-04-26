"use server";

/**
 * 暗証番号再設定 確認 Server Action（Step 2）
 *
 * セキュリティ設計:
 *   - トークンは 64文字 hex（256bit entropy）
 *   - DB の pinResetTokenExpiresAt を確認し、期限切れは拒否する
 *   - 新 PIN は bcrypt でハッシュ化してから保存
 *   - 成功後はトークンと有効期限を即クリアし再利用不可にする
 */

import { prisma }   from "@/lib/prisma";
import { hashPin }  from "@/lib/pin";

export type PinConfirmState = {
  success?: boolean;
  error?:   string;
} | null;

export async function confirmPinReset(
  _prev: PinConfirmState,
  formData: FormData
): Promise<PinConfirmState> {
  const tenantSlug = (formData.get("tenantSlug") as string | null)?.trim() ?? "";
  const token      = (formData.get("token")      as string | null)?.trim() ?? "";
  const newPin     = (formData.get("newPin")     as string | null)?.trim() ?? "";
  const confirmPin = (formData.get("confirmPin") as string | null)?.trim() ?? "";

  // 入力バリデーション
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return { error: "無効なリクエストです。再度お申し込みください。" };
  }
  if (!/^\d{4}$/.test(newPin)) {
    return { error: "暗証番号は4桁の数字で入力してください。" };
  }
  if (newPin !== confirmPin) {
    return { error: "暗証番号が一致しません。再入力してください。" };
  }

  // CLAUDE.md 絶対ルール: tenantId は DB 照合で確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { error: "医院情報が見つかりません。" };

  // トークンと有効期限を照合
  const patient = await prisma.patient.findFirst({
    where: {
      tenantId:              tenant.id,
      pinResetToken:         token,
      pinResetTokenExpiresAt: { gt: new Date() }, // 期限内のみ
      isActive:              true,
    },
    select: { id: true },
  });

  if (!patient) {
    return { error: "リンクが無効または期限切れです。再度お申し込みください。" };
  }

  // 新 PIN をハッシュ化して保存し、トークンをクリア（ワンタイム使用）
  const hashedPin = await hashPin(newPin);
  try {
    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        accessPin:              hashedPin,
        pinResetToken:          null,
        pinResetTokenExpiresAt: null,
      },
    });
  } catch (e) {
    console.error("[pin-reset/confirm] DB更新エラー:", e);
    return { error: "処理中にエラーが発生しました。しばらくしてから再度お試しください。" };
  }

  return { success: true };
}
