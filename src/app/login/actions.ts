"use server";

/**
 * ログイン Server Action
 *
 * CLAUDE.md 規約: 認証は NextAuth の Credentials Provider 経由。
 * tenantId はセッション由来の値のみ使用（フォームの hidden フィールド不使用）。
 */

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";

export type LoginState = {
  error?: string;
  success?: true;
} | null;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const loginId  = (formData.get("loginId")  as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null)?.trim() ?? "";

  if (!loginId || !password) {
    return { error: "ログインIDとパスワードを入力してください。" };
  }

  const userRecord = await prisma.user.findUnique({
    where:  { loginId },
    select: { tenant: { select: { isActive: true } } },
  });
  if (userRecord && !userRecord.tenant.isActive) {
    return { error: "このアカウントは現在無効化されています。管理者にお問い合わせください。" };
  }

  try {
    await signIn("credentials", { loginId, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "ログインIDまたはパスワードが正しくありません。" };
    }
    throw err;
  }

  return { success: true };
}
