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
  tenantName:    string;
  patientName:   string;
  menuName:      string;
  durationMin:   number;
  price:         number;
  startAt:       Date;
  endAt:         Date;
  phone?:        string | null;
  address?:      string | null;
  /** 患者専用マイページURL（設定時はメッセージ末尾に案内を追加する） */
  mypageUrl?:    string | null;
  /** プロプラン向けカスタムメッセージ（設定時はメッセージ末尾に追加する） */
  customMessage?: string | null;
};

/** 曜日ラベル */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * UTC の Date を JST 基準で "M月D日(曜)" にフォーマットする。
 * Vercel サーバーのシステムタイムゾーンは UTC のため、
 * getMonth/getDate/getDay を使うと日本時間と最大9時間ずれる。
 * UTC ミリ秒に +9h オフセットを加えて UTC メソッドで取り出すことで
 * タイムゾーン設定に依存しない安全な変換を行う。
 */
function fmtDate(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日(${WEEKDAYS[jst.getUTCDay()]})`;
}

/** UTC の Date を JST 基準で "HH:MM" にフォーマットする。 */
function fmtTime(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h   = String(jst.getUTCHours()).padStart(2, "0");
  const m   = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * 予約確定通知のメッセージ文字列を生成する。
 */
export function buildConfirmationMessage(args: NotificationTemplateArgs): string {
  const { tenantName, menuName, durationMin, price, startAt, endAt, phone, address, mypageUrl, customMessage } = args;
  const lines = [
    "【ご予約確定のお知らせ】",
    `${tenantName} のご予約が確定しました。`,
    "",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    `💴 ¥${price.toLocaleString("ja-JP")}`,
    "",
    "ご来院をお待ちしております。",
  ];
  if (address) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    lines.push("", `📍 ${address}`, `🗺 ${mapUrl}`);
  }
  if (phone) {
    lines.push("", `変更・キャンセルはお電話にて承ります：${phone}`);
  }
  if (mypageUrl) {
    lines.push(
      "",
      "─────────────────",
      "📋 施術記録・予約履歴はマイページからご確認いただけます",
      mypageUrl,
    );
  }
  if (customMessage?.trim()) {
    lines.push("", "─────────────────", customMessage.trim());
  }
  return lines.join("\n");
}

/**
 * 24時間前リマインダーのメッセージ文字列を生成する。
 */
export function buildReminder24hMessage(args: NotificationTemplateArgs): string {
  const { tenantName, menuName, durationMin, startAt, endAt, mypageUrl, customMessage } = args;
  const lines = [
    "【明日のご予約リマインダー】",
    `${tenantName} への明日のご予約をお知らせします。`,
    "",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    "",
    "お忘れなくご来院ください。",
    "変更・キャンセルの場合はお早めにご連絡ください。",
  ];
  if (mypageUrl) {
    lines.push(
      "",
      "─────────────────",
      "📋 本日の施術内容やこれまでの記録はマイページからご確認いただけます",
      mypageUrl,
    );
  }
  if (customMessage?.trim()) {
    lines.push("", "─────────────────", customMessage.trim());
  }
  return lines.join("\n");
}

/**
 * 2時間前リマインダーのメッセージ文字列を生成する。
 */
export function buildReminder2hMessage(args: NotificationTemplateArgs): string {
  const { menuName, durationMin, startAt, endAt, customMessage } = args;
  const lines = [
    "【ご予約2時間前のリマインダー】",
    "本日のご予約まであと2時間です。",
    "",
    `⏰ ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    "",
    "お気をつけてお越しください。",
  ];
  if (customMessage?.trim()) {
    lines.push("", "─────────────────", customMessage.trim());
  }
  return lines.join("\n");
}

/**
 * 予約受付通知のメッセージ文字列を生成する（pending 作成直後に送信）。
 */
export function buildReceptionMessage(args: NotificationTemplateArgs): string {
  const { tenantName, menuName, durationMin, price, startAt, endAt, phone, address, customMessage } = args;
  const lines = [
    "【ご予約受付のお知らせ】",
    `${tenantName} にてご予約を受け付けました。`,
    "",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    `💴 ¥${price.toLocaleString("ja-JP")}`,
    "",
    "内容を確認後、確定の通知をお送りします。",
    "しばらくお待ちください。",
  ];
  if (address) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    lines.push("", `📍 ${address}`, `🗺 ${mapUrl}`);
  }
  if (phone) {
    lines.push("", `変更・キャンセルはお電話にて承ります：${phone}`);
  }
  if (customMessage?.trim()) {
    lines.push("", "─────────────────", customMessage.trim());
  }
  return lines.join("\n");
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
 * 予約日時変更通知のメッセージ文字列を生成する。
 */
export function buildUpdateMessage(args: NotificationTemplateArgs & {
  oldStartAt: Date;
  oldEndAt:   Date;
}): string {
  const { tenantName, menuName, durationMin, startAt, endAt, oldStartAt, oldEndAt, phone, customMessage } = args;
  const lines = [
    "【ご予約変更のお知らせ】",
    `${tenantName} のご予約日時が変更されました。`,
    "",
    "▼ 変更前",
    `📅 ${fmtDate(oldStartAt)} ${fmtTime(oldStartAt)}〜${fmtTime(oldEndAt)}`,
    "",
    "▼ 変更後",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    "",
    "ご不明な点はお問い合わせください。",
    ...(phone ? [`📞 ${phone}`] : []),
  ];
  if (customMessage?.trim()) {
    lines.push("", "─────────────────", customMessage.trim());
  }
  return lines.join("\n");
}

/**
 * お断り通知のメッセージ文字列を生成する。
 */
export function buildRejectionMessage(args: NotificationTemplateArgs): string {
  const { tenantName, menuName, durationMin, startAt, endAt, phone, customMessage } = args;
  const lines = [
    "【ご予約についてのお知らせ】",
    `${tenantName} です。`,
    "",
    `📅 ${fmtDate(startAt)} ${fmtTime(startAt)}〜${fmtTime(endAt)}`,
    `💆 ${menuName}（${durationMin}分）`,
    "",
    "申し訳ございませんが、ご希望の日時は既にご予約が埋まっており、",
    "お受けすることができませんでした。",
    "別の日程をご検討いただけますと幸いです。",
    ...(phone ? ["", `📞 ${phone}`] : []),
  ];
  if (customMessage?.trim()) {
    lines.push("", "─────────────────", customMessage.trim());
  }
  return lines.join("\n");
}

/**
 * notificationType に応じたメッセージ文字列を返すディスパッチ関数。
 */
export function buildNotificationMessage(
  notificationType: string,
  args: NotificationTemplateArgs
): string {
  switch (notificationType) {
    case "reception":     return buildReceptionMessage(args);
    case "confirmation":  return buildConfirmationMessage(args);
    case "reminder_24h":  return buildReminder24hMessage(args);
    case "reminder_2h":   return buildReminder2hMessage(args);
    case "cancellation":  return buildCancellationMessage(args);
    case "rejection":     return buildRejectionMessage(args);
    default:
      return `${args.tenantName} からのお知らせがあります。`;
  }
}
