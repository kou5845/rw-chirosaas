/**
 * 予約作成サービス — 管理画面・公開フォーム 共通ロジック
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - 予約ステータスは pending が初期値（require_approval 全テナント必須）
 *   - tenantId は呼び出し元が DB 照合済みの値を渡すこと
 *   - このファイルは "use server" を付与しない（Server Action ではなくサービス層）
 *
 * 役割分担:
 *   - このサービス : maxCapacity / 営業時間バリデーション・DB保存・LINE即時送信
 *   - 呼び出し元   : フォームパース・入力バリデーション・revalidatePath
 */

import { prisma } from "@/lib/prisma";
import { messagingApi } from "@line/bot-sdk";
import { buildReceptionMessage, buildConfirmationMessage, buildRejectionMessage } from "@/lib/line";
import { sendReservationEmail, sendRejectionEmail } from "@/lib/email";
import { ensurePatientAccessToken, buildMypageUrl } from "@/lib/mypage";

// ── 型定義 ──────────────────────────────────────────────────────────

export type CreateReservationInput = {
  /** DB照合済みのテナントID（リクエストボディの生値を渡さないこと） */
  tenantId:    string;
  patientId:   string;
  menuName:    string;
  durationMin: number;
  price:       number;
  startAt:     Date;
  endAt:       Date;
  staffId?:    string | null;
  note?:       string | null;
};

export type CreateReservationResult =
  | { success: true;  appointmentId: string }
  | { success: false; error: string; field?: "capacity" | "businessHours" | "general" };

// ── JST の "HH:MM" 文字列を返すユーティリティ ───────────────────────

