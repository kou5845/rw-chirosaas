/**
 * PIN暗号化ユーティリティ（AES-256-GCM）
 *
 * bcrypt（一方向）の代わりに可逆暗号化を使い、
 * スタッフが患者の暗証番号を確認できるようにする。
 *
 * 環境変数:
 *   PIN_CIPHER_KEY — 64文字の16進数文字列（32バイト = AES-256）
 *                    未設定時は開発環境のみフォールバックキーを使用
 *
 * 保存フォーマット: "enc1:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX    = "enc1:";

// ── 鍵取得 ────────────────────────────────────────────────────────────

function getCipherKey(): Buffer {
  const keyHex = process.env.PIN_CIPHER_KEY;

  if (keyHex && keyHex.length === 64) {
    return Buffer.from(keyHex, "hex");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[pin-cipher] 本番環境では PIN_CIPHER_KEY（64文字16進数）の設定が必須です。"
    );
  }

  // 開発環境フォールバック（固定キー — 本番では絶対に使用しない）
  console.warn("[pin-cipher] PIN_CIPHER_KEY 未設定。開発用フォールバックキーを使用します。");
  return Buffer.from("0".repeat(64), "hex");
}

// ── 暗号化 ───────────────────────────────────────────────────────────

/**
 * 4桁PINを AES-256-GCM で暗号化して保存用文字列を返す。
 * 形式: "enc1:<12バイトIV>:<16バイトGCMタグ>:<暗号文>" （すべて16進）
 */
export function encryptPin(pin: string): string {
  const key  = getCipherKey();
  const iv   = randomBytes(12); // GCM推奨: 96-bit
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct   = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

/**
 * 保存用文字列から元のPINを復号する。
 * 改ざん検知（GCMタグ不一致）や不正フォーマット時は null を返す。
 */
export function decryptPin(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return null;
  try {
    const key   = getCipherKey();
    const parts = stored.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, ctHex] = parts;
    const iv  = Buffer.from(ivHex,  "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ct  = Buffer.from(ctHex,  "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/** enc1: プレフィックスを持つ暗号化済みPINかどうかを判定する */
export function isEncryptedPin(stored: string | null): boolean {
  return !!stored?.startsWith(PREFIX);
}
