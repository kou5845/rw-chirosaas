"use client";

/**
 * 通知設定フォーム
 *
 * LINE / メール の有効・無効をテナントごとに切り替える。
 * チェックボックスはトグルスイッチ UI で表示する。
 */

import { useActionState } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2, MessageCircle, Mail } from "lucide-react";
import { updateNotificationSettings, type NotificationSettingsState } from "./actions";

type Props = {
  tenantSlug:   string;
  lineEnabled:  boolean;
  emailEnabled: boolean;
};

/** トグルスイッチ */
function Toggle({
  name,
  defaultChecked,
  label,
  description,
  icon,
  badge,
}: {
  name:           string;
  defaultChecked: boolean;
  label:          string;
  description:    string;
  icon:           React.ReactNode;
  badge?:         React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-gray-100 bg-gray-50/50 p-4 transition-colors hover:bg-[var(--brand-bg)]">
      {/* アイコン */}
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-gray-100 text-gray-500">
        {icon}
      </div>

      {/* テキスト */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{label}</span>
          {badge}
        </div>
        <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{description}</p>
      </div>

      {/* スイッチ */}
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <div
          className="
            h-6 w-11 rounded-full bg-gray-200 transition-colors
            peer-checked:bg-[var(--brand-medium)]
            peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-medium)] peer-focus-visible:ring-offset-2
            after:absolute after:left-0.5 after:top-0.5
            after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow
            after:transition-transform after:duration-200 after:content-['']
            peer-checked:after:translate-x-5
          "
        />
      </div>
    </label>
  );
}

export function NotificationSettingsForm({ tenantSlug, lineEnabled, emailEnabled }: Props) {
  const [state, action, isPending] = useActionState<NotificationSettingsState, FormData>(
    updateNotificationSettings,
    null,
  );

  return (
    <form action={action} className="px-6 py-5 space-y-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      {/* 全体エラー */}
      {state?.errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{state.errors.general}</span>
        </div>
      )}

      {/* 保存成功 */}
      {state?.success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>通知設定を保存しました</span>
        </div>
      )}

      {/* LINE 通知 */}
      <Toggle
        name="lineEnabled"
        defaultChecked={lineEnabled}
        label="LINE 通知"
        description="予約受付・確定・変更・キャンセル・リマインダーを患者の LINE に送信します。LINE 連携設定でトークンを設定してください。"
        icon={<MessageCircle size={17} />}
        badge={
          <span className="rounded-full bg-[#06C755]/10 px-2 py-0.5 text-[10px] font-bold text-[#06C755]">
            LINE
          </span>
        }
      />

      {/* メール通知 */}
      <Toggle
        name="emailEnabled"
        defaultChecked={emailEnabled}
        label="メール通知"
        description="予約受付・確定・変更・キャンセル・リマインダーのお知らせを患者のメールアドレスに送信します。"
        icon={<Mail size={17} />}
        badge={
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-500">
            Email
          </span>
        }
      />

      {/* 保存ボタン */}
      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <><Loader2 size={15} className="animate-spin" />保存中…</>
          ) : (
            <><Save size={15} />保存する</>
          )}
        </button>
      </div>
    </form>
  );
}
