"use server";

/**
 * システム管理者専用 Server Action ライブラリ
 *
 * registerClinic: Tenant + User + TenantSettings + BusinessHours を
 * 1トランザクションで作成する。
 * 将来「申し込みフォームからの自動登録」でも再利用可能な設計。
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること
 *   - isSuperAdmin セッション確認は呼び出し元の Server Action で行うこと
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// ── デフォルトのフィーチャートグル（standard プラン）──────────────
const DEFAULT_FEATURE_SETTINGS = [
  { featureKey: "karte_mode",          featureValue: "simple"   },
  { featureKey: "training_record",     featureValue: "false"    },
  { featureKey: "staff_assignment",    featureValue: "false"    },
  { featureKey: "multi_staff",         featureValue: "false"    },
  { featureKey: "appointment_buffer",  featureValue: "30"       },
  { featureKey: "insurance_billing",   featureValue: "false"    },
  { featureKey: "ticket_pass",         featureValue: "false"    },
  { featureKey: "cancellation_hours",  featureValue: "24"       },
  { featureKey: "require_approval",    featureValue: "true"     }, // CLAUDE.md: 絶対必須
  { featureKey: "line_notify",         featureValue: "true"     },
] as const;

// 月〜土: 営業 09:00-18:00 / 日: 定休
const DEFAULT_BUSINESS_HOURS = [
  { dayOfWeek: 0, isOpen: false, openTime: "09:00", closeTime: "18:00" }, // 日
  { dayOfWeek: 1, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 月
  { dayOfWeek: 2, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 火
  { dayOfWeek: 3, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 水
  { dayOfWeek: 4, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 木
  { dayOfWeek: 5, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 金
  { dayOfWeek: 6, isOpen: true,  openTime: "09:00", closeTime: "13:00" }, // 土（午前のみ）
] as const;

// ── 型定義 ──────────────────────────────────────────────────────────

export type RegisterClinicInput = {
  /** 医院名（例: "やまだ整骨院"） */
  clinicName: string;
  /** URL用テナントID（例: "yamada" → /yamada/dashboard） */
  subdomain: string;
  /** 管理者ログインID */
  loginId: string;
  /** 管理者メールアドレス */
  email: string;
  /** 初期パスワード（平文。ここで bcrypt ハッシュ化する） */
  password: string;
  /** プラン（省略時: standard） */
  plan?: "standard" | "pro";
  /** 電話番号（任意） */
  phone?: string | null;
  /** 住所（任意） */
  address?: string | null;
};

export type RegisterClinicResult =
  | {
      success: true;
      tenantId:   string;
      tenantName: string;
      subdomain:  string;
      loginId:    string;
      email:      string;
    }
  | {
      success: false;
      error:  string;
      field?: keyof RegisterClinicInput;
    };

// ── バリデーション ───────────────────────────────────────────────────

function validateInput(
  input: RegisterClinicInput
): { field: keyof RegisterClinicInput; message: string } | null {
  if (!input.clinicName.trim())
    return { field: "clinicName", message: "医院名を入力してください。" };
  if (input.clinicName.length > 255)
    return { field: "clinicName", message: "医院名は255文字以内にしてください。" };

  if (!input.subdomain.trim())
    return { field: "subdomain", message: "テナントIDを入力してください。" };
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.subdomain))
    return {
      field: "subdomain",
      message: "テナントIDは小文字英数字とハイフンのみ、3〜63文字で入力してください。",
    };

  if (!input.loginId.trim())
    return { field: "loginId", message: "ログインIDを入力してください。" };
  if (!/^[a-zA-Z0-9\-_]{3,64}$/.test(input.loginId))
    return {
      field: "loginId",
      message: "ログインIDは半角英数字・ハイフン・アンダーバーで3〜64文字にしてください。",
    };

  if (!input.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    return { field: "email", message: "有効なメールアドレスを入力してください。" };

  if (input.password.length < 8)
    return { field: "password", message: "パスワードは8文字以上にしてください。" };

  return null;
}

// ── updateTenant ────────────────────────────────────────────────────

export type UpdateTenantInput = {
  tenantId: string;
  name?:     string;
  plan?:     "standard" | "pro";
  isActive?: boolean;
  /** null を渡すと DB の値をクリアする */
  lineChannelSecret?:      string | null;
  lineChannelAccessToken?: string | null;
  lineFriendUrl?:          string | null;
  phone?:   string | null;
  address?: string | null;
};

