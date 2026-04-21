/**
 * メール送信ユーティリティ（Resend）
 *
 * CLAUDE.md 規約:
 *   - API キーは環境変数 RESEND_API_KEY からのみ取得する
 *   - 送信元アドレスは環境変数 EMAIL_FROM（未設定時は Resend の共有ドメインを使用）
 *   - このファイルは "use client" を付与せず、サーバーサイド専用モジュールとして扱う
 */

import { Resend } from "resend";
import { createElement } from "react";
import {
  ReservationEmail,
  type ReservationEmailProps,
} from "@/components/emails/ReservationEmail";

// 遅延初期化（モジュールロード時に API キー未設定でも起動できるようにする）
let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "[RESEND_API_KEY]") {
    throw new Error(
      "[email.ts] RESEND_API_KEY が設定されていません。.env.local を確認してください。"
    );
  }
  _resend = new Resend(apiKey);
  return _resend;
}

// ── メール送信パラメータ ────────────────────────────────────────────

export type SendReservationEmailParams = ReservationEmailProps & {
  to: string;
};

export type SendReminderEmailParams = Omit<ReservationEmailProps, "type"> & {
  to:        string;
  mypageUrl?: string | null;
};

/**
 * 住所から Google Static Maps 画像 URL を生成する。
 * GOOGLE_MAPS_STATIC_API_KEY 未設定時は null を返す（画像非表示）。
 */
