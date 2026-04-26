/**
 * PIN 保存・照合ユーティリティ
 *
 * 保存方式の優先順位:
 *   1. AES-256-GCM 暗号化（"enc1:" プレフィックス）← 新規発行はこれ
 *   2. bcrypt ハッシュ（"$2b$" / "$2a$"）           ← レガシー、ログイン時に自動アップグレード
 *   3. 平文4桁                                        ← 最古レガシー、同上
 *
 * AES暗号化にすることでスタッフが管理画面からPINを確認できる。
 */

import bcrypt from "bcryptjs";
import { encryptPin, decryptPin, isEncryptedPin } from "@/lib/pin-cipher";

export { encryptPin, decryptPin, isEncryptedPin };

/**
 * 4桁 PIN を AES-256-GCM で暗号化して返す（新規発行・更新に使用）。
 * ※ 旧 bcrypt 版 hashPin の後継。名前を維持して呼び出し元への影響を最小化する。
 */
export async function hashPin(pin: string): Promise<string> {
  return encryptPin(pin);
}

type VerifyResult =
  | { match: true;  needsUpgrade: false } // AES暗号化 一致（アップグレード不要）
  | { match: true;  needsUpgrade: true  } // bcrypt or 平文 一致 → AES暗号化へアップグレード
  | { match: false; needsUpgrade: false }; // 不一致

/**
 * 提出された PIN とDB保存値を比較する。
 * AES-256-GCM 暗号化 / bcrypt ハッシュ / 平文レガシー の3種類に対応。
 */
export async function verifyPin(
  plain:  string,
  stored: string | null,
): Promise<VerifyResult> {
  if (!stored) return { match: false, needsUpgrade: false };

  // ── AES-256-GCM 暗号化済み（"enc1:"）──
  if (isEncryptedPin(stored)) {
    const decrypted = decryptPin(stored);
    const ok = decrypted !== null && decrypted === plain;
    return ok
      ? { match: true,  needsUpgrade: false }
      : { match: false, needsUpgrade: false };
  }

  // ── bcrypt ハッシュ（"$2b$" / "$2a$"）— レガシー移行サポート ──
  if (stored.startsWith("$2")) {
    const ok = await bcrypt.compare(plain, stored);
    return ok
      ? { match: true,  needsUpgrade: true  } // AES暗号化へアップグレード
      : { match: false, needsUpgrade: false };
  }

  // ── 平文（最古レガシー）──
  const ok = plain === stored;
  return ok
    ? { match: true,  needsUpgrade: true  } // AES暗号化へアップグレード
    : { match: false, needsUpgrade: false };
}