function toJSTHHMM(utcDate: Date): string {
  const jst = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  const hh   = String(jst.getUTCHours()).padStart(2, "0");
  const mm   = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toJSTDayOfWeek(utcDate: Date): number {
  const jst = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCDay(); // 0=日, 1=月, ..., 6=土
}

// ── メイン関数 ────────────────────────────────────────────────────────

export async function createReservation(
  input: CreateReservationInput
): Promise<CreateReservationResult> {
  const { tenantId, patientId, menuName, durationMin, price, startAt, endAt, staffId, note } = input;

  // ── 1. テナント情報取得（maxCapacity + LINE認証情報）──────────────
  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: {
      maxCapacity:            true,
      name:                   true,
      phone:                  true,
      address:                true,
      lineChannelAccessToken: true,
      lineEnabled:            true,
      emailEnabled:           true,
      emailConfirmMsg:        true,
      lineConfirmMsg:         true,
    },
  });
  if (!tenant) {
    return { success: false, error: "テナントが見つかりません。", field: "general" };
  }

  // ── 2. 同時予約上限チェック（maxCapacity）────────────────────────
  const overlapping = await prisma.appointment.count({
    where: {
      tenantId,
      status:  { in: ["pending", "confirmed"] },
      startAt: { lt: endAt },
      endAt:   { gt: startAt },
    },
  });
  if (overlapping >= tenant.maxCapacity) {
    return {
      success: false,
      error:   `この時間帯はすでに${tenant.maxCapacity}件の予約が入っています（上限: ${tenant.maxCapacity}件）。`,
      field:   "capacity",
    };
  }

  // ── 3. 営業時間チェック ─────────────────────────────────────────
  const dayOfWeek  = toJSTDayOfWeek(startAt);
  const startHHMM  = toJSTHHMM(startAt);
  const endHHMM    = toJSTHHMM(endAt);

  const bh = await prisma.businessHour.findUnique({
    where: { tenantId_dayOfWeek: { tenantId, dayOfWeek } },
  });
  if (bh) {
    if (!bh.isOpen) {
      return { success: false, error: "その曜日は定休日です。", field: "businessHours" };
    }
    if (startHHMM < bh.openTime || endHHMM > bh.closeTime) {
      return {
        success: false,
        error:   `営業時間（${bh.openTime}〜${bh.closeTime}）外の時間帯です。`,
        field:   "businessHours",
      };
    }
  }

  // ── 4. 予約 DB 保存（status=pending 固定・CLAUDE.md 絶対ルール）──
  let appointmentId: string;
  try {
    const created = await prisma.appointment.create({
      data: {
        tenantId,
        patientId,
        staffId:    staffId ?? null,
        menuName,
        durationMin,
        price,
        status:  "pending",
        startAt,
        endAt,
        note:    note ?? null,
      },
    });
    appointmentId = created.id;
  } catch (e) {
    console.error("[reservationService] DB error:", e);
    return { success: false, error: "予約の作成中にエラーが発生しました。", field: "general" };
  }

  // ── 5. 受付通知（lineEnabled / emailEnabled フラグに従って送信）──
  // 失敗しても予約作成の成功には影響させない
  const patient = await prisma.patient.findUnique({
    where:  { id: patientId },
    select: { lineUserId: true, displayName: true, email: true },
  });

  // ── LINE 受付通知 ──
  if (tenant.lineEnabled && patient?.lineUserId) {
    try {
      const channelAccessToken =
        tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

      if (channelAccessToken) {
        const client = new messagingApi.MessagingApiClient({ channelAccessToken });
        const text   = buildReceptionMessage({
          tenantName:  tenant.name,
          patientName: patient.displayName,
          menuName,
          durationMin,
          price,
          startAt,
          endAt,
          phone:   tenant.phone,
          address: tenant.address,
          customMessage: tenant.lineConfirmMsg,
        });
        await client.pushMessage({
          to:       patient.lineUserId,
          messages: [{ type: "text", text }],
        });
        console.log(`[reservationService] LINE受付通知送信: patientId=${patientId}`);
      }
    } catch (e) {
      console.error("[reservationService] LINE push error:", e);
    }
  }

  // ── [DEBUG] 通知フラグ確認 ────────────────────────────────────────
  console.log("[reservationService] createReservation 通知フラグ");
  console.log("  tenant.lineEnabled:", tenant.lineEnabled);
  console.log("  tenant.emailEnabled:", tenant.emailEnabled);
  console.log("  patient.email:", patient?.email ?? "(未設定)");
  console.log("  patient.lineUserId:", patient?.lineUserId ?? "(未設定)");
  // ── [DEBUG END] ────────────────────────────────────────────────

  // ── メール受付通知 ──
  if (tenant.emailEnabled && patient?.email) {
    try {
      await sendReservationEmail({
        to:            patient.email,
        type:          "reception",
        tenantName:    tenant.name,
        patientName:   patient.displayName,
        menuName,
        durationMin,
        price,
        startAt,
        endAt,
        phone:         tenant.phone,
        address:       tenant.address,
        customMessage: tenant.emailConfirmMsg,
      });
      console.log(`[reservationService] メール受付通知送信: patientId=${patientId}`);
    } catch (e) {
      console.error("[reservationService] メール送信エラー:", e);
    }
  }

  return { success: true, appointmentId };
}

// ── ステータス更新サービス ────────────────────────────────────────────

export type UpdateReservationStatusInput = {
  /** DB照合済みの予約ID */
  appointmentId:    string;
  /** DB照合済みのテナントID（CLAUDE.md 絶対ルール） */
  tenantId:         string;
  /** 変更後のステータス（pending → confirmed のみ許可） */
  newStatus:        "confirmed";
  /** AppointmentLog に記録する changedById（Profile.id） */
  changedById:      string;
  /** 変更理由メモ（任意） */
  note?:            string;
  /**
   * true（デフォルト）: lineEnabled / emailEnabled フラグに従い通知を送信
   * false: DB更新とログ記録のみ行い、通知を送信しない
   */
  sendNotification?: boolean;
};

export type UpdateReservationStatusResult =
  | { success: true }
  | { success: false; error: string };

/**
 * 予約ステータスを confirmed に更新し、LINE 確定通知を即時送信する。
 *
 * CLAUDE.md 規約:
 *   - ステータスは pending → confirmed の順のみ許可（巻き戻し禁止）
 *   - ステータス変更は必ず AppointmentLog に記録する（絶対ルール）
 *   - LINE 送信失敗は予約確定の成否に影響させない
 */
