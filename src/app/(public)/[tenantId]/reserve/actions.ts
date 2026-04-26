"use server";

/**
 * 公開予約フォーム Server Actions
 *
 * CLAUDE.md 規約:
 *   - tenantId は DB 照合（subdomain）で確定する
 *   - 予約ロジックは reservationService に委譲
 *   - 患者が未登録の場合は電話番号・氏名で新規作成
 */

import { prisma } from "@/lib/prisma";
import { createReservation } from "@/services/reservationService";
import { ensurePatientAccessToken } from "@/lib/mypage";
import { hashPin } from "@/lib/pin";

// ── 利用可能なタイムスロット取得 ─────────────────────────────────────

export async function getAvailableSlots(
  tenantSlug:   string,
  dateStr:      string,  // "YYYY-MM-DD"
  durationMin?: number,  // 選択メニューの所要時間（未指定時は slotInterval を使用）
  intervalMin?: number,  // インターバル時間（バッファ）
): Promise<{ slots: string[]; error?: string }> {
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, slotInterval: true, maxCapacity: true },
  });
  if (!tenant) return { slots: [], error: "医院が見つかりません。" };

  // 実際のブロック幅: 所要時間 + インターバル
  const effectiveDuration = durationMin && durationMin > 0 ? durationMin : tenant.slotInterval;
  const effectiveInterval = intervalMin && intervalMin > 0 ? intervalMin : 0;
  const blockMin = effectiveDuration + effectiveInterval;

  // 曜日を JST で判定（dateStr は JST 基準の日付文字列）
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0=日〜6=土

  const bh = await prisma.businessHour.findUnique({
    where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
  });
  if (!bh || !bh.isOpen) return { slots: [] };

  // スロット一覧を生成（openTime から closeTime まで slotInterval 刻み）
  const [openH,  openM]  = bh.openTime.split(":").map(Number);
  const [closeH, closeM] = bh.closeTime.split(":").map(Number);
  const openTotal  = openH  * 60 + openM;
  const closeTotal = closeH * 60 + closeM;

  const allSlots: string[] = [];
  for (let t = openTotal; t + blockMin <= closeTotal; t += tenant.slotInterval) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm  = String(t % 60).padStart(2, "0");
    allSlots.push(`${hh}:${mm}`);
  }

  // 既存予約を取得して maxCapacity に達したスロットを除外
  const dayStart = new Date(`${dateStr}T00:00:00+09:00`);
  const dayEnd   = new Date(`${dateStr}T23:59:59+09:00`);

  const existing = await prisma.appointment.findMany({
    where: {
      tenantId: tenant.id,
      status:   { in: ["pending", "confirmed"] },
      startAt:  { gte: dayStart, lte: dayEnd },
    },
    select: { startAt: true, endAt: true },
  });

  const available = allSlots.filter((slot) => {
    const slotStart = new Date(`${dateStr}T${slot}:00+09:00`);
    const slotEnd   = new Date(slotStart.getTime() + blockMin * 60 * 1000);
    const count = existing.filter(
      (a) => a.startAt < slotEnd && a.endAt > slotStart
    ).length;
    return count < tenant.maxCapacity;
  });

  return { slots: available };
}

// ── 患者照合チェック ────────────────────────────────────────────────

export type PatientCheckStatus = "matched" | "name_mismatch" | "not_found";

export type PatientCheckResult = {
  status: PatientCheckStatus;
  // registeredName は削除（ユーザー列挙 / PII 漏洩防止）
};

/**
 * 電話番号で患者を検索し、名前の一致も確認する。
 * 予約送信前に Client から呼び出して警告を表示するために使う。
 * 患者は作成しない（副作用なし）。
 */
export async function checkPatientMatch(
  tenantSlug: string,
  phone:      string,
  name:       string,
): Promise<PatientCheckResult> {
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { status: "not_found" };

  const normalizedInput = phone.replace(/[\-\s]/g, "");

  const allPatients = await prisma.patient.findMany({
    where:  { tenantId: tenant.id, isActive: true },
    select: { phone: true, displayName: true },
  });

  const matched = allPatients.find(
    (p) => p.phone && p.phone.replace(/[\-\s]/g, "") === normalizedInput
  );

  if (!matched) return { status: "not_found" };

  // 名前の正規化比較（スペース除去・小文字化）
  // registeredName は返さない（ユーザー列挙 / PII 漏洩防止）
  const norm = (s: string) => s.replace(/[\s　]/g, "").toLowerCase();
  if (norm(name) !== norm(matched.displayName ?? "")) {
    return { status: "name_mismatch" };
  }

  return { status: "matched" };
}

