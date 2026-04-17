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

  try {
    const userRecord = await prisma.user.findUnique({
      where:  { loginId },
      select: { tenant: { select: { isActive: true } } },
    });
    if (userRecord && !userRecord.tenant.isActive) {
      return { error: "このアカウントは現在無効化されています。管理者にお問い合わせください。" };
    }
  } catch (dbErr) {
    console.error("[loginAction] DB接続エラー:", dbErr);
    return { error: "システムエラーが発生しました。しばらく後にお試しください。" };
  }

  try {
    await signIn("credentials", { loginId, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "ログインIDまたはパスワードが正しくありません。" };
    }
    // NEXT_REDIRECT は再スロー（Server Action リダイレクト）
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    console.error("[loginAction] signIn エラー:", err);
    return { error: "認証処理中にエラーが発生しました。しばらく後にお試しください。" };
  }

  return { success: true };
}
