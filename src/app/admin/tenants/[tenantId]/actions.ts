"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

function isSuperAdminOrThrow(session: Session | null) {
  if (!session?.user?.isSuperAdmin) throw new Error("権限がありません。");
}

// ── テナント基本情報 + LINE 設定の更新 ─────────────────────────────────

export type UpdateTenantDetailState =
  | { success: true }
  | { success: false; error: string }
  | null;

export async function updateTenantDetailAction(
  _prev: UpdateTenantDetailState,
  formData: FormData,
): Promise<UpdateTenantDetailState> {
  const session = await auth() as Session | null;
  isSuperAdminOrThrow(session);

  const tenantId               = (formData.get("tenantId")               as string) ?? "";
  const name                   = (formData.get("name")                   as string)?.trim() ?? "";
  const plan                   = (formData.get("plan")                   as string) as "standard" | "pro";
  const phone                  = (formData.get("phone")                  as string)?.trim() || null;
  const address                = (formData.get("address")                as string)?.trim() || null;
  const lineChannelSecret      = (formData.get("lineChannelSecret")      as string)?.trim() || null;
  const lineChannelAccessToken = (formData.get("lineChannelAccessToken") as string)?.trim() || null;
  const lineFriendUrl          = (formData.get("lineFriendUrl")          as string)?.trim() || null;

  if (!tenantId || !name) return { success: false, error: "医院名は必須です。" };

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name, plan, phone, address, lineChannelSecret, lineChannelAccessToken, lineFriendUrl },
    });
    revalidatePath(`/admin/tenants/${tenantId}`);
    revalidatePath("/admin/tenants");
    return { success: true };
  } catch {
    return { success: false, error: "更新に失敗しました。" };
  }
}

// ── 契約・請求情報の更新 ──────────────────────────────────────────────

export async function updateContractAction(
  _prev: UpdateTenantDetailState,
  formData: FormData,
): Promise<UpdateTenantDetailState> {
  const session = await auth() as Session | null;
  isSuperAdminOrThrow(session);

  const tenantId       = (formData.get("tenantId")       as string) ?? "";
  const contractType   = (formData.get("contractType")   as string) || "monthly";
  const monthlyPriceStr = (formData.get("monthlyPrice")  as string)?.trim() ?? "0";
  const totalRevenueStr = (formData.get("totalRevenue")  as string)?.trim() ?? "0";
  const contractStartRaw = (formData.get("contractStartAt") as string)?.trim() || null;
  const nextBillingRaw   = (formData.get("nextBillingAt")   as string)?.trim() || null;

  const monthlyPrice = parseInt(monthlyPriceStr, 10) || 0;
  const totalRevenue = parseInt(totalRevenueStr, 10) || 0;
  const contractStartAt = contractStartRaw ? new Date(contractStartRaw) : null;
  const nextBillingAt   = nextBillingRaw   ? new Date(nextBillingRaw)   : null;

  if (!tenantId) return { success: false, error: "tenantId が指定されていません。" };

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { contractType, monthlyPrice, totalRevenue, contractStartAt, nextBillingAt },
    });
    revalidatePath(`/admin/tenants/${tenantId}`);
    revalidatePath("/admin");
    return { success: true };
  } catch {
    return { success: false, error: "更新に失敗しました。" };
  }
}

// ── 運営メモの更新 ────────────────────────────────────────────────────

export async function updateAdminMemoAction(
  _prev: UpdateTenantDetailState,
  formData: FormData,
): Promise<UpdateTenantDetailState> {
  const session = await auth() as Session | null;
  isSuperAdminOrThrow(session);

  const tenantId  = (formData.get("tenantId")  as string) ?? "";
  const adminMemo = (formData.get("adminMemo") as string)?.trim() || null;

  if (!tenantId) return { success: false, error: "tenantId が指定されていません。" };

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { adminMemo },
    });
    revalidatePath(`/admin/tenants/${tenantId}`);
    return { success: true };
  } catch {
    return { success: false, error: "メモの保存に失敗しました。" };
  }
}

// ── 有効/無効トグル ──────────────────────────────────────────────────

export async function toggleTenantStatusAction(
  tenantId: string,
  setActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth() as Session | null;
    isSuperAdminOrThrow(session);
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: setActive } });
    revalidatePath(`/admin/tenants/${tenantId}`);
    revalidatePath("/admin/tenants");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "エラーが発生しました。" };
  }
}