// ── 予約送信 ─────────────────────────────────────────────────────────

export type PublicReservationState = {
  success?: boolean;
  /** 今回の予約で新規患者として登録された場合 true（完了画面でマイページリンクを表示するために使用） */
  isNewPatient?: boolean;
  /**
   * 同テナント内に同じ電話番号の登録済み患者が存在する場合 true。
   * 別テナントに同じ患者が存在する場合は false（マルチテナント対応）。
   * この場合は「2回目以降の方」フローへ誘導する。
   */
  existingPatient?: boolean;
  errors?: {
    general?:   string;
    name?:      string;
    nameKana?:  string;
    birthDate?: string;
    phone?:     string;
    email?:     string;
  };
} | null;

// アプリ BaseURL（通知メール内リンク用）
function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

export async function submitPublicReservation(
  _prev: PublicReservationState,
  formData: FormData
): Promise<PublicReservationState> {
  const tenantSlug    = (formData.get("tenantSlug")    as string | null)?.trim() ?? "";
  const dateStr       = (formData.get("date")          as string | null)?.trim() ?? "";
  const timeStr       = (formData.get("time")          as string | null)?.trim() ?? "";
  const name          = (formData.get("name")          as string | null)?.trim() ?? "";
  const nameKana      = (formData.get("nameKana")      as string | null)?.trim() || null;
  const phone         = (formData.get("phone")         as string | null)?.trim() ?? "";
  const email         = (formData.get("email")         as string | null)?.trim() || null;
  const birthDateRaw  = (formData.get("birthDate")     as string | null)?.trim() ?? "";
  const menuNameRaw   = (formData.get("menuName")      as string | null)?.trim() || null;
  const durationRaw   = (formData.get("durationMin")   as string | null)?.trim() ?? "";
  const intervalRaw   = (formData.get("intervalMin")   as string | null)?.trim() ?? "";
  const priceRaw      = (formData.get("price")         as string | null)?.trim() ?? "";

  // patientId が付いている場合はトリアージログイン済み（2回目以降）
  const patientIdParam = (formData.get("patientId") as string | null)?.trim() || null;

  // ── 入力バリデーション ──
  if (!tenantSlug || !dateStr || !timeStr) {
    return { errors: { general: "選択内容が不足しています。最初からやり直してください。" } };
  }
  if (!name)     return { errors: { name:     "お名前を入力してください。" } };
  if (!nameKana) return { errors: { nameKana: "ふりがなを入力してください。" } };
  if (nameKana && !/^[ぁ-ん\s　]+$/.test(nameKana)) {
    return { errors: { nameKana: "ふりがなはひらがなで入力してください。" } };
  }
  if (!phone) return { errors: { phone: "電話番号を入力してください。" } };
  if (!/^[\d\-\s]{10,13}$/.test(phone)) {
    return { errors: { phone: "正しい電話番号を入力してください（例: 090-1234-5678）。" } };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { errors: { email: "正しいメールアドレスを入力してください。" } };
  }

  // 生年月日: 新規患者フォーム（patientIdParam なし）の場合のみ必須
  if (!patientIdParam) {
    if (!/^\d{8}$/.test(birthDateRaw)) {
      return { errors: { birthDate: "生年月日を8桁の数字で入力してください（例: 19830405）。" } };
    }
  }

  // ── DB 照合でテナントIDを確定 ──
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, name: true, slotInterval: true, phone: true, address: true },
  });
  if (!tenant) return { errors: { general: "医院情報が見つかりません。" } };

  // ── メニュー情報を解決 ──
  const menuName   = menuNameRaw ?? "施術";
  const durationParsed = durationRaw ? parseInt(durationRaw, 10) : NaN;
  const priceParsed    = priceRaw   ? parseInt(priceRaw,    10) : NaN;
  const durationMin = !isNaN(durationParsed) && durationParsed > 0 ? durationParsed : tenant.slotInterval;
  const price       = !isNaN(priceParsed)    && priceParsed    >= 0 ? priceParsed   : 0;

  // ── インターバル（準備時間）──
  const intervalParsed = intervalRaw ? parseInt(intervalRaw, 10) : NaN;
  const intervalMin    = !isNaN(intervalParsed) && intervalParsed > 0 ? intervalParsed : 0;

  // ── 日時を構築 ──
  const startAt = new Date(`${dateStr}T${timeStr}:00+09:00`);
  if (isNaN(startAt.getTime())) {
    return { errors: { general: "日時の形式が正しくありません。" } };
  }
  const endAt = new Date(startAt.getTime() + (durationMin + intervalMin) * 60 * 1000);

  // ── 患者識別（3段階ガード）──────────────────────────────────────────
  let patientId:   string;
  let isNewPatient = false;
  let newPatientPin: string | null = null;

  // Guard 1: patientId 指定あり（トリアージログイン済み or ロック患者）
  if (patientIdParam) {
    const verified = await prisma.patient.findFirst({
      where:  { id: patientIdParam, tenantId: tenant.id, isActive: true },
      select: { id: true },
    });
    if (!verified) {
      return { errors: { general: "患者情報の確認に失敗しました。最初からやり直してください。" } };
    }
    patientId = verified.id;
    ensurePatientAccessToken(verified.id, tenant.id).catch((e) => {
      console.error("[reserve/actions] accessToken 自動発行失敗:", e);
    });

  } else {
    // Guard 2: 電話番号で既存患者を検索
    const normalizedInput = phone.replace(/[\-\s]/g, "");

    const allPatients = await prisma.patient.findMany({
      where:  { tenantId: tenant.id, isActive: true },
      select: { id: true, phone: true, email: true },
    });
    const matchedByPhone = allPatients.find(
      (p) => p.phone && p.phone.replace(/[\-\s]/g, "") === normalizedInput
    );
    const matchedByEmail = email
      ? allPatients.find((p) => p.email && p.email.toLowerCase() === email.toLowerCase())
      : undefined;

    if (matchedByPhone || matchedByEmail) {
      // 同テナントに登録済み患者が存在する → 「2回目以降の方」フローへ誘導
      // ※ どちらのフィールドが一致したかは返さない（ユーザー列挙防止）
      return { existingPatient: true };

    } else {
      // Guard 3: 新規患者作成
      isNewPatient = true;

      const y = parseInt(birthDateRaw.slice(0, 4), 10);
      const m = parseInt(birthDateRaw.slice(4, 6), 10);
      const d = parseInt(birthDateRaw.slice(6, 8), 10);
      const birthDate = new Date(Date.UTC(y, m - 1, d));

      // 4桁のランダム暗証番号を生成してハッシュ化（1000〜9999）
      const rawPin    = String(Math.floor(1000 + Math.random() * 9000));
      newPatientPin   = rawPin; // メール通知用に平文を保持（ハッシュは保存しない）
      const accessPin = await hashPin(rawPin);

      const created = await prisma.patient.create({
        data: {
          tenantId:    tenant.id,
          displayName: name,
          nameKana:    nameKana ?? undefined,
          phone:       phone,
          email:       email ?? undefined,
          birthDate:   birthDate,
          accessPin,   // bcrypt ハッシュ
          accessToken: crypto.randomUUID(),
        },
      });
      patientId = created.id;
    }
  }

  // ── 共通サービスに委譲（新規患者の場合は登録完了メールも同時送信）──
  const result = await createReservation({
    tenantId: tenant.id,
    patientId,
    menuName,
    durationMin,
    price,
    startAt,
    endAt,
    // 新規患者のみ: 受付メールと同時に PIN コード通知メールを送信する
    // 既存患者（Guard 1/2）では undefined のまま渡さず重複送信しない
    ...(isNewPatient && email && newPatientPin ? {
      newPatientWelcome: {
        to:                 email,
        pin:                newPatientPin,
        birthDateFormatted: birthDateRaw,
        loginUrl:           `${getBaseUrl()}/${tenantSlug}/mypage/login`,
      },
    } : {}),
  });

  if (!result.success) {
    return { errors: { general: result.error } };
  }

  return { success: true, isNewPatient };
}
