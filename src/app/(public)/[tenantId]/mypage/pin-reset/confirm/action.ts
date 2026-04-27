"use server";

/**
 * 暗証番号再設定 確認 Server Action（Step 2）
 *
 * セキュリティ設計:
 *   - トークンは 64文字 hex（256bit entropy）
 *   - DB の pinResetTokenExpiresAt を確認し、期限切れは拒否する
 *   - 新 PIN は AES-256-GCM 暗号化してから保存
 *   - 成功後はトークンと有効期限を即クリアし再利用不可にする
 */

import { prisma }            from "@/lib/prisma";
import { hashPin }           from "@/lib/pin";
import { sendSecurityEmail } from "@/lib/email";
import { escapeHtml }        from "@/lib/utils";
import { buildMypageUrl }    from "@/lib/mypage";
import { messagingApi }      from "@line/bot-sdk";

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
    select: { id: true, name: true, subdomain: true, lineEnabled: true, lineChannelAccessToken: true },
  });
  if (!tenant) return { error: "医院情報が見つかりません。" };

  // トークンと有効期限を照合
  const patient = await prisma.patient.findFirst({
    where: {
      tenantId:               tenant.id,
      pinResetToken:          token,
      pinResetTokenExpiresAt: { gt: new Date() }, // 期限内のみ
      isActive:               true,
    },
    select: { id: true, displayName: true, email: true, birthDate: true, accessToken: true, lineUserId: true },
  });

  if (!patient) {
    return { error: "リンクが無効または期限切れです。再度お申し込みください。" };
  }

  // 新 PIN をハッシュ化して保存し、トークンをクリア（ワンタイム使用）
  let hashedPin: string;
  try {
    hashedPin = await hashPin(newPin);
  } catch (e) {
    console.error("[pin-reset/confirm] PIN暗号化エラー:", e);
    return { error: "処理中にエラーが発生しました。管理者にお問い合わせください。" };
  }

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

  // ── 再設定完了通知（メール）────────────────────────────────────
  if (patient.email && patient.birthDate) {
    const bd = patient.birthDate;
    const birthDateFormatted =
      `${bd.getFullYear()}${String(bd.getMonth() + 1).padStart(2, "0")}${String(bd.getDate()).padStart(2, "0")}`;
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/${tenantSlug}/mypage/login`;
    const mypageUrl = patient.accessToken
      ? buildMypageUrl(tenantSlug, patient.accessToken)
      : null;

    const bodyHtml = `
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
        ${escapeHtml(patient.displayName)} 様<br />
        暗証番号（PASS）の再設定が完了しました。<br />
        新しいログイン情報は以下の通りです。
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr>
          <td style="padding:10px 14px;background:#f3f4f6;border-radius:8px 8px 0 0;color:#6b7280;width:50%;">ログインID（生年月日）</td>
          <td style="padding:10px 14px;color:#111827;font-weight:600;font-family:monospace;">${birthDateFormatted}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#f3f4f6;border-radius:0 0 8px 8px;color:#6b7280;">新しい暗証番号（PASS）</td>
          <td style="padding:10px 14px;color:#111827;font-weight:700;font-size:20px;letter-spacing:0.25em;font-family:monospace;">${newPin}</td>
        </tr>
      </table>
      <a href="${loginUrl}" style="display:inline-block;padding:10px 20px;background:#5BBAC4;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;margin-bottom:16px;">
        マイページへログイン →
      </a>
      ${mypageUrl ? `<p style="margin:8px 0 0;color:#374151;font-size:13px;">ログイン後はマイページで予約履歴や登録情報をご確認いただけます。</p>` : ""}
      <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
        ※ 暗証番号は大切に保管してください。<br />
        ※ 本メールに心当たりがない場合はお手数ですが当院までご連絡ください。
      </p>`;

    sendSecurityEmail({
      to:         patient.email,
      subject:    `【${tenant.name}】暗証番号（PASS）再設定完了のお知らせ`,
      tenantName: tenant.name,
      bodyHtml,
    }).catch((e) => console.error("[pin-reset/confirm] メール送信失敗:", e));
  }

  // ── 再設定完了通知（LINE）──────────────────────────────────────
  if (tenant.lineEnabled && patient.lineUserId) {
    const lineToken = tenant.lineChannelAccessToken?.trim() || process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
    if (lineToken) {
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/${tenantSlug}/mypage/login`;
      const lineText = [
        `【${tenant.name}】`,
        `暗証番号（PASS）の再設定が完了しました。`,
        ``,
        `新しい暗証番号：${newPin}`,
        ``,
        `マイページログイン:\n${loginUrl}`,
        `暗証番号は大切に保管してください。`,
      ].join("\n");

      const lineClient = new messagingApi.MessagingApiClient({ channelAccessToken: lineToken });
      lineClient.pushMessage({
        to:       patient.lineUserId,
        messages: [{ type: "text", text: lineText }],
      }).catch((e: unknown) => console.error("[pin-reset/confirm] LINE通知失敗:", e));
    }
  }

  return { success: true };
}
