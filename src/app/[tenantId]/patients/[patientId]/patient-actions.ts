"use server";

/**
 * 患者情報 更新 / 削除 Server Actions
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリの where に tenantId を含めること（絶対ルール）
 *   - 削除はトランザクション内で関連レコードを安全に処理する
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/pin";

// ── 患者更新 ─────────────────────────────────────────────────────────

export type UpdatePatientState = {
  errors?: {
    displayName?:     string;
    nameKana?:        string;
    phone?:           string;
    email?:           string;
    birthDate?:       string;
    emergencyContact?: string;
    memo?:            string;
    general?:         string;
  };
  success?: boolean;
} | null;

export async function updatePatient(
  _prevState: UpdatePatientState,
  formData: FormData
): Promise<UpdatePatientState> {
  const tenantId   = formData.get("tenantId")   as string;
  const tenantSlug = formData.get("tenantSlug") as string;
  const patientId  = formData.get("patientId")  as string;

  if (!tenantId || !tenantSlug || !patientId) {
    return { errors: { general: "テナント情報が不正です。" } };
  }

  const displayName      = (formData.get("displayName")      as string | null)?.trim() ?? "";
  const nameKana         = (formData.get("nameKana")         as string | null)?.trim() || null;
  const phone            = (formData.get("phone")            as string | null)?.trim() || null;
  const email            = (formData.get("email")            as string | null)?.trim() || null;
  const emergencyContact = (formData.get("emergencyContact") as string | null)?.trim() || null;
  const memo             = (formData.get("memo")             as string | null)?.trim() || null;
  const birthYear  = formData.get("birthYear")  as string | null;
  const birthMonth = formData.get("birthMonth") as string | null;
  const birthDay   = formData.get("birthDay")   as string | null;

  const errors: NonNullable<UpdatePatientState>["errors"] = {};

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

  if (phone && !/^[\d\-+() ]{7,20}$/.test(phone)) {
    errors.phone = "正しい電話番号を入力してください（例: 090-1234-5678）。";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "正しいメールアドレスを入力してください。";
  }

  // 生年月日: 既存患者が null の場合は保持（後から設定可能）、入力された場合は必須バリデーション
  let birthDate: Date | null | undefined = undefined; // undefined = 変更しない
  const hasYear  = birthYear  && birthYear  !== "";
  const hasMonth = birthMonth && birthMonth !== "";
  const hasDay   = birthDay   && birthDay   !== "";

  if (hasYear || hasMonth || hasDay) {
    // 一部だけ入力されている場合はエラー
    if (!hasYear || !hasMonth || !hasDay) {
      errors.birthDate = "生年月日は年・月・日をすべて選択してください。";
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
  }
  // 3つとも空 = 変更なし（undefined のまま → update で birthDate フィールドを省略）

  if (Object.keys(errors).length > 0) return { errors };

  try {
    // CLAUDE.md 絶対ルール: tenantId で他テナントの患者へのアクセスを遮断
    const existing = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
      select: { id: true, birthDate: true, accessPin: true },
    });
    if (!existing) return { errors: { general: "患者が見つかりません。" } };

    // 保存後に生年月日が存在する（今回入力 or 既存DB値）かつ accessPin が未設定なら自動発行
    const effectiveBirthDate = birthDate !== undefined ? birthDate : existing.birthDate;
    const pinIsEmpty = !existing.accessPin;
    const rawPin =
      effectiveBirthDate !== null && pinIsEmpty
        ? String(Math.floor(1000 + Math.random() * 9000)) // 1000〜9999
        : null;
    const hashedPin = rawPin ? await hashPin(rawPin) : null;

    await prisma.patient.update({
      where: { id: patientId },
      data: {
        displayName,
        nameKana,
        phone,
        email,
        emergencyContact,
        memo,
        ...(birthDate !== undefined ? { birthDate } : {}),
        ...(hashedPin !== null ? { accessPin: hashedPin } : {}),
      },
    });
  } catch (e: unknown) {
    console.error("[updatePatient] DB error:", e);
    if (
      typeof e === "object" && e !== null && "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { errors: { email: "このメールアドレスはすでに登録されています。" } };
    }
    return { errors: { general: "更新処理中にエラーが発生しました。" } };
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  revalidatePath(`/${tenantSlug}/patients`);
  return { success: true };
}

// ── 患者削除 ─────────────────────────────────────────────────────────

export type DeletePatientResult =
  | { success: true }
  | { success: false; error: string };

export async function deletePatient(
  patientId: string,
  tenantId:  string,
  tenantSlug: string,
): Promise<DeletePatientResult> {
  // CLAUDE.md 絶対ルール: tenantId で他テナントの患者を削除できないよう確認
  const existing = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!existing) {
    return { success: false, error: "患者が見つかりません。" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. カルテに紐づく子レコード（onDelete: Cascade で自動削除されるが明示的に）
      const kartes = await tx.karte.findMany({
        where: { patientId, tenantId },
        select: { id: true },
      });
      const karteIds = kartes.map((k) => k.id);

      if (karteIds.length > 0) {
        await tx.exerciseRecord.deleteMany({ where: { karteId: { in: karteIds } } });
        await tx.karteMedia.deleteMany({    where: { karteId: { in: karteIds } } });
        await tx.karte.deleteMany({         where: { id: { in: karteIds } } });
      }

      // 2. 予約に紐づく子レコード（AppointmentLog, NotificationQueue）
      const appointments = await tx.appointment.findMany({
        where: { patientId, tenantId },
        select: { id: true },
      });
      const apptIds = appointments.map((a) => a.id);

      if (apptIds.length > 0) {
        await tx.appointmentLog.deleteMany({     where: { appointmentId: { in: apptIds } } });
        await tx.notificationQueue.deleteMany({  where: { appointmentId: { in: apptIds } } });
        await tx.appointment.deleteMany({        where: { id: { in: apptIds } } });
      }

      // 3. 患者直結の通知キュー残り
      await tx.notificationQueue.deleteMany({ where: { patientId, tenantId } });

      // 4. lineUserId を先に解放（unique 制約を持つため、削除前に NULL 化して安全に解放）
      await tx.patient.update({
        where: { id: patientId },
        data:  { lineUserId: null, accessToken: null },
      });

      // 5. 患者本体を削除
      await tx.patient.delete({ where: { id: patientId } });
    });
  } catch (e) {
    console.error("[deletePatient] DB error:", e);
    return { success: false, error: "削除処理中にエラーが発生しました。" };
  }

  revalidatePath(`/${tenantSlug}/patients`);
  redirect(`/${tenantSlug}/patients`);
}

// ── マイページ アクセストークン生成 ──────────────────────────────────

export type MypageTokenResult =
  | { success: true; token: string }
  | { success: false; error: string };

export async function generateMypageToken(
  patientId:  string,
  tenantId:   string,
  tenantSlug: string,
): Promise<MypageTokenResult> {
  // CLAUDE.md 絶対ルール: tenantId で他テナントの患者を操作できないよう確認
  const existing = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!existing) {
    return { success: false, error: "患者が見つかりません。" };
  }

  const token = crypto.randomUUID();

  try {
    await prisma.patient.update({
      where: { id: patientId },
      data:  { accessToken: token },
    });
  } catch (e) {
    console.error("[generateMypageToken] DB error:", e);
    return { success: false, error: "トークンの生成に失敗しました。" };
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  return { success: true, token };
}

// ── PIN 再発行 ────────────────────────────────────────────────────────

export type RegeneratePinResult =
  | { success: true;  pin: string }
  | { success: false; error: string };

/**
 * スタッフが患者の暗証番号を再発行する。
 * 新しい4桁PINをbcryptハッシュ化してDBに保存し、平文（一度限り）を返す。
 */
