/**
 * 個人情報保護方針 — 常時表示リンク
 *
 * マイページのプロフィール欄下に配置する。
 */

import { Shield } from "lucide-react";

export function PrivacyPolicyLink() {
  return (
    <div className="flex items-center justify-center gap-1.5 pt-1">
      <Shield size={11} className="text-gray-300" />
      <a
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-medium text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
      >
        個人情報保護方針
      </a>
    </div>
  );
}
