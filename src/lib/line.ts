/**
 * LINE Messaging API クライアント
 *
 * CLAUDE.md 規約:
 *   - 認証トークンは環境変数からのみ取得する。コードへのハードコードは禁止。
 *   - pushMessage に渡す lineUserId は必ず DB の patient.line_user_id を使用すること。
 *   - ファイルは "use client" を付与せず、サーバーサイド専用モジュールとして扱う。
 */

import { messagingApi } from "@line/bot-sdk";

// ── LINE クライアント（遅延初期化シングルトン）────────────────────
// モジュールロード時に環境変数が未設定でも起動できるよう遅延初期化する。
// 実際の送信時に環境変数が未設定であれば明確なエラーを投げる。
let _client: messagingApi.MessagingApiClient | null = null;

function getClient(): messagingApi.MessagingApiClient {
  if (_client) return _client;

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || token === "[LINE_CHANNEL_ACCESS_TOKEN]") {
    throw new Error(
      "[line.ts] LINE_CHANNEL_ACCESS_TOKEN が設定されていません。" +
      ".env.local を確認してください。"
    );
  }

  _client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
  return _client;
}

// ── 型エイリアス ──────────────────────────────────────────────────
type LineMessage = messagingApi.Message;

/**
 * LINE ユーザーに任意のメッセージを送信する（最大5件）。
 *
 * @param to       - Patient.lineUserId（LINE の userId）
 * @param messages - 送信するメッセージオブジェクトの配列
 * @throws LINE_CHANNEL_ACCESS_TOKEN 未設定 または LINE API エラーの場合
 */
export async function pushMessage(to: string, messages: LineMessage[]): Promise<void> {
  const client = getClient();
  await client.pushMessage({ to, messages });
}

/**
 * テキストメッセージ1件を送信するショートハンド。
 *
 * @param to   - Patient.lineUserId
 * @param text - 送信する文字列（改行 \n 対応）
 */
export async function pushText(to: string, text: string): Promise<void> {
  await pushMessage(to, [{ type: "text", text }]);
}

// ── 通知タイプ別メッセージテンプレート ───────────────────────────

type NotificationTemplateArgs = {
  tenantName:  string;
  patientName: string;
  menuName:    string;
  durationMin: number;
  price:       number;
  startAt:     Date;
  endAt:       Date;
};

/** 曜日ラベル */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 予約確定通知のメッセージ文字列を生成する。
 */
export function buildConfirmationMessage(args: NotificationTemplateArgs): string {
  const { tenantName, menuName, durationMin, price, startAt, endAt } = args;
  return [
    "【ご予約確定のお知らせ】",
    `${tenantName} のご予約が確定しました。`,
    "",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    `💴 ¥${price.toLocaleString("ja-JP")}`,
    "",
    "ご来院をお待ちしております。",
  ].join("\n");
}

/**
 * 24時間前リマインダーのメッセージ文字列を生成する。
 */
export function buildReminder24hMessage(args: NotificationTemplateArgs): string {
  const { tenantName, menuName, durationMin, startAt, endAt } = args;
  return [
    "【明日のご予約リマインダー】",
    `${tenantName} への明日のご予約をお知らせします。`,
    "",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    "",
    "お忘れなくご来院ください。",
    "変更・キャンセルの場合はお早めにご連絡ください。",
  ].join("\n");
}

/**
 * 2時間前リマインダーのメッセージ文字列を生成する。
 */
export function buildReminder2hMessage(args: NotificationTemplateArgs): string {
  const { menuName, durationMin, startAt, endAt } = args;
  return [
    "【ご予約2時間前のリマインダー】",
    "本日のご予約まであと2時間です。",
    "",
    `⏰ ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    "",
    "お気をつけてお越しください。",
  ].join("\n");
}

/**
 * キャンセル通知のメッセージ文字列を生成する。
 */
export function buildCancellationMessage(args: NotificationTemplateArgs): string {
  const { tenantName, menuName, durationMin, startAt, endAt } = args;
  return [
    "【ご予約キャンセルのお知らせ】",
    `${tenantName} への以下のご予約がキャンセルされました。`,
    "",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    "",
    "またのご利用をお待ちしております。",
  ].join("\n");
}

/**
 * notificationType に応じたメッセージ文字列を返すディスパッチ関数。
 */
export function buildNotificationMessage(
  notificationType: string,
  args: NotificationTemplateArgs
): string {
  switch (notificationType) {
    case "confirmation":  return buildConfirmationMessage(args);
    case "reminder_24h":  return buildReminder24hMessage(args);
    case "reminder_2h":   return buildReminder2hMessage(args);
    case "cancellation":  return buildCancellationMessage(args);
    default:
      return `${args.tenantName} からのお知らせがあります。`;
  }
}
