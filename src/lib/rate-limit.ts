/**
 * レートリミット設定
 *
 * @upstash/ratelimit + Upstash Redis を使用。
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN が未設定の場合は
 * スキップして警告ログのみ出力（開発環境向けフォールバック）。
 *
 * 必要環境変数:
 *   UPSTASH_REDIS_REST_URL  - Upstash Redis REST エンドポイント
 *   UPSTASH_REDIS_REST_TOKEN - Upstash Redis アクセストークン
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis }     from "@upstash/redis";

// ── Redis クライアント（遅延初期化）─────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL または UPSTASH_REDIS_REST_TOKEN が未設定です。" +
      "レートリミットはスキップされます（開発環境フォールバック）。"
    );
    return null;
  }
  _redis = new Redis({ url, token });
  return _redis;
}

// ── レートリミット設定 ────────────────────────────────────────────

/**
 * マイページログイン: 10リクエスト / 15分
 * ブルートフォース対策（4桁PIN = 10,000通り → 15分で10回に制限）
 */
export const loginRatelimit = new Ratelimit({
  redis:     getRedis() ?? ({} as Redis), // null チェックは isRedisAvailable() で
  limiter:   Ratelimit.slidingWindow(10, "15 m"),
  analytics: false,
  prefix:    "rl:login",
});

/**
 * PIN再発行: 5リクエスト / 1時間
 * 登録メールへの大量送信防止
 */
export const pinResetRatelimit = new Ratelimit({
  redis:     getRedis() ?? ({} as Redis),
  limiter:   Ratelimit.slidingWindow(5, "1 h"),
  analytics: false,
  prefix:    "rl:pin-reset",
});

/**
 * 予約作成: 5リクエスト / 1分
 * 予約スパム（カレンダー占有攻撃）防止
 */
export const reserveRatelimit = new Ratelimit({
  redis:     getRedis() ?? ({} as Redis),
  limiter:   Ratelimit.slidingWindow(5, "1 m"),
  analytics: false,
  prefix:    "rl:reserve",
});

/** Upstash が設定されているか確認するヘルパー */
export function isRedisAvailable(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
