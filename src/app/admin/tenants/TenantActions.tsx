"use client";

/**
 * テナント操作コンポーネント
 * - 編集モーダル（医院名・プラン変更・LINE連携設定）
 * - 有効/無効トグル（無効化は確認ダイアログ付き）
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, X, Save, Loader2, AlertCircle,
  CheckCircle2, PowerOff, Power,
  MessageCircle, Copy, Check, Eye, EyeOff,
  Phone, MapPin,
} from "lucide-react";
import { updateTenantAction, toggleTenantStatusAction, type UpdateTenantFormState } from "./actions";

type Props = {
  tenant: {
    id:                     string;
    name:                   string;
    plan:                   "standard" | "pro";
    isActive:               boolean;
    lineChannelSecret:      string | null;
    lineChannelAccessToken: string | null;
    lineFriendUrl:          string | null;
    phone:                  string | null;
    address:                string | null;
  };
};

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const errCls = "border-red-300 bg-red-50/50";

export function TenantActions({ tenant }: Props) {
  const router = useRouter();
  const [editOpen,    setEditOpen]    = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending,   startTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  // LINE UI state
  const [showSecret, setShowSecret] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [origin,     setOrigin]     = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const webhookUrl = `${origin}/api/webhook/line/${tenant.id}`;

  async function copyWebhook() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [formState, formAction, isFormPending] = useActionState<UpdateTenantFormState, FormData>(
    updateTenantAction,
    null,
  );

  // 編集成功時にモーダルを閉じる
  if (formState?.success && editOpen) {
    setEditOpen(false);
  }

  function handleToggle() {
    if (tenant.isActive) {
      setConfirmOpen(true);
    } else {
      execToggle(true);
    }
  }

  function execToggle(setActive: boolean) {
    setToggleError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await toggleTenantStatusAction(tenant.id, setActive);
      if (!result.success) {
        setToggleError(result.error ?? "エラーが発生しました。");
      } else {
        router.refresh();
      }
    });
  }

  const errors = formState?.success === false ? formState.errors : undefined;

  return (
    <>
      {/* 操作ボタン */}
      <div className="flex items-center justify-end gap-2">
        {toggleError && (
          <span className="text-xs text-red-500">{toggleError}</span>
        )}

        {/* 編集ボタン */}
        <button
          onClick={() => setEditOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <Pencil size={12} />
          編集
        </button>

        {/* 有効/無効トグルボタン */}
        <button
          onClick={handleToggle}
          disabled={isPending}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            tenant.isActive
              ? "border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100"
              : "border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
          }`}
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : tenant.isActive ? (
            <PowerOff size={12} />
          ) : (
            <Power size={12} />
          )}
          {tenant.isActive ? "無効化" : "有効化"}
        </button>
      </div>

      {/* ── 無効化確認ダイアログ ── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                <PowerOff size={18} className="text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">医院を無効化しますか？</p>
                <p className="mt-1 text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{tenant.name}</span>
                  のスタッフは即時ログインできなくなります。
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 h-10 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => execToggle(false)}
                className="flex-1 h-10 rounded-xl bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
              >
                無効化する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 編集モーダル ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* モーダルヘッダー */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <p className="font-semibold text-gray-800">医院情報の編集</p>
                <p className="text-xs text-gray-400 mt-0.5">{tenant.name}</p>
              </div>
              <button
                onClick={() => setEditOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                aria-label="閉じる"
              >
                <X size={16} />
              </button>
            </div>

            {/* フォーム（スクロール可） */}
            <form action={formAction} className="overflow-y-auto">
              <div className="space-y-5 px-6 py-5">
                <input type="hidden" name="tenantId" value={tenant.id} />

                {/* 全体エラー */}
                {errors?.general && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    {errors.general}
                  </div>
                )}

                {/* 成功メッセージ（一瞬表示 → モーダルが閉じる前） */}
                {formState?.success && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    <CheckCircle2 size={14} className="shrink-0" />
                    保存しました
                  </div>
                )}

                {/* 医院名 */}
                <div>
                  <label htmlFor={`edit-name-${tenant.id}`} className="block text-sm font-medium text-gray-700">
                    医院名
                  </label>
                  <input
                    id={`edit-name-${tenant.id}`}
                    name="name"
                    type="text"
                    required
                    defaultValue={tenant.name}
                    className={`mt-1.5 ${inputCls} ${errors?.name ? errCls : ""}`}
                  />
                  {errors?.name && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle size={11} />{errors.name}
                    </p>
                  )}
                </div>

                {/* プラン */}
                <div>
                  <label htmlFor={`edit-plan-${tenant.id}`} className="block text-sm font-medium text-gray-700">
                    プラン
                  </label>
                  <select
                    id={`edit-plan-${tenant.id}`}
                    name="plan"
                    defaultValue={tenant.plan}
                    className={`mt-1.5 ${inputCls} cursor-pointer`}
                  >
                    <option value="standard">Standard</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>

                {/* ── 基本情報 ── */}
                <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50/40 p-4">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">基本情報</span>
                  </div>

                  {/* 電話番号 */}
                  <div>
                    <label htmlFor={`edit-phone-${tenant.id}`} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <Phone size={12} className="text-gray-400" />
                      電話番号
                      <span className="ml-1 text-xs font-normal text-gray-400">任意</span>
                    </label>
                    <input
                      id={`edit-phone-${tenant.id}`}
                      name="phone"
                      type="tel"
                      defaultValue={tenant.phone ?? ""}
                      placeholder="例: 03-1234-5678"
                      className={`mt-1.5 ${inputCls}`}
                    />
                  </div>

                  {/* 住所 */}
                  <div>
                    <label htmlFor={`edit-address-${tenant.id}`} className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <MapPin size={12} className="text-gray-400" />
                      住所
                      <span className="ml-1 text-xs font-normal text-gray-400">任意</span>
                    </label>
                    <input
                      id={`edit-address-${tenant.id}`}
                      name="address"
                      type="text"
                      defaultValue={tenant.address ?? ""}
                      placeholder="例: 東京都渋谷区代々木1-2-3 渋谷ビル2F"
                      className={`mt-1.5 ${inputCls}`}
                    />
                  </div>
                </div>

                {/* ── LINE 連携設定 ── */}
                <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={14} className="text-blue-500" />
                    <span className="text-sm font-semibold text-gray-700">LINE 連携設定</span>
                  </div>

                  {/* Webhook URL */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Webhook URL</p>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg border border-blue-100 bg-white px-3 py-2 font-mono text-xs text-gray-600">
                        {webhookUrl || "読み込み中…"}
                      </code>
                      <button
                        type="button"
                        onClick={copyWebhook}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        aria-label="Webhook URLをコピー"
                      >
                        {copied
                          ? <><Check size={12} className="text-emerald-500" />コピー済</>
                          : <><Copy size={12} />コピー</>
                        }
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-400">
                      LINE Developers コンソールの Webhook URL に設定してください。
                    </p>
                  </div>

                  {/* Channel Secret */}
                  <div>
                    <label htmlFor={`edit-line-secret-${tenant.id}`} className="block text-sm font-medium text-gray-700">
                      Channel Secret
                    </label>
                    <div className="mt-1.5 relative">
                      <input
                        id={`edit-line-secret-${tenant.id}`}
                        name="lineChannelSecret"
                        type={showSecret ? "text" : "password"}
                        defaultValue={tenant.lineChannelSecret ?? ""}
                        placeholder="未設定"
                        className={`${inputCls} pr-11`}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label={showSecret ? "隠す" : "表示する"}
                      >
                        {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Channel Access Token */}
                  <div>
                    <label htmlFor={`edit-line-token-${tenant.id}`} className="block text-sm font-medium text-gray-700">
                      Channel Access Token
                    </label>
                    <textarea
                      id={`edit-line-token-${tenant.id}`}
                      name="lineChannelAccessToken"
                      rows={3}
                      defaultValue={tenant.lineChannelAccessToken ?? ""}
                      placeholder="未設定"
                      className={`mt-1.5 ${inputCls} resize-none font-mono text-xs leading-relaxed`}
                    />
                  </div>

                  {/* 友達追加URL */}
                  <div>
                    <label htmlFor={`edit-line-friend-${tenant.id}`} className="block text-sm font-medium text-gray-700">
                      友達追加URL
                      <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
                    </label>
                    <input
                      id={`edit-line-friend-${tenant.id}`}
                      name="lineFriendUrl"
                      type="url"
                      defaultValue={tenant.lineFriendUrl ?? ""}
                      placeholder="https://line.me/R/ti/p/@xxxxx"
                      className={`mt-1.5 ${inputCls}`}
                    />
                    <p className="mt-1.5 text-xs text-gray-400">
                      設定すると公開予約フォームの完了画面にLINE友達追加ボタンが表示されます
                    </p>
                  </div>
                </div>
              </div>

              {/* フッター（固定） */}
              <div className="shrink-0 flex justify-end gap-2.5 border-t border-gray-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isFormPending}
                  className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60 transition-colors"
                >
                  {isFormPending
                    ? <><Loader2 size={14} className="animate-spin" />保存中…</>
                    : <><Save size={14} />保存する</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
