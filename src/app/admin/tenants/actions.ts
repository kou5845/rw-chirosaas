"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { updateTenant } from "@/lib/actions/super-admin";
import type { Session } from "next-auth";

function isSuperAdminOrThrow(session: Session | null) {
  if (!session?.user?.isSuperAdmin) throw new Error("権限がありません。");
}

// ── 医院情報更新 ────────────────────────────────────────────────────

export type UpdateTenantFormState =
  | { success: true  }
  | { success: false; errors: { name?: string; plan?: string; general?: string } }
  | null;

export async function updateTenantAction(
  _prev: UpdateTenantFormState,
  formData: FormData,
): Promise<UpdateTenantFormState> {
  const session = await auth() as Session | null;
  isSuperAdminOrThrow(session);

  const tenantId              = (formData.get("tenantId")              as string | null) ?? "";
  const name                  = (formData.get("name")                  as string | null)?.trim() ?? "";
  const plan                  = (formData.get("plan")                  as string | null) as "standard" | "pro" | null;
  const lineChannelSecret     = (formData.get("lineChannelSecret")     as string | null)?.trim() ?? "";
  const lineChannelAccessToken = (formData.get("lineChannelAccessToken") as string | null)?.trim() ?? "";
  const lineFriendUrl         = (formData.get("lineFriendUrl")         as string | null)?.trim() || null;
  const phone                 = (formData.get("phone")                 as string | null)?.trim() || null;
  const address               = (formData.get("address")               as string | null)?.trim() || null;

  if (!tenantId) return { success: false, errors: { general: "tenantId が指定されていません。" } };

  const result = await updateTenant({
    tenantId,
    name:  name  || undefined,
    plan:  plan  || undefined,
    // 空文字 → null（クリア）、値あり → そのまま保存
    lineChannelSecret:      lineChannelSecret      || null,
    lineChannelAccessToken: lineChannelAccessToken || null,
    lineFriendUrl,
    phone,
    address,
  });

  if (!result.success) {
    const errors: { name?: string; general?: string } = {};
    if (result.field === "name") errors.name = result.error;
    else errors.general = result.error;
    return { success: false, errors };
  }

  revalidatePath("/admin/tenants");
  return { success: true };
}

// ── 有効/無効トグル ──────────────────────────────────────────────────

export async function toggleTenantStatusAction(
  tenantId: string,
  setActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth() as Session | null;
    isSuperAdminOrThrow(session);

    const result = await updateTenant({ tenantId, isActive: setActive });
    if (!result.success) return { success: false, error: result.error };

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "エラーが発生しました。";
    return { success: false, error: message };
  }
}
