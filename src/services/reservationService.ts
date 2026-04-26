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
import { sendReservationEmail, sendRejectionEmail, sendSecurityEmail } from "@/lib/email";
import { ensurePatientAccessToken, buildMypageUrl } from "@/lib/mypage";
import { escapeHtml } from "@/lib/utils";

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
  /** 新規患者の場合のみ設定。受付メールと同時に登録完了メール（PINコード通知）を送信する */
  newPatientWelcome?: {
    to:                 string;
    pin:                string;
    birthDateFormatted: string;  // YYYYMMDD 形式
    loginUrl:           string;
  };
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
      subdomain:              true,
      lineChannelAccessToken: true,
      lineEnabled:            true,
      emailEnabled:           true,
      emailReceiveMsg:        true,
      lineReceiveMsg:         true,
      lineFriendUrl:          true,
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
  const patient = await prisma.patient.findFirst({
    where:  { id: patientId, tenantId },
    select: { lineUserId: true, displayName: true, email: true, accessToken: true },
  });

  const mypageUrl = patient?.accessToken && tenant.subdomain
    ? buildMypageUrl(tenant.subdomain, patient.accessToken)
    : null;

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
          phone:         tenant.phone,
          address:       tenant.address,
          mypageUrl,
          customMessage: tenant.lineReceiveMsg,
          lineFriendUrl: tenant.lineFriendUrl,
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
        mypageUrl,
        customMessage: tenant.emailReceiveMsg,
        lineFriendUrl: tenant.lineFriendUrl,
      });
      console.log(`[reservationService] メール受付通知送信: patientId=${patientId}`);
    } catch (e) {
      console.error("[reservationService] メール送信エラー:", e);
    }
  }

  // ── 新規患者 登録完了メール（受付メールと同時送信・既存患者には送らない）──
  // LINE連携時には送信しない。予約完了の瞬間にのみ送ることで重複を防ぐ。
  if (input.newPatientWelcome) {
    const { to, pin, birthDateFormatted, loginUrl } = input.newPatientWelcome;
    const bodyHtml = `
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
        このたびはご登録いただきありがとうございます。<br />
        2回目以降のご予約には、以下のログイン情報をご利用ください。
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr>
          <td style="padding:10px 14px;background:#f3f4f6;border-radius:8px 8px 0 0;color:#6b7280;width:50%;">ログインID（生年月日）</td>
          <td style="padding:10px 14px;color:#111827;font-weight:600;">${birthDateFormatted}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#f3f4f6;border-radius:0 0 8px 8px;color:#6b7280;">Access PIN（暗証番号）</td>
          <td style="padding:10px 14px;color:#111827;font-weight:600;font-size:20px;letter-spacing:0.25em;">${pin}</td>
        </tr>
      </table>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;">
        マイページでご予約履歴の確認や登録情報の変更が行えます。
      </p>
      <a href="${loginUrl}" style="display:inline-block;padding:10px 20px;background:#5BBAC4;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
        マイページへログイン →
      </a>
      ${(tenant.phone || tenant.address) ? `
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:20px;margin-bottom:4px;">
        ${tenant.phone ? `<tr>
          <td style="padding:10px 14px;background:#f3f4f6;border-radius:${tenant.address ? "8px 8px 0 0" : "8px"};color:#6b7280;width:40%;white-space:nowrap;">📞 電話番号</td>
          <td style="padding:10px 14px;color:#111827;font-weight:600;">${escapeHtml(tenant.phone)}</td>
        </tr>` : ""}
        ${tenant.address ? `<tr>
          <td style="padding:10px 14px;background:#f3f4f6;border-radius:${tenant.phone ? "0 0 8px 8px" : "8px"};color:#6b7280;">📍 住所</td>
          <td style="padding:10px 14px;color:#111827;">
            ${escapeHtml(tenant.address)}<br />
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address ?? "")}" style="color:#5BBAC4;font-size:13px;">Google マップで見る →</a>
          </td>
        </tr>` : ""}
      </table>` : ""}
      ${tenant.lineFriendUrl ? `
      <table style="width:100%;border-collapse:collapse;margin-top:20px;">
        <tr>
          <td style="background:#F0FFF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px 16px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#15803D;">💚 LINE公式アカウント</p>
            <p style="margin:0 0 10px;font-size:12px;color:#374151;line-height:1.6;">
              友だち追加でお得なお知らせや最新情報をLINEでお届けします。
            </p>
            <a href="${tenant.lineFriendUrl}" style="display:inline-block;padding:8px 16px;background:#06C755;color:#fff;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">
              友だち追加する →
            </a>
          </td>
        </tr>
      </table>` : ""}
      <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">
        ※ 暗証番号はスタッフにお伝えすることで変更できます。<br />
        ※ 本メールに心当たりがない場合はお手数ですが当院までご連絡ください。
      </p>`;

    sendSecurityEmail({
      to,
      subject:    "【重要】アカウント登録完了とログイン情報のお知らせ",
      tenantName: tenant.name,
      bodyHtml,
    }).catch((e) => console.error("[reservationService] 登録通知メール送信失敗:", e));
    console.log(`[reservationService] 登録完了メール送信: patientId=${patientId}`);
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
    select: { name: true, phone: true, address: true, subdomain: true, lineChannelAccessToken: true, lineEnabled: true, emailEnabled: true, emailConfirmMsg: true, lineConfirmMsg: true, lineFriendUrl: true },
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
          lineFriendUrl: tenant.lineFriendUrl,
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
        lineFriendUrl: tenant.lineFriendUrl,
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
        select: { displayName: true, lineUserId: true, email: true, accessToken: true },
      },
    },
  });

  if (!appointment) {
    return { success: false, error: "予約が見つからないか、すでに処理済みです。" };
  }

  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { name: true, phone: true, subdomain: true, lineEnabled: true, lineChannelAccessToken: true, emailEnabled: true, lineRejectMsg: true, emailRejectMsg: true, lineFriendUrl: true },
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

  const rejectMypageUrl = appointment.patient.accessToken && tenant.subdomain
    ? buildMypageUrl(tenant.subdomain, appointment.patient.accessToken)
    : null;

  const notifyArgs = {
    tenantName:  tenant.name,
    patientName: appointment.patient.displayName,
    menuName:    appointment.menuName,
    durationMin: appointment.durationMin,
    price:       appointment.price,
    startAt:     appointment.startAt,
    endAt:       appointment.endAt,
    phone:       tenant.phone,
    mypageUrl:   rejectMypageUrl,
  };

  if (tenant.lineEnabled && appointment.patient.lineUserId) {
    try {
      const token = tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
      if (token) {
        const client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
        await client.pushMessage({
          to:       appointment.patient.lineUserId,
          messages: [{ type: "text", text: buildRejectionMessage({ ...notifyArgs, customMessage: tenant.lineRejectMsg, lineFriendUrl: tenant.lineFriendUrl }) }],
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
        address:       null,
        customMessage: tenant.emailRejectMsg,
        lineFriendUrl: tenant.lineFriendUrl,
      });
    } catch (e) {
      console.error("[reservationService] メールお断り送信エラー:", e);
    }
  }

  return { success: true };
}
