"use server";

/**
 * 暗証番号再発行 Server Action
 *
 * 認証方式: 生年月日（YYYYMMDD）× 登録メールアドレス
 * 両方が同一患者のレコードに一致した場合のみ再発行する。
 * 一致しない場合はどちらが誤りかを伝えない（情報漏洩防止）。
 */

import { prisma } from "@/lib/prisma";
import { sendSecurityEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/utils";

export type PinResetState = {
  success?: boolean;
  error?:   string;
} | null;

export async function resetPin(
  _prev: PinResetState,
  formData: FormData
): Promise<PinResetState> {
  const tenantSlug = (formData.get("tenantSlug") as string | null)?.trim() ?? "";
  const yyyymmdd   = (formData.get("birthDate")  as string | null)?.trim() ?? "";
  const email      = (formData.get("email")      as string | null)?.trim().toLowerCase() ?? "";

  if (!/^\d{8}$/.test(yyyymmdd)) {
    return { error: "生年月日を正しく入力してください（例: 19830405）。" };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "正しいメールアドレスを入力してください。" };
  }

  // CLAUDE.md 絶対ルール: tenantId は DB 照合で確定
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, name: true },
  });
  if (!tenant) return { error: "医院情報が見つかりません。" };

  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  const birthDate = new Date(Date.UTC(y, m - 1, d));

  // 生年月日 + メールアドレス の両方が一致する患者を検索
  // CLAUDE.md 絶対ルール: tenantId フィルタ必須
  const patient = await prisma.patient.findFirst({
    where: {
      tenantId: tenant.id,
      isActive: true,
      birthDate,
      email:    { equals: email, mode: "insensitive" },
    },
    select: { id: true, displayName: true, email: true },
  });

  // 一致しない場合も同じメッセージ（情報漏洩防止）
  const GENERIC_MSG =
    "入力した情報に一致する患者が見つかりませんでした。" +
    "生年月日・メールアドレスを確認するか、スタッフにお問い合わせください。";

  if (!patient || !patient.email) {
    return { error: GENERIC_MSG };
  }

  // 新しい4桁PINを生成（1000〜9999）
  const newPin = String(Math.floor(1000 + Math.random() * 9000));

  try {
    await prisma.patient.update({
      where: { id: patient.id },
      data:  { accessPin: newPin },
    });
  } catch (e) {
    console.error("[pin-reset] DB更新エラー:", e);
    return { error: "処理中にエラーが発生しました。しばらくしてから再度お試しください。" };
  }

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
      ${escapeHtml(patient.displayName)} 様<br />
      暗証番号の再発行が完了しました。<br />
      以下の新しい暗証番号でログインしてください。
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px;background:#f3f4f6;border-radius:8px 8px 0 0;color:#6b7280;width:50%;">ログインID（生年月日）</td>
        <td style="padding:12px 16px;color:#111827;font-weight:600;">${yyyymmdd}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;background:#f3f4f6;border-radius:0 0 8px 8px;color:#6b7280;">新しい暗証番号</td>
        <td style="padding:12px 16px;color:#111827;font-weight:700;font-size:22px;letter-spacing:0.3em;">${newPin}</td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;">
      暗証番号はログイン後にスタッフへご依頼いただくことで変更できます。
    </p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
      ※ このメールに心当たりがない場合は、当院までご連絡ください。<br />
      ※ 本メールは自動送信されています。返信はできません。
    </p>
  `;

  try {
    await sendSecurityEmail({
      to:         patient.email,
      subject:    `【${tenant.name}】暗証番号再発行のお知らせ`,
      tenantName: tenant.name,
      bodyHtml,
    });
  } catch (e) {
    console.error("[pin-reset] メール送信エラー:", e);
    return { error: "メールの送信に失敗しました。しばらくしてから再度お試しください。" };
  }

  return { success: true };
}