export async function regeneratePin(
  patientId:  string,
  tenantId:   string,
  tenantSlug: string,
): Promise<RegeneratePinResult> {
  const existing = await prisma.patient.findFirst({
    where:  { id: patientId, tenantId },
    select: { id: true },
  });
  if (!existing) {
    return { success: false, error: "患者が見つかりません。" };
  }

  const rawPin    = String(Math.floor(1000 + Math.random() * 9000));
  const hashedPin = await hashPin(rawPin);

  try {
    await prisma.patient.update({
      where: { id: patientId },
      data:  { accessPin: hashedPin },
    });
  } catch (e) {
    console.error("[regeneratePin] DB error:", e);
    return { success: false, error: "PIN の再発行に失敗しました。" };
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  return { success: true, pin: rawPin };
}

export async function revokeMypageToken(
  patientId:  string,
  tenantId:   string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const existing = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!existing) {
    return { success: false, error: "患者が見つかりません。" };
  }

  try {
    await prisma.patient.update({
      where: { id: patientId },
      data:  { accessToken: null },
    });
  } catch (e) {
    console.error("[revokeMypageToken] DB error:", e);
    return { success: false, error: "トークンの失効に失敗しました。" };
  }

  revalidatePath(`/${tenantSlug}/patients/${patientId}`);
  return { success: true };
}
