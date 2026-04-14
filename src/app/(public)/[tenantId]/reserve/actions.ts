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

// ── 利用可能なタイムスロット取得 ─────────────────────────────────────

export async function getAvailableSlots(
  tenantSlug: string,
  dateStr: string  // "YYYY-MM-DD"
): Promise<{ slots: string[]; error?: string }> {
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, slotInterval: true, maxCapacity: true },
  });
  if (!tenant) return { slots: [], error: "医院が見つかりません。" };

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
  for (let t = openTotal; t + tenant.slotInterval <= closeTotal; t += tenant.slotInterval) {
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
    const slotEnd   = new Date(slotStart.getTime() + tenant.slotInterval * 60 * 1000);
    const count = existing.filter(
      (a) => a.startAt < slotEnd && a.endAt > slotStart
    ).length;
    return count < tenant.maxCapacity;
  });

  return { slots: available };
}

// ── 予約送信 ─────────────────────────────────────────────────────────

export type PublicReservationState = {
  success?: boolean;
  errors?: { general?: string; name?: string; phone?: string; email?: string };
} | null;

export async function submitPublicReservation(
  _prev: PublicReservationState,
  formData: FormData
): Promise<PublicReservationState> {
  const tenantSlug = (formData.get("tenantSlug") as string | null)?.trim() ?? "";
  const dateStr    = (formData.get("date")       as string | null)?.trim() ?? "";
  const timeStr    = (formData.get("time")       as string | null)?.trim() ?? "";
  const name       = (formData.get("name")       as string | null)?.trim() ?? "";
  const phone      = (formData.get("phone")      as string | null)?.trim() ?? "";
  const email      = (formData.get("email")      as string | null)?.trim() || null;

  // ── 入力バリデーション ──
  if (!tenantSlug || !dateStr || !timeStr) {
    return { errors: { general: "選択内容が不足しています。最初からやり直してください。" } };
  }
  if (!name)  return { errors: { name:  "お名前を入力してください。" } };
  if (!phone) return { errors: { phone: "電話番号を入力してください。" } };
  if (!/^[\d\-\s]{10,13}$/.test(phone)) {
    return { errors: { phone: "正しい電話番号を入力してください（例: 090-1234-5678）。" } };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { errors: { email: "正しいメールアドレスを入力してください。" } };
  }

  // ── DB 照合でテナントIDを確定 ──
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, slotInterval: true },
  });
  if (!tenant) return { errors: { general: "医院情報が見つかりません。" } };

  // ── 日時を構築 ──
  const startAt = new Date(`${dateStr}T${timeStr}:00+09:00`);
  if (isNaN(startAt.getTime())) {
    return { errors: { general: "日時の形式が正しくありません。" } };
  }
  const endAt = new Date(startAt.getTime() + tenant.slotInterval * 60 * 1000);

  // ── 患者を電話番号で検索（正規化比較） → 未登録なら新規作成 ──
  const normalizedInput = phone.replace(/[\-\s]/g, "");

  const allPatients = await prisma.patient.findMany({
    where:  { tenantId: tenant.id, isActive: true },
    select: { id: true, phone: true, email: true },
  });
  const matched = allPatients.find(
    (p) => p.phone && p.phone.replace(/[\-\s]/g, "") === normalizedInput
  );

  let patientId: string;
  if (matched) {
    patientId = matched.id;
    // 既存患者にメールが未設定で今回入力された場合は更新
    if (email && !matched.email) {
      await prisma.patient.update({
        where: { id: matched.id },
        data:  { email },
      }).catch(() => {
        // unique 制約違反（別患者が同メールを持つ）は無視して続行
      });
    }
  } else {
    const created = await prisma.patient.create({
      data: {
        tenantId:    tenant.id,
        displayName: name,
        phone:       phone,
        email:       email ?? undefined,
      },
    });
    patientId = created.id;
  }

  // ── 共通サービスに委譲 ──
  const result = await createReservation({
    tenantId:    tenant.id,
    patientId,
    menuName:    "施術",           // 公開フォームからはデフォルトメニュー
    durationMin: tenant.slotInterval,
    price:       0,
    startAt,
    endAt,
  });

  if (!result.success) {
    return { errors: { general: result.error } };
  }

  return { success: true };
}
