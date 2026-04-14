"use server";

/**
 * 新規医院登録 Server Action（管理画面用ラッパー）
 *
 * CLAUDE.md 規約:
 *   - isSuperAdmin セッション確認を必ず行うこと
 *   - 実際の登録ロジックは src/lib/actions/super-admin.ts に集約する
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { registerClinic, type RegisterClinicInput } from "@/lib/actions/super-admin";

type FieldErrors = {
  clinicName?: string;
  subdomain?:  string;
  loginId?:    string;
  email?:      string;
  password?:   string;
  plan?:       string;
  general?:    string;
};

export type RegisterClinicActionState =
  | { success: true;  tenantId: string; tenantName: string; subdomain: string; loginId: string; email: string; }
  | { success: false; errors: FieldErrors; }
  | null;

export async function registerClinicAction(
  _prevState: RegisterClinicActionState,
  formData: FormData
): Promise<RegisterClinicActionState> {
  // セキュリティ: SuperAdmin のみ実行可能
  const session = await auth();
  if (!session?.user?.isSuperAdmin) {
    return { success: false, errors: { general: "権限がありません。" } };
  }

  const rawPlan = (formData.get("plan") as string | null)?.trim().toLowerCase();
  const plan = rawPlan === "pro" ? "pro" : "standard";

  const input: RegisterClinicInput = {
    clinicName: (formData.get("clinicName") as string | null)?.trim() ?? "",
    subdomain:  (formData.get("subdomain")  as string | null)?.trim().toLowerCase() ?? "",
    loginId:    (formData.get("loginId")    as string | null)?.trim() ?? "",
    email:      (formData.get("email")      as string | null)?.trim().toLowerCase() ?? "",
    password:   (formData.get("password")   as string | null) ?? "",
    plan,
    phone:   (formData.get("phone")   as string | null)?.trim() || null,
    address: (formData.get("address") as string | null)?.trim() || null,
  };

  const result = await registerClinic(input);

  if (!result.success) {
    const errors: FieldErrors = {};
    if (result.field) {
      (errors as Record<string, string>)[result.field] = result.error;
    } else {
      errors.general = result.error;
    }
    return { success: false, errors };
  }

  revalidatePath("/admin/tenants");

  return {
    success:    true,
    tenantId:   result.tenantId,
    tenantName: result.tenantName,
    subdomain:  result.subdomain,
    loginId:    result.loginId,
    email:      result.email,
  };
}