export type UpdateTenantResult =
  | { success: true;  tenantId: string; name: string; plan: string; isActive: boolean; }
  | { success: false; error: string; field?: "name" | "plan"; };

export async function updateTenant(input: UpdateTenantInput): Promise<UpdateTenantResult> {
  const { tenantId, name, plan, isActive, lineChannelSecret, lineChannelAccessToken, lineFriendUrl, phone, address } = input;

  if (name !== undefined) {
    if (!name.trim())
      return { success: false, error: "医院名を入力してください。", field: "name" };
    if (name.length > 255)
      return { success: false, error: "医院名は255文字以内にしてください。", field: "name" };
  }

  try {
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data:  {
        ...(name                   !== undefined && { name }),
        ...(plan                   !== undefined && { plan }),
        ...(isActive               !== undefined && { isActive }),
        ...(lineChannelSecret      !== undefined && { lineChannelSecret }),
        ...(lineChannelAccessToken !== undefined && { lineChannelAccessToken }),
        ...(lineFriendUrl          !== undefined && { lineFriendUrl }),
        ...(phone                  !== undefined && { phone }),
        ...(address                !== undefined && { address }),
      },
      select: { id: true, name: true, plan: true, isActive: true },
    });
    return {
      success:  true,
      tenantId: updated.id,
      name:     updated.name,
      plan:     updated.plan,
      isActive: updated.isActive,
    };
  } catch (err) {
    console.error("[updateTenant] DB error:", err);
    return { success: false, error: "更新中にエラーが発生しました。" };
  }
}

// ── registerClinic メイン関数 ────────────────────────────────────────

export async function registerClinic(
  input: RegisterClinicInput
): Promise<RegisterClinicResult> {
  const validationError = validateInput(input);
  if (validationError) {
    return { success: false, error: validationError.message, field: validationError.field };
  }

  const { clinicName, subdomain, loginId, email, password, plan = "standard", phone, address } = input;

  // 重複チェック（トランザクション外で先行確認）
  const [existingSubdomain, existingLoginId, existingEmail] = await Promise.all([
    prisma.tenant.findUnique({ where: { subdomain }, select: { id: true } }),
    prisma.user.findUnique({ where: { loginId },   select: { id: true } }),
    prisma.user.findUnique({ where: { email },     select: { id: true } }),
  ]);

  if (existingSubdomain)
    return { success: false, error: "このテナントIDはすでに使用されています。", field: "subdomain" };
  if (existingLoginId)
    return { success: false, error: "このログインIDはすでに使用されています。", field: "loginId" };
  if (existingEmail)
    return { success: false, error: "このメールアドレスはすでに使用されています。", field: "email" };

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tenant 作成
      const tenant = await tx.tenant.create({
        data: {
          name:      clinicName,
          subdomain,
          plan,
          colorTheme: { primary: "#3B82F6", accent: "#10B981" },
          ...(phone   ? { phone }   : {}),
          ...(address ? { address } : {}),
        },
      });

      // 2. TenantSettings（デフォルトトグル）作成
      await tx.tenantSetting.createMany({
        data: DEFAULT_FEATURE_SETTINGS.map((s) => ({
          tenantId:     tenant.id,
          featureKey:   s.featureKey,
          featureValue: s.featureValue,
        })),
      });

      // 3. BusinessHours 作成
      await tx.businessHour.createMany({
        data: DEFAULT_BUSINESS_HOURS.map((h) => ({
          tenantId:  tenant.id,
          dayOfWeek: h.dayOfWeek,
          isOpen:    h.isOpen,
          openTime:  h.openTime,
          closeTime: h.closeTime,
        })),
      });

      // 4. User（医院管理者）作成
      await tx.user.create({
        data: {
          tenantId: tenant.id,
          loginId,
          email,
          password: hashedPassword,
        },
      });

      return tenant;
    });

    return {
      success:    true,
      tenantId:   result.id,
      tenantName: result.name,
      subdomain:  result.subdomain ?? subdomain,
      loginId,
      email,
    };
  } catch (err) {
    console.error("[registerClinic] DB error:", err);
    return { success: false, error: "登録中にエラーが発生しました。もう一度お試しください。" };
  }
}
