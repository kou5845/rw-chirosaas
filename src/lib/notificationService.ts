/**
 * 予約通知サービス — 変更・キャンセル通知の共通ロジック
 *
 * CLAUDE.md 規約:
 *   - このファイルは "use server" を付与しない（Server Action ではなくサービス層）
 *   - tenantId は呼び出し元が DB 照合済みの値を渡すこと
 *   - 通知失敗は呼び出し元の処理をロールバックさせない（try/catch で吸収）
 *   - LINE 優先・次いでメール（両方設定されている場合は両方送信）
 */

import { messagingApi } from "@line/bot-sdk";
import { buildUpdateMessage, buildCancellationMessage } from "@/lib/line";
import { sendUpdateEmail, sendCancellationEmail } from "@/lib/email";

// ── 共通の予約・テナント・患者情報型 ────────────────────────────────

type TenantInfo = {
  name:                   string;
  phone:                  string | null;
  address:                string | null;
  lineEnabled:            boolean;
  lineChannelAccessToken: string | null;
  emailEnabled:           boolean;
  emailChangeMsg?:        string | null;
  lineChangeMsg?:         string | null;
};

type PatientInfo = {
  displayName: string;
  lineUserId:  string | null;
  email:       string | null;
};

type AppointmentCore = {
  menuName:    string;
  durationMin: number;
  price:       number;
  startAt:     Date;
  endAt:       Date;
};

// ── LINE クライアント取得ユーティリティ ─────────────────────────────

function getLineClient(tenant: TenantInfo): messagingApi.MessagingApiClient | null {
  const token = tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: token });
}

// ── 予約日時変更通知 ──────────────────────────────────────────────────

export type SendUpdateNotificationParams = {
  tenant:      TenantInfo;
  patient:     PatientInfo;
  appointment: AppointmentCore;
  oldStartAt:  Date;
  oldEndAt:    Date;
};

/**
 * 予約日時変更通知を LINE / メールで送信する。
 * 送信失敗は console.error に留め、呼び出し元には影響させない。
 */
export async function sendUpdateNotification({
  tenant,
  patient,
  appointment,
  oldStartAt,
  oldEndAt,
}: SendUpdateNotificationParams): Promise<void> {
  const templateArgs = {
    tenantName:  tenant.name,
    patientName: patient.displayName,
    menuName:    appointment.menuName,
    durationMin: appointment.durationMin,
    price:       appointment.price,
    startAt:     appointment.startAt,
    endAt:       appointment.endAt,
    phone:       tenant.phone,
    address:     tenant.address,
    oldStartAt,
    oldEndAt,
  };

  // ── LINE 変更通知 ──
  if (tenant.lineEnabled && patient.lineUserId) {
    const client = getLineClient(tenant);
    if (client) {
      try {
        const text = buildUpdateMessage({ ...templateArgs, customMessage: tenant.lineChangeMsg });
        await client.pushMessage({
          to:       patient.lineUserId,
          messages: [{ type: "text", text }],
        });
        console.log("[notificationService] LINE変更通知送信");
      } catch (e) {
        console.error("[notificationService] LINE変更通知失敗:", e instanceof Error ? e.message : e);
      }
    }
  }

  // ── メール変更通知 ──
  if (tenant.emailEnabled && patient.email) {
    try {
      await sendUpdateEmail({
        to:            patient.email,
        tenantName:    tenant.name,
        patientName:   patient.displayName,
        menuName:      appointment.menuName,
        durationMin:   appointment.durationMin,
        price:         appointment.price,
        startAt:       appointment.startAt,
        endAt:         appointment.endAt,
        phone:         tenant.phone,
        address:       tenant.address,
        oldStartAt,
        oldEndAt,
        customMessage: tenant.emailChangeMsg,
      });
      console.log("[notificationService] メール変更通知送信");
    } catch (e) {
      console.error("[notificationService] メール変更通知失敗:", e instanceof Error ? e.message : e);
    }
  }
}

// ── 予約キャンセル通知 ────────────────────────────────────────────────

export type SendCancellationNotificationParams = {
  tenant:      TenantInfo;
  patient:     PatientInfo;
  appointment: AppointmentCore;
};

/**
 * 予約キャンセル通知を LINE / メールで送信する。
 * 送信失敗は console.error に留め、呼び出し元には影響させない。
 */
export async function sendCancellationNotification({
  tenant,
  patient,
  appointment,
}: SendCancellationNotificationParams): Promise<void> {
  const templateArgs = {
    tenantName:  tenant.name,
    patientName: patient.displayName,
    menuName:    appointment.menuName,
    durationMin: appointment.durationMin,
    price:       appointment.price,
    startAt:     appointment.startAt,
    endAt:       appointment.endAt,
    phone:       tenant.phone,
    address:     tenant.address,
  };

  // ── LINE キャンセル通知 ──
  if (tenant.lineEnabled && patient.lineUserId) {
    const client = getLineClient(tenant);
    if (client) {
      try {
        const text = buildCancellationMessage(templateArgs);
        await client.pushMessage({
          to:       patient.lineUserId,
          messages: [{ type: "text", text }],
        });
        console.log("[notificationService] LINEキャンセル通知送信");
      } catch (e) {
        console.error("[notificationService] LINEキャンセル通知失敗:", e instanceof Error ? e.message : e);
      }
    }
  }

  // ── メール キャンセル通知 ──
  if (tenant.emailEnabled && patient.email) {
    try {
      await sendCancellationEmail({
        to:            patient.email,
        tenantName:    tenant.name,
        patientName:   patient.displayName,
        menuName:      appointment.menuName,
        durationMin:   appointment.durationMin,
        price:         appointment.price,
        startAt:       appointment.startAt,
        endAt:         appointment.endAt,
        phone:         tenant.phone,
        address:       tenant.address,
      });
      console.log("[notificationService] メールキャンセル通知送信");
    } catch (e) {
      console.error("[notificationService] メールキャンセル通知失敗:", e instanceof Error ? e.message : e);
    }
  }
}
