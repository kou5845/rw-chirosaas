"use server";

/**
 * パスワード再設定トークン発行 Server Action
 *
 * 開発用: メール送信は行わず、コンソールにリセットURLを出力する。
 * 本番移行時は sendPasswordResetEmail() 内を Nodemailer/SendGrid 等に差し替える。
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export type ForgotPasswordState = {
  success?: boolean;
  error?:   string;
} | null;

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "有効なメールアドレスを入力してください。" };
  }

  // ユーザーが存在するかチェック（存在しない場合も成功を返す — ユーザー列挙攻撃対策）
  const user = await prisma.user.findUnique({
    where:  { email },
    select: { id: true },
  });

  if (user) {
    // 既存トークンを削除
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    const token   = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1時間後

    await prisma.passwordResetToken.create({
      data: { email, token, expires },
    });

    // ── 開発用: コンソールに出力（本番では Nodemailer で送信）──
    const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    console.log("\n========================================");
    console.log("[パスワード再設定] 開発用リセットURL:");
    console.log(resetUrl);
    console.log("========================================\n");

    // TODO: 本番移行時は以下の関数を実装してコメントアウトを外す
    // await sendPasswordResetEmail(email, resetUrl);
  }

  // ユーザーの有無に関わらず成功を返す（セキュリティ上の理由）
  return { success: true };
}

export type ResetPasswordState = {
  success?: boolean;
  error?:   string;
} | null;

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token    = (formData.get("token")           as string | null)?.trim() ?? "";
  const password = (formData.get("password")        as string | null) ?? "";
  const confirm  = (formData.get("passwordConfirm") as string | null) ?? "";

  if (!token) return { error: "トークンが不正です。再度パスワード再設定を申請してください。" };
  if (password.length < 8) return { error: "パスワードは8文字以上で入力してください。" };
  if (password !== confirm) return { error: "パスワードが一致しません。" };

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.expires < new Date()) {
    return { error: "リンクの有効期限が切れています。再度パスワード再設定を申請してください。" };
  }

  const user = await prisma.user.findUnique({
    where:  { email: record.email },
    select: { id: true },
  });
  if (!user) return { error: "ユーザーが見つかりません。" };

  const bcrypt = await import("bcryptjs");
  const hashed = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data:  { password: hashed },
    }),
    prisma.passwordResetToken.delete({ where: { token } }),
  ]);

  return { success: true };
}