function buildStaticMapUrl(address: string | null | undefined): string | null {
  if (!address) return null;
  const apiKey = process.env.GOOGLE_MAPS_STATIC_API_KEY;
  if (!apiKey) return null;
  const q = encodeURIComponent(address);
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${q}` +
    `&zoom=15&size=600x300` +
    `&markers=color:red%7C${q}` +
    `&key=${apiKey}`
  );
}

/**
 * 予約メール（受付完了 or 確定通知）を送信する。
 *
 * @throws RESEND_API_KEY 未設定 または Resend API エラーの場合
 */
export async function sendReservationEmail(
  params: SendReservationEmailParams
): Promise<void> {
  const { to, type, tenantName, ...rest } = params;

  const subject =
    type === "confirmation"
      ? `【${tenantName}】ご予約確定のお知らせ`
      : `【${tenantName}】ご予約受付のお知らせ`;

  const emailAddress = process.env.EMAIL_FROM ?? "noreply@resend.dev";
  const from = `${tenantName} <${emailAddress}>`;

  // ── [DEBUG] 送信直前の環境変数・送信先確認 ──────────────────────
  const apiKeyHead = process.env.RESEND_API_KEY?.slice(0, 3) ?? "(未設定)";
  console.log("[email.ts] DEBUG sendReservationEmail");
  console.log("  RESEND_API_KEY 先頭3文字:", apiKeyHead);
  console.log("  EMAIL_FROM:", process.env.EMAIL_FROM ?? "(未設定 → フォールバック使用)");
  console.log("  from (実際に使用):", from);
  console.log("  to:", to);
  console.log("  type:", type);
  console.log("  subject:", subject);
  // ── [DEBUG END] ────────────────────────────────────────────────

  const resend = getResend();

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    react: createElement(ReservationEmail, {
      type,
      tenantName,
      ...rest,
      staticMapUrl: buildStaticMapUrl(rest.address),
    }),
  });

  if (error) {
    throw new Error(`[email.ts] Resend API エラー: ${JSON.stringify(error)}`);
  }
}

/**
 * 24時間前リマインダーメールを送信する。
 */
export async function sendReminderEmail(params: SendReminderEmailParams): Promise<void> {
  const { to, tenantName, ...rest } = params;

  const subject = `【${tenantName}】明日のご予約リマインダー`;
  const from    = `${tenantName} <${process.env.EMAIL_FROM ?? "noreply@resend.dev"}>`;
  const resend  = getResend();

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    react: createElement(ReservationEmail, {
      type: "reminder",
      tenantName,
      ...rest,
      staticMapUrl: buildStaticMapUrl(rest.address),
    }),
  });

  if (error) {
    throw new Error(`[email.ts] Resend API エラー（reminder）: ${JSON.stringify(error)}`);
  }
}

export type SendUpdateEmailParams = Omit<ReservationEmailProps, "type"> & {
  to:         string;
  oldStartAt: Date;
  oldEndAt:   Date;
};

/**
 * 予約日時変更通知メールを送信する。
 */
export async function sendUpdateEmail(params: SendUpdateEmailParams): Promise<void> {
  const { to, tenantName, ...rest } = params;
  const subject = `【${tenantName}】ご予約日時変更のお知らせ`;
  const from    = `${tenantName} <${process.env.EMAIL_FROM ?? "noreply@resend.dev"}>`;
  const resend  = getResend();

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    react: createElement(ReservationEmail, {
      type: "update",
      tenantName,
      ...rest,
      staticMapUrl: buildStaticMapUrl(rest.address),
    }),
  });

  if (error) {
    throw new Error(`[email.ts] Resend API エラー（update）: ${JSON.stringify(error)}`);
  }
}

export type SendRejectionEmailParams = Omit<ReservationEmailProps, "type"> & {
  to: string;
};

/**
 * 予約お断り通知メールを送信する（院都合）。
 */
export async function sendRejectionEmail(params: SendRejectionEmailParams): Promise<void> {
  const { to, tenantName, ...rest } = params;
  const subject = `【${tenantName}】ご予約についてのお知らせ`;
  const from    = `${tenantName} <${process.env.EMAIL_FROM ?? "noreply@resend.dev"}>`;
  const resend  = getResend();

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    react: createElement(ReservationEmail, {
      type: "rejection",
      tenantName,
      ...rest,
      staticMapUrl: null,
    }),
  });

  if (error) {
    throw new Error(`[email.ts] Resend API エラー（rejection）: ${JSON.stringify(error)}`);
  }
}

// ── セキュリティ通知メール ────────────────────────────────────────────

/**
 * プロフィール変更などのセキュリティ通知メールをシンプルな HTML で送信する。
 * 予約系 React テンプレートに依存しないため、任意の subject / body を使用できる。
 */
export async function sendSecurityEmail(params: {
  to:         string;
  subject:    string;
  tenantName: string;
  bodyHtml:   string;
}): Promise<void> {
  const { to, subject, tenantName, bodyHtml } = params;
  const from   = `${tenantName} <${process.env.EMAIL_FROM ?? "noreply@resend.dev"}>`;
  const resend = getResend();

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#3b82f6;padding:20px 28px;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.05em;">${tenantName}</p>
        </td></tr>
        <tr><td style="padding:28px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#f9fafb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">${tenantName} 患者サービス — このメールは自動送信されています</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const apiKeyHead = process.env.RESEND_API_KEY?.slice(0, 6) ?? "(未設定)";
  console.log("[email.ts] DEBUG sendSecurityEmail");
  console.log("  RESEND_API_KEY 先頭6文字:", apiKeyHead);
  console.log("  EMAIL_FROM env:", process.env.EMAIL_FROM ?? "(未設定)");
  console.log("  from:", from);
  console.log("  to:", to);
  console.log("  subject:", subject);

  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    console.error("[email.ts] Resend API エラー（security）:", JSON.stringify(error));
    throw new Error(`[email.ts] Resend API エラー（security）: ${JSON.stringify(error)}`);
  }
  console.log("[email.ts] sendSecurityEmail 成功 id:", data?.id);
}

export type SendCancellationEmailParams = Omit<ReservationEmailProps, "type"> & {
  to: string;
};

/**
 * 予約キャンセル通知メールを送信する。
 */
export async function sendCancellationEmail(params: SendCancellationEmailParams): Promise<void> {
  const { to, tenantName, ...rest } = params;
  const subject = `【${tenantName}】ご予約キャンセルのお知らせ`;
  const from    = `${tenantName} <${process.env.EMAIL_FROM ?? "noreply@resend.dev"}>`;
  const resend  = getResend();

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    react: createElement(ReservationEmail, {
      type: "cancel",
      tenantName,
      ...rest,
      staticMapUrl: null,
    }),
  });

  if (error) {
    throw new Error(`[email.ts] Resend API エラー（cancel）: ${JSON.stringify(error)}`);
  }
}
