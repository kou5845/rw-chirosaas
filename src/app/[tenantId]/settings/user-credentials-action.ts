"use server";

/**
 * ログインID・メール・パスワード変更 Server Action
 *
 * CLAUDE.md 規約:
 *   - tenantId はセッション由来の値のみ使用
 *   - DB 照合でユーザーの帰属を確認してから更新
 */

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export type CredentialsState = {
  success?: boolean;
  errors?: {
    loginId?:        string;
    email?:          string;
    currentPassword?: string;
    newPassword?:    string;
    general?:        string;
  };
} | null;

export async function updateUserCredentials(
  _prevState: CredentialsState,
  formData: FormData,
): Promise<CredentialsState> {
  // CLAUDE.md 絶対ルール: tenantId はセッション由来の値のみ使用
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { errors: { general: "ログインセッションが切れています。再ログインしてください。" } };
  }

  const userId  = session.user.id; // JWT の sub フィールド
  // userIdが空の場合はloginIdで検索
  const loginIdFromSession = session.user.loginId;

  const newLoginId       = (formData.get("loginId")         as string | null)?.trim() ?? "";
  const newEmail         = (formData.get("email")           as string | null)?.trim().toLowerCase() ?? "";
  const currentPassword  = (formData.get("currentPassword") as string | null) ?? "";
  const newPassword      = (formData.get("newPassword")     as string | null) ?? "";

  const errors: NonNullable<CredentialsState>["errors"] = {};

  if (!newLoginId) errors.loginId = "ログインIDを入力してください。";
  else if (!/^[a-zA-Z0-9\-_]{3,64}$/.test(newLoginId))
    errors.loginId = "ログインIDは半角英数字・ハイフン・アンダーバーで3〜64文字です。";

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
    errors.email = "有効なメールアドレスを入力してください。";

  if (newPassword && newPassword.length < 8)
    errors.newPassword = "新しいパスワードは8文字以上で入力してください。";

  if (Object.keys(errors).length > 0) return { errors };

  // DB からユーザーを取得（tenantId と loginId で照合）
  const user = await prisma.user.findFirst({
    where: { loginId: loginIdFromSession, tenantId: session.user.tenantId },
    select: { id: true, password: true },
  });
  if (!user) return { errors: { general: "ユーザーが見つかりません。" } };

  // パスワード変更を行う場合は現在のパスワードを照合
  if (newPassword) {
    if (!currentPassword) {
      return { errors: { currentPassword: "現在のパスワードを入力してください。" } };
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return { errors: { currentPassword: "現在のパスワードが正しくありません。" } };
    }
  }

  // loginId の重複チェック（自分以外）
  if (newLoginId !== loginIdFromSession) {
    const exists = await prisma.user.findFirst({
      where: { loginId: newLoginId, id: { not: user.id } },
      select: { id: true },
    });
    if (exists) return { errors: { loginId: "このログインIDはすでに使用されています。" } };
  }

  // email の重複チェック
  const currentUser = await prisma.user.findUnique({
    where:  { id: user.id },
    select: { email: true },
  });
  if (newEmail !== currentUser?.email) {
    const exists = await prisma.user.findFirst({
      where: { email: newEmail, id: { not: user.id } },
      select: { id: true },
    });
    if (exists) return { errors: { email: "このメールアドレスはすでに使用されています。" } };
  }

  const updateData: { loginId: string; email: string; password?: string } = {
    loginId: newLoginId,
    email:   newEmail,
  };

  if (newPassword) {
    updateData.password = await bcrypt.hash(newPassword, 12);
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data:  updateData,
    });
  } catch (e) {
    console.error("[updateUserCredentials] DB error:", e);
    return { errors: { general: "更新中にエラーが発生しました。もう一度お試しください。" } };
  }

  revalidatePath(`/${session.user.tenantSlug}/settings`);
  return { success: true };
}
