"use server";

/**
 * 暗証番号再設定リクエスト Server Action（Step 1）
 *
 * セキュリティ設計:
 *   - PIN をメールに直接送信しない。代わりに 24h 有効なワンタイムトークン URL を送る。
 *   - 生年月日 + メールアドレスの両方が一致した場合のみトークンを発行する。
 *   - 患者が存在しない場合も同じ成功レスポンスを返す（ユーザー列挙防止）。
 */

import { randomBytes }    from "crypto";
import { prisma }         from "@/lib/prisma";
import { sendSecurityEmail } from "@/lib/email";
import { escapeHtml }     from "@/lib/utils";

export type PinResetState = {
  success?: boolean;
  error?:   string;
} | null;

function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

export async function requestPinReset(
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

  // 生年月日 + メールアドレスの両方が一致する患者を検索
  const patient = await prisma.patient.findFirst({
    where: {
      tenantId: tenant.id,
      isActive: true,
      birthDate,
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true, displayName: true, email: true },
  });

  // 一致しなくても成功レスポンスを返す（ユーザー列挙防止）
  if (!patient?.email) {
    return { success: true };
  }

  // 32バイト乱数トークンを生成（64文字 hex）
  const token   = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後

  // DB にトークンを保存
  await prisma.patient.update({
    where: { id: patient.id },
    data:  { pinResetToken: token, pinResetTokenExpiresAt: expires },
  }).catch((e) => {
    console.error("[pin-reset] トークン保存エラー:", e);
  });

  // メールで再設定 URL を送信（PIN は送らない）
  const resetUrl = `${getBaseUrl()}/${tenantSlug}/mypage/pin-reset/confirm?token=${token}`;
  const bodyHtml = `
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
      ${escapeHtml(patient.displayName)} 様<br />
      暗証番号の再設定リクエストを受け付けました。<br />
      以下のボタンから新しい暗証番号を設定してください。
    </p>
    <p style="margin:0 0 8px;color:#374151;font-size:13px;">
      ※ このリンクは <strong>24時間</strong> 有効です。期限が切れた場合は再度お申し込みください。
    </p>
    <a href="${resetUrl}"
      style="display:inline-block;padding:12px 24px;background:#5BBAC4;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;margin:8px 0 20px;">
      暗証番号を再設定する →
    </a>
    <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;line-height:1.6;">
      ※ このメールに心当たりがない場合は無視してください。リンクにアクセスしなければ現在の暗証番号は変更されません。
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px;">
      ※ 本メールは自動送信されています。返信はできません。
    </p>
  `;

  await sendSecurityEmail({
    to:         patient.email,
    subject:    `【${tenant.name}】暗証番号の再設定リクエスト`,
    tenantName: tenant.name,
    bodyHtml,
  }).catch((e) => console.error("[pin-reset] メール送信エラー:", e));

  return { success: true };
}
