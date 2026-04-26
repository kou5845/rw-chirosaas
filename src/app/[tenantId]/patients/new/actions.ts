"use server";

/**
 * 患者新規登録 Server Action
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - tenantId はセッション由来の値のみ使用（FormData 不使用）
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth }   from "@/auth";
import { hashPin } from "@/lib/pin";

export type CreatePatientState = {
  errors?: {
    displayName?: string;
    nameKana?: string;
    phone?: string;
    email?: string;
    birthDate?: string;
    general?: string;
  };
} | null;

export async function createPatient(
  _prevState: CreatePatientState,
  formData: FormData
): Promise<CreatePatientState> {
  // CLAUDE.md 絶対ルール: tenantId はセッションから取得（FormData 不使用）
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.tenantSlug) {
    return { errors: { general: "認証エラーです。再ログインしてください。" } };
  }
  const tenantId   = session.user.tenantId;
  const tenantSlug = session.user.tenantSlug;

  const displayName  = (formData.get("displayName") as string | null)?.trim() ?? "";
  const nameKana     = (formData.get("nameKana")    as string | null)?.trim() || null;
  const phone        = (formData.get("phone")       as string | null)?.trim() ?? "";
  const email        = (formData.get("email")       as string | null)?.trim() || null;
  const birthYear    = formData.get("birthYear")  as string | null;
  const birthMonth   = formData.get("birthMonth") as string | null;
  const birthDay     = formData.get("birthDay")   as string | null;

  // ── バリデーション ──
  const errors: NonNullable<CreatePatientState>["errors"] = {};

  if (!displayName) {
    errors.displayName = "氏名（漢字）は必須です。";
  } else if (displayName.length > 255) {
    errors.displayName = "氏名は255文字以内で入力してください。";
  }

  if (!nameKana) {
    errors.nameKana = "ふりがなは必須です。";
  } else if (!/^[ぁ-ん\s　]+$/.test(nameKana)) {
    errors.nameKana = "ふりがなはひらがなで入力してください。";
  }

  if (!phone) {
    errors.phone = "電話番号は必須です。";
  } else if (!/^[\d\-+() ]{7,20}$/.test(phone)) {
    errors.phone = "正しい電話番号を入力してください（例: 090-1234-5678）。";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "正しいメールアドレスを入力してください。";
  }

  // 生年月日: 必須（マイページログインID として使用）
  let birthDate: Date | null = null;
  const hasYear  = birthYear  && birthYear  !== "";
  const hasMonth = birthMonth && birthMonth !== "";
  const hasDay   = birthDay   && birthDay   !== "";

  if (!hasYear || !hasMonth || !hasDay) {
    errors.birthDate = "生年月日は必須です。年・月・日をすべて選択してください。";
  } else {
    const y = parseInt(birthYear!, 10);
    const m = parseInt(birthMonth!, 10);
    const d = parseInt(birthDay!, 10);
    const candidate = new Date(y, m - 1, d);
    if (
      candidate.getFullYear() !== y ||
      candidate.getMonth() !== m - 1 ||
      candidate.getDate() !== d
    ) {
      errors.birthDate = "存在しない日付です。正しい生年月日を選択してください。";
    } else {
      birthDate = candidate;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // 4桁のランダムPINを生成してハッシュ化（マイページログインPASS として使用）
  const rawPin    = String(Math.floor(1000 + Math.random() * 9000)); // 1000〜9999
  const accessPin = await hashPin(rawPin);

  let newPatientId: string;

  try {
    // CLAUDE.md 絶対ルール: tenantId フィルタ必須
    // accessToken・accessPin を登録時に自動生成
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        displayName,
        nameKana,
        phone:       phone || null,
        email,
        birthDate,
        isActive:    true,
        accessToken: crypto.randomUUID(),
        accessPin,
      },
      select: { id: true },
    });
    newPatientId = patient.id;
  } catch (e: unknown) {
    console.error("[createPatient] DB error:", e);
    // メールアドレス重複（unique constraint）
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { errors: { email: "このメールアドレスはすでに登録されています。" } };
    }
    return { errors: { general: "登録処理中にエラーが発生しました。もう一度お試しください。" } };
  }

  redirect(`/${tenantSlug}/patients/${newPatientId}`);
}
