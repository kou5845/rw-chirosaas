/**
 * PIN ハッシュユーティリティ
 *
 * bcryptjs を使用して accessPin をハッシュ化する。
 * DB にはプレーンテキストの PIN を絶対に保存しない。
 *
 * 移行サポート:
 *   既存の平文 PIN（4桁数字）と新規 bcrypt ハッシュを透過的に比較できる。
 *   平文で一致した場合は { match: true, needsUpgrade: true } を返すので、
 *   呼び出し元が即座に bcrypt ハッシュに置き換えること。
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** 4桁 PIN を bcrypt ハッシュ化して返す */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

type VerifyResult =
  | { match: true;  needsUpgrade: false } // bcrypt ハッシュ一致
  | { match: true;  needsUpgrade: true  } // 平文（レガシー）一致 → 即座に hashPin してDB更新すること
  | { match: false; needsUpgrade: false }; // 不一致

/**
 * 提出された PIN とDB保存値を比較する。
 * bcrypt ハッシュ（"$2b$" / "$2a$" で始まる）と平文の両方に対応。
 */
export async function verifyPin(
  plain:  string,
  stored: string | null,
): Promise<VerifyResult> {
  if (!stored) return { match: false, needsUpgrade: false };

  // bcrypt ハッシュの場合
  if (stored.startsWith("$2")) {
    const ok = await bcrypt.compare(plain, stored);
    return ok
      ? { match: true,  needsUpgrade: false }
      : { match: false, needsUpgrade: false };
  }

  // 平文（移行期サポート）— 一致した場合はすぐに bcrypt でアップグレードする
  const ok = plain === stored;
  return ok
    ? { match: true,  needsUpgrade: true  }
    : { match: false, needsUpgrade: false };
}
