"use server";

/**
 * 患者プロフィール更新 Server Action
 *
 * セキュリティ:
 *   - セッション Cookie を検証し、ログイン中の患者自身のレコードのみ更新する
 *   - 更新対象は phone と email のみ。displayName / nameKana は絶対に変更しない
 *   - CLAUDE.md 絶対ルール: Prisma クエリに tenantId を含める
 *
 * 通知ロジック:
 *   - DB 更新前に旧メールアドレスを保持し、更新後に変更有無を判定する
 *   - メールアドレスが変更された場合: 新旧両方のアドレスにセキュリティ通知を送信
 *   - LINE 連携済みの場合: 登録情報更新通知を送信
 *   - 通知失敗はすべて .catch() で吸収し、プロフィール更新自体に影響させない
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { messagingApi } from "@line/bot-sdk";
import { prisma } from "@/lib/prisma";
import { verifySessionToken, COOKIE_NAME } from "@/lib/mypage-session";
import { sendSecurityEmail } from "@/lib/email";

export type UpdateProfileState = {
  success?: boolean;
  errors?: { phone?: string; email?: string; general?: string };
} | null;

export async function updatePatientProfile(
  _prev: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const tenantSlug = (formData.get("tenantSlug") as string | null)?.trim() ?? "";
  const phone      = (formData.get("phone")      as string | null)?.trim() ?? "";
  const email      = (formData.get("email")      as string | null)?.trim() || null;

  // ── セッション検証 ──
  const jar       = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value ?? "";
  const session   = cookieVal ? verifySessionToken(cookieVal) : null;
  if (!session) {
    return { errors: { general: "セッションが無効です。ログインし直してください。" } };
  }

  // ── テナント照合（CLAUDE.md: tenantId はセッション由来の値で確認）──
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: tenantSlug },
    select: { id: true, name: true, lineEnabled: true, lineChannelAccessToken: true },
  });
  if (!tenant || tenant.id !== session.tenantId) {
    return { errors: { general: "認証エラーが発生しました。" } };
  }

  // ── 入力バリデーション ──
  const errors: NonNullable<UpdateProfileState>["errors"] = {};

  if (!phone) {
    errors.phone = "電話番号を入力してください。";
  } else if (!/^[\d\-\s]{10,13}$/.test(phone)) {
    errors.phone = "正しい電話番号を入力してください（例: 090-1234-5678）。";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "正しいメールアドレスを入力してください。";
  }

  if (Object.keys(errors).length > 0) return { errors };

  // ── 更新前に旧データを取得（通知の差分判定に使用）──
  const before = await prisma.patient.findFirst({
    where:  { id: session.patientId, tenantId: tenant.id },
    select: { email: true, lineUserId: true },
  });
  const prevEmail  = before?.email  ?? null;
  const lineUserId = before?.lineUserId ?? null;

  // ── 更新（phone / email のみ。名前フィールドは data に含めない）──
  await prisma.patient.updateMany({
    where: {
      id:       session.patientId,
      tenantId: tenant.id, // CLAUDE.md 絶対ルール
    },
    data: { phone, email },
  });

  revalidatePath(`/${tenantSlug}/mypage`);

  // ── 通知（すべて fire-and-forget。失敗しても更新は成功扱い）──────
  const emailChanged = email !== prevEmail;

  if (emailChanged) {
    const bodyNew = `
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
        メールアドレスの変更が正常に完了しました。
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:10px 14px;background:#f3f4f6;border-radius:8px;color:#6b7280;width:40%;">新しいメールアドレス</td>
          <td style="padding:10px 14px;color:#111827;font-weight:600;">${email ?? "（削除）"}</td>
        </tr>
      </table>
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
        今後の予約通知はこちらのアドレスにお届けします。<br />
        ご不明な点がございましたら、お気軽にご連絡ください。
      </p>`;

    const bodyOld = `
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
        このアドレスに登録されていたメールアドレスが変更されました。
      </p>
      <p style="margin:0 0 16px;padding:14px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;color:#92400e;font-size:13px;line-height:1.6;">
        ⚠️ <strong>もしご自身で変更した覚えがない場合は、至急当院までご連絡ください。</strong>
      </p>
      <p style="margin:0;color:#6b7280;font-size:13px;">
        本メールはセキュリティ上の記録としてお送りしています。
      </p>`;

    if (email) {
      sendSecurityEmail({
        to:         email,
        subject:    "【重要】メールアドレス変更完了のお知らせ",
        tenantName: tenant.name,
        bodyHtml:   bodyNew,
      }).catch((e: unknown) =>
        console.error("[updatePatientProfile] 新メール通知失敗:", e)
      );
    }

    if (prevEmail) {
      sendSecurityEmail({
        to:         prevEmail,
        subject:    "【重要】メールアドレス変更のお知らせ",
        tenantName: tenant.name,
        bodyHtml:   bodyOld,
      }).catch((e: unknown) =>
        console.error("[updatePatientProfile] 旧メール通知失敗:", e)
      );
    }
  }

  if (lineUserId && tenant.lineEnabled) {
    const lineToken =
      tenant.lineChannelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
    if (lineToken) {
      const lineClient = new messagingApi.MessagingApiClient({
        channelAccessToken: lineToken,
      });
      lineClient
        .pushMessage({
          to:       lineUserId,
          messages: [
            {
              type: "text",
              text: [
                "【登録情報の更新】",
                "",
                "電話番号・メールアドレスの登録情報が更新されました。",
                "",
                "心当たりがない場合は、お手数ですが当院までご連絡ください。",
              ].join("\n"),
            },
          ],
        })
        .catch((e: unknown) =>
          console.error("[updatePatientProfile] LINE通知失敗:", e)
        );
    }
  }

  return { success: true };
}