export async function updateReservationStatus(
  input: UpdateReservationStatusInput
): Promise<UpdateReservationStatusResult> {
  const { appointmentId, tenantId, newStatus, changedById, note } = input;
  const shouldNotify = input.sendNotification !== false; // デフォルト true

  // ── 1. 予約・患者・テナント情報を一括取得 ─────────────────────────
  const appointment = await prisma.appointment.findFirst({
    where:  { id: appointmentId, tenantId, status: "pending" },
    select: {
      id:          true,
      patientId:   true,
      menuName:    true,
      durationMin: true,
      price:       true,
      startAt:     true,
      endAt:       true,
      patient: {
        select: { displayName: true, lineUserId: true, email: true, accessToken: true },
      },
    },
  });

  if (!appointment) {
    return { success: false, error: "予約が見つからないか、すでに処理済みです。" };
  }

  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { name: true, phone: true, address: true, subdomain: true, lineChannelAccessToken: true, lineEnabled: true, emailEnabled: true, emailConfirmMsg: true, lineConfirmMsg: true },
  });
  if (!tenant) {
    return { success: false, error: "テナントが見つかりません。" };
  }

  const now = new Date();

  // ── 2. DB トランザクション: ステータス更新 + ログ記録 ──────────────
  try {
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id: appointmentId },
        data:  {
          status:      newStatus,
          confirmedAt: now,
          confirmedBy: changedById,
        },
      }),
      // CLAUDE.md 絶対ルール: ステータス変更は必ず AppointmentLog に記録
      prisma.appointmentLog.create({
        data: {
          appointmentId,
          oldStatus:   "pending",
          newStatus:   "confirmed",
          changedById,
          note:        note ?? "管理画面より承認",
        },
      }),
    ]);
  } catch (e) {
    console.error("[reservationService] updateReservationStatus DB error:", e);
    return { success: false, error: "承認処理中にエラーが発生しました。" };
  }

  // ── 3. マイページURL構築（確定通知に添付する）────────────────────
  let mypageUrl: string | null = null;
  try {
    const token = appointment.patient.accessToken
      ?? await ensurePatientAccessToken(appointment.patientId, tenantId);
    if (tenant.subdomain) {
      mypageUrl = buildMypageUrl(tenant.subdomain, token);
    }
  } catch (e) {
    console.error("[reservationService] mypageUrl 構築失敗:", e);
  }

  // ── 4. 確定通知（lineEnabled / emailEnabled フラグに従って送信）──
  // 送信失敗は予約確定の成否に影響させない

  // ── LINE 確定通知 ──
  if (shouldNotify && tenant.lineEnabled && appointment.patient.lineUserId) {
    try {
      const channelAccessToken =
        tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

      if (channelAccessToken) {
        const client = new messagingApi.MessagingApiClient({ channelAccessToken });
        const text   = buildConfirmationMessage({
          tenantName:  tenant.name,
          patientName: appointment.patient.displayName,
          menuName:    appointment.menuName,
          durationMin: appointment.durationMin,
          price:       appointment.price,
          startAt:     appointment.startAt,
          endAt:       appointment.endAt,
          phone:         tenant.phone,
          address:       tenant.address,
          mypageUrl,
          customMessage: tenant.lineConfirmMsg,
        });
        await client.pushMessage({
          to:       appointment.patient.lineUserId,
          messages: [{ type: "text", text }],
        });
        console.log(`[reservationService] LINE確定通知送信: appointmentId=${appointmentId}`);
      }
    } catch (e) {
      console.error("[reservationService] LINE confirmation push error:", e);
    }
  }

  // ── [DEBUG] 通知フラグ確認 ────────────────────────────────────────
  console.log("[reservationService] updateReservationStatus 通知フラグ");
  console.log("  tenant.lineEnabled:", tenant.lineEnabled);
  console.log("  tenant.emailEnabled:", tenant.emailEnabled);
  console.log("  patient.email:", appointment.patient.email ?? "(未設定)");
  console.log("  patient.lineUserId:", appointment.patient.lineUserId ?? "(未設定)");
  console.log("  mypageUrl:", mypageUrl ?? "(未生成)");
  // ── [DEBUG END] ────────────────────────────────────────────────

  // ── メール確定通知 ──
  if (shouldNotify && tenant.emailEnabled && appointment.patient.email) {
    try {
      await sendReservationEmail({
        to:            appointment.patient.email,
        type:          "confirmation",
        tenantName:    tenant.name,
        patientName:   appointment.patient.displayName,
        menuName:      appointment.menuName,
        durationMin:   appointment.durationMin,
        price:         appointment.price,
        startAt:       appointment.startAt,
        endAt:         appointment.endAt,
        phone:         tenant.phone,
        address:       tenant.address,
        mypageUrl,
        customMessage: tenant.emailConfirmMsg,
      });
      console.log(`[reservationService] メール確定通知送信: appointmentId=${appointmentId}`);
    } catch (e) {
      console.error("[reservationService] メール送信エラー:", e);
    }
  }

  return { success: true };
}

