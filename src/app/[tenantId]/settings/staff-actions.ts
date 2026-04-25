"use server";

/**
 * スタッフ CRUD Server Actions
 *
 * CLAUDE.md 規約:
 *   - tenantId は auth() セッションから取得（FormData 不使用）
 *   - update/delete 前に { id, tenantId } で所有権確認
 */

import { prisma } from "@/lib/prisma";
import { auth }   from "@/auth";
import { revalidatePath } from "next/cache";

async function getSessionTenant() {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.tenantSlug) return null;
  return { tenantId: session.user.tenantId, tenantSlug: session.user.tenantSlug };
}

export async function addStaffAction(formData: FormData) {
  // CLAUDE.md 絶対ルール: tenantId はセッションから取得
  const t = await getSessionTenant();
  if (!t) return { error: "認証エラーです。再ログインしてください。" };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const role = (formData.get("role") as string | null)?.trim() || null;

  if (!name) return { error: "名前は必須です" };

  try {
    await prisma.staff.create({
      data: { tenantId: t.tenantId, name, role },
    });
    revalidatePath(`/${t.tenantSlug}/settings`);
    return { success: true };
  } catch (e) {
    console.error("[addStaffAction]", e);
    return { error: "スタッフの追加に失敗しました" };
  }
}

export async function updateStaffAction(formData: FormData) {
  const t = await getSessionTenant();
  if (!t) return { error: "認証エラーです。再ログインしてください。" };

  const id   = (formData.get("id")   as string | null)?.trim() ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const role = (formData.get("role") as string | null)?.trim() || null;

  if (!id || !name) return { error: "名前は必須です" };

  // CLAUDE.md 絶対ルール: 操作対象が自テナントのものか確認
  const staff = await prisma.staff.findFirst({
    where: { id, tenantId: t.tenantId },
  });
  if (!staff) return { error: "スタッフが見つかりません" };

  try {
    await prisma.staff.update({ where: { id }, data: { name, role } });
    revalidatePath(`/${t.tenantSlug}/settings`);
    return { success: true };
  } catch (e) {
    console.error("[updateStaffAction]", e);
    return { error: "スタッフの更新に失敗しました" };
  }
}

export async function disableStaffAction(formData: FormData) {
  const t = await getSessionTenant();
  if (!t) return { error: "認証エラーです。再ログインしてください。" };

  const id = (formData.get("id") as string | null)?.trim() ?? "";
  if (!id) return { error: "無効なリクエストです" };

  // CLAUDE.md 絶対ルール: 操作対象が自テナントのものか確認
  const staff = await prisma.staff.findFirst({
    where: { id, tenantId: t.tenantId },
  });
  if (!staff) return { error: "スタッフが見つかりません" };

  try {
    await prisma.staff.update({ where: { id }, data: { isActive: false } });
    revalidatePath(`/${t.tenantSlug}/settings`);
    return { success: true };
  } catch (e) {
    console.error("[disableStaffAction]", e);
    return { error: "スタッフの無効化に失敗しました" };
  }
}
