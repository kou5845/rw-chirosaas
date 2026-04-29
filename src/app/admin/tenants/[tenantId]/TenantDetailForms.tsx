"use client";

import { useActionState, useState } from "react";
import {
  Save, Loader2, CheckCircle2, AlertCircle,
  Eye, EyeOff, Copy, Check,
  PowerOff, Power,
} from "lucide-react";
import { updateTenantDetailAction, updateContractAction, updateAdminMemoAction, toggleTenantStatusAction } from "./actions";
import type { UpdateTenantDetailState } from "./actions";
import { useRouter } from "next/navigation";

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";

function SaveResult({ state }: { state: UpdateTenantDetailState }) {
  if (!state) return null;
  if (state.success)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
        <CheckCircle2 size={14} className="shrink-0" /> 保存しました
      </div>
    );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
      <AlertCircle size={14} className="shrink-0" /> {state.error}
    </div>
  );
}

// ── 基本情報 + LINE設定フォーム ─────────────────────────────────────────

type BasicFormProps = {
  tenant: {
    id: string; name: string; plan: string; phone: string | null;
    address: string | null; lineChannelSecret: string | null;
    lineChannelAccessToken: string | null; lineFriendUrl: string | null;
  };
};

export function BasicInfoForm({ tenant }: BasicFormProps) {
  const [state, action, isPending] = useActionState<UpdateTenantDetailState, FormData>(
    updateTenantDetailAction, null,
  );
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhook/line/${tenant.id}`
    : `/api/webhook/line/${tenant.id}`;

  async function copyWebhook() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenant.id} />
      <SaveResult state={state} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">医院名 *</label>
          <input name="name" required defaultValue={tenant.name} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">プラン</label>
          <select name="plan" defaultValue={tenant.plan} className={`${inputCls} cursor-pointer`}>
            <option value="standard">Standard</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">電話番号</label>
          <input name="phone" type="tel" defaultValue={tenant.phone ?? ""} placeholder="03-1234-5678" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">住所</label>
          <input name="address" defaultValue={tenant.address ?? ""} placeholder="東京都…" className={inputCls} />
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 space-y-3">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">LINE 連携設定</p>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Webhook URL</p>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-gray-600 font-mono">
              {webhookUrl}
            </code>
            <button type="button" onClick={copyWebhook}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              {copied ? <><Check size={12} className="text-emerald-500" />コピー済</> : <><Copy size={12} />コピー</>}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Channel Secret</label>
          <div className="relative">
            <input name="lineChannelSecret" type={showSecret ? "text" : "password"}
              defaultValue={tenant.lineChannelSecret ?? ""} placeholder="未設定" autoComplete="off"
              className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowSecret(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Channel Access Token</label>
          <textarea name="lineChannelAccessToken" rows={3}
            defaultValue={tenant.lineChannelAccessToken ?? ""} placeholder="未設定"
            className={`${inputCls} resize-none font-mono text-xs`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">友だち追加URL <span className="text-gray-400">任意</span></label>
          <input name="lineFriendUrl" type="url" defaultValue={tenant.lineFriendUrl ?? ""}
            placeholder="https://line.me/R/ti/p/@xxxxx" className={inputCls} />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isPending}
          className="flex items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60 transition-colors">
          {isPending ? <><Loader2 size={14} className="animate-spin" />保存中…</> : <><Save size={14} />保存する</>}
        </button>
      </div>
    </form>
  );
}

// ── 契約・請求フォーム ────────────────────────────────────────────────

type ContractFormProps = {
  tenant: {
    id: string; contractType: string; monthlyPrice: number;
    contractStartAt: Date | null; nextBillingAt: Date | null; totalRevenue: number;
  };
};

function toInputDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function ContractForm({ tenant }: ContractFormProps) {
  const [state, action, isPending] = useActionState<UpdateTenantDetailState, FormData>(
    updateContractAction, null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenant.id} />
      <SaveResult state={state} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">契約タイプ</label>
          <select name="contractType" defaultValue={tenant.contractType} className={`${inputCls} cursor-pointer`}>
            <option value="monthly">月次（Monthly）</option>
            <option value="yearly">年次（Yearly）</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">月額料金（円）</label>
          <input name="monthlyPrice" type="number" min="0" step="100"
            defaultValue={tenant.monthlyPrice} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">契約開始日</label>
          <input name="contractStartAt" type="date" defaultValue={toInputDate(tenant.contractStartAt)}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">次回請求日</label>
          <input name="nextBillingAt" type="date" defaultValue={toInputDate(tenant.nextBillingAt)}
            className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">累計支払額（円）</label>
          <input name="totalRevenue" type="number" min="0" step="100"
            defaultValue={tenant.totalRevenue} className={inputCls} />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isPending}
          className="flex items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60 transition-colors">
          {isPending ? <><Loader2 size={14} className="animate-spin" />保存中…</> : <><Save size={14} />保存する</>}
        </button>
      </div>
    </form>
  );
}

// ── 運営メモフォーム ──────────────────────────────────────────────────

export function AdminMemoForm({ tenantId, adminMemo }: { tenantId: string; adminMemo: string | null }) {
  const [state, action, isPending] = useActionState<UpdateTenantDetailState, FormData>(
    updateAdminMemoAction, null,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <SaveResult state={state} />
      <textarea name="adminMemo" rows={6} defaultValue={adminMemo ?? ""}
        placeholder="この医院に関する運営メモを自由に記入してください…"
        className={`${inputCls} resize-y`} />
      <div className="flex justify-end">
        <button type="submit" disabled={isPending}
          className="flex items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60 transition-colors">
          {isPending ? <><Loader2 size={14} className="animate-spin" />保存中…</> : <><Save size={14} />保存する</>}
        </button>
      </div>
    </form>
  );
}

// ── 有効/無効トグルボタン ─────────────────────────────────────────────

export function ToggleStatusButton({ tenantId, isActive }: { tenantId: string; isActive: boolean }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function handleToggle() {
    setError(null);
    setIsPending(true);
    const result = await toggleTenantStatusAction(tenantId, !isActive);
    setIsPending(false);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error ?? "エラーが発生しました。");
    }
    setConfirm(false);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={() => isActive ? setConfirm(true) : handleToggle()}
        disabled={isPending}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
          isActive
            ? "border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        }`}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : isActive ? <PowerOff size={14} /> : <Power size={14} />}
        {isActive ? "医院を無効化" : "医院を有効化"}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <p className="font-semibold text-gray-800">医院を無効化しますか？</p>
            <p className="text-sm text-gray-500">スタッフは即時ログインできなくなります。</p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirm(false)}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={handleToggle}
                className="flex-1 h-10 rounded-xl bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600">
                無効化する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