// ── お断り処理 ────────────────────────────────────────────────────────

type RejectReservationInput = {
  appointmentId: string;
  tenantId:      string;
  changedById:   string;
};

type RejectReservationResult =
  | { success: true }
  | { success: false; error: string };

/**
 * 予約を rejected に更新し、患者へお断り通知を送信する。
 *
 * CLAUDE.md 規約:
 *   - status: "pending" の予約のみ対象（確定済みへの適用禁止）
 *   - ステータス変更は必ず AppointmentLog に記録する（絶対ルール）
 *   - LINE / メール送信失敗はお断り処理の成否に影響させない
 */
export async function rejectReservation(
  input: RejectReservationInput
): Promise<RejectReservationResult> {
  const { appointmentId, tenantId, changedById } = input;

  const appointment = await prisma.appointment.findFirst({
    where:  { id: appointmentId, tenantId, status: "pending" },
    select: {
      id:          true,
      menuName:    true,
      durationMin: true,
      price:       true,
      startAt:     true,
      endAt:       true,
      patient: {
        select: { displayName: true, lineUserId: true, email: true },
      },
    },
  });

  if (!appointment) {
    return { success: false, error: "予約が見つからないか、すでに処理済みです。" };
  }

  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { name: true, phone: true, lineEnabled: true, lineChannelAccessToken: true, emailEnabled: true },
  });
  if (!tenant) {
    return { success: false, error: "テナントが見つかりません。" };
  }

  const now = new Date();

  try {
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id: appointmentId },
        data:  { status: "rejected", cancelledAt: now, cancelledBy: changedById },
      }),
      prisma.appointmentLog.create({
        data: {
          appointmentId,
          oldStatus:   "pending",
          newStatus:   "rejected",
          changedById,
          note:        "管理画面よりお断り",
        },
      }),
    ]);
  } catch (e) {
    console.error("[reservationService] rejectReservation DB error:", e);
    return { success: false, error: "お断り処理中にエラーが発生しました。" };
  }

  const notifyArgs = {
    tenantName:  tenant.name,
    patientName: appointment.patient.displayName,
    menuName:    appointment.menuName,
    durationMin: appointment.durationMin,
    price:       appointment.price,
    startAt:     appointment.startAt,
    endAt:       appointment.endAt,
    phone:       tenant.phone,
  };

  if (tenant.lineEnabled && appointment.patient.lineUserId) {
    try {
      const token = tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
      if (token) {
        const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
        await client.pushMessage({
          to:       appointment.patient.lineUserId,
          messages: [{ type: "text", text: buildRejectionMessage(notifyArgs) }],
        });
      }
    } catch (e) {
      console.error("[reservationService] LINE rejection push error:", e);
    }
  }

  if (tenant.emailEnabled && appointment.patient.email) {
    try {
      await sendRejectionEmail({
        to: appointment.patient.email,
        ...notifyArgs,
        address: null,
      });
    } catch (e) {
      console.error("[reservationService] メールお断り送信エラー:", e);
    }
  }

  return { success: true };
}
