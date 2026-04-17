"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function addStaffAction(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) return { error: "セッションが不正です" };
  const name = formData.get("name") as string;
  const role = formData.get("role") as string;

  if (!name || name.trim() === "") {
    return { error: "名前は必須です" };
  }

  try {
    await prisma.staff.create({
      data: {
        tenantId,
        name: name.trim(),
        role: role ? role.trim() : null,
      },
    });

    revalidatePath(`/[tenantId]/settings`, "page");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to add staff:", error);
    return { error: "スタッフの追加に失敗しました" };
  }
}

export async function updateStaffAction(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) return { error: "セッションが不正です" };
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const role = formData.get("role") as string;

  if (!id || !name || name.trim() === "") {
    return { error: "名前は必須です" };
  }

  try {
    // 테넌트 경계 확인
    const staff = await prisma.staff.findFirst({
      where: { id, tenantId },
    });
    
    if (!staff) {
      return { error: "スタッフが見つかりません" };
    }

    await prisma.staff.update({
      where: { id },
      data: {
        name: name.trim(),
        role: role ? role.trim() : null,
      },
    });

    revalidatePath(`/[tenantId]/settings`, "page");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to update staff:", error);
    return { error: "スタッフの更新に失敗しました" };
  }
}

export async function disableStaffAction(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) return { error: "セッションが不正です" };
  const id = formData.get("id") as string;

  if (!id) return { error: "無効なリクエストです" };

  try {
    const staff = await prisma.staff.findFirst({
      where: { id, tenantId },
    });
    
    if (!staff) {
      return { error: "スタッフが見つかりません" };
    }

    await prisma.staff.update({
      where: { id },
      data: { isActive: false },
    });

    revalidatePath(`/[tenantId]/settings`, "page");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to disable staff:", error);
    return { error: "スタッフの無効化に失敗しました" };
  }
}
