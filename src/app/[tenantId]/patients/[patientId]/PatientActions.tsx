"use client";

/**
 * 患者詳細ページ — 編集 / 削除 アクション（Client Component）
 *
 * - 編集: モーダルダイアログで患者情報を更新
 * - 削除: AlertDialog で2段階確認 → Sonner toast
 */

import { useState, useTransition, useActionState, useEffect } from "react";
import {
  Pencil, Trash2, X, Save, Loader2, AlertCircle,
  UserCog, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updatePatient, deletePatient, type UpdatePatientState } from "./patient-actions";

// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

type PatientData = {
  id:              string;
  displayName:     string;
  nameKana:        string | null;
  phone:           string | null;
  email:           string | null;
  birthDate:       Date | null;
  emergencyContact: string | null;
  memo:            string | null;
};

type Props = {
  patient:    PatientData;
  tenantId:   string;
  tenantSlug: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// スタイル定数
// ─────────────────────────────────────────────────────────────────────────────

const inputBase =
  "mt-1.5 block w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const inputNormal = "border-gray-200 bg-white hover:border-[var(--brand-border)]";
const inputError  = "border-red-300 bg-red-50/50";
const selectBase  =
  "mt-1.5 block rounded-xl border px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors appearance-none cursor-pointer";

const THIS_YEAR = new Date().getFullYear();
const YEARS  = Array.from({ length: 101 }, (_, i) => THIS_YEAR - i);
const MONTHS = Array.from({ length: 12  }, (_, i) => i + 1);
const DAYS   = Array.from({ length: 31  }, (_, i) => i + 1);

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export function PatientActions({ patient, tenantId, tenantSlug }: Props) {
  const [editOpen,   setEditOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      {/* ── ボタン群 ── */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label="患者情報を編集"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/20 hover:text-white"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          aria-label="患者を削除"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-red-500/20 hover:text-red-300"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* ── 編集モーダル ── */}
      {editOpen && (
        <EditDialog
          patient={patient}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* ── 削除確認ダイアログ ── */}
      {deleteOpen && (
        <DeleteDialog
          patient={patient}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 編集ダイアログ
// ─────────────────────────────────────────────────────────────────────────────

function EditDialog({
  patient,
  tenantId,
  tenantSlug,
  onClose,
}: {
  patient:    PatientData;
  tenantId:   string;
  tenantSlug: string;
  onClose:    () => void;
}) {
  const [state, action, isPending] = useActionState<UpdatePatientState, FormData>(
    updatePatient,
    null
  );
  const errors = state?.errors;

  // 保存成功 → トースト + ダイアログを閉じる
  useEffect(() => {
    if (state?.success) {
      toast.success("患者情報を更新しました", { duration: 3000 });
      onClose();
    }
  }, [state?.success, onClose]);

  // ESC でクローズ
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bd = patient.birthDate ? new Date(patient.birthDate) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* ダイアログ本体 */}
      <div className="relative z-10 w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl">

        {/* ヘッダー */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              <UserCog size={15} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">患者情報を編集</p>
              <p className="text-xs text-[var(--brand-dark)]/70">{patient.displayName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* フォーム */}
        <form action={action} className="divide-y divide-gray-50 px-6">
          <input type="hidden" name="tenantId"   value={tenantId} />
          <input type="hidden" name="tenantSlug" value={tenantSlug} />
          <input type="hidden" name="patientId"  value={patient.id} />

          {/* 全体エラー */}
          {errors?.general && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mt-4 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{errors.general}</span>
            </div>
          )}

          {/* 氏名 */}
          <div className="py-4">
            <label htmlFor="edit-displayName" className="block text-sm font-medium text-gray-700">
              氏名（漢字）
              <span className="ml-1.5 text-xs font-normal text-red-500">必須</span>
            </label>
            <input
              id="edit-displayName"
              name="displayName"
              type="text"
              defaultValue={patient.displayName}
              className={cn(inputBase, errors?.displayName ? inputError : inputNormal)}
            />
            {errors?.displayName && <FieldError msg={errors.displayName} />}
          </div>

          {/* ふりがな */}
          <div className="py-4">
            <label htmlFor="edit-nameKana" className="block text-sm font-medium text-gray-700">
              ふりがな（ひらがな）
              <span className="ml-1.5 text-xs font-normal text-red-500">必須</span>
            </label>
            <input
              id="edit-nameKana"
              name="nameKana"
              type="text"
              placeholder="例: やまだ たろう"
              defaultValue={patient.nameKana ?? ""}
              className={cn(inputBase, errors?.nameKana ? inputError : inputNormal)}
            />
            {errors?.nameKana && <FieldError msg={errors.nameKana} />}
          </div>

          {/* 電話番号 */}
          <div className="py-4">
            <label htmlFor="edit-phone" className="block text-sm font-medium text-gray-700">
              電話番号
              <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
            </label>
            <input
              id="edit-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={patient.phone ?? ""}
              className={cn(inputBase, errors?.phone ? inputError : inputNormal)}
            />
            {errors?.phone && <FieldError msg={errors.phone} />}
          </div>

          {/* メールアドレス */}
          <div className="py-4">
            <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700">
              メールアドレス
              <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
            </label>
            <input
              id="edit-email"
              name="email"
              type="email"
              inputMode="email"
              defaultValue={patient.email ?? ""}
              className={cn(inputBase, errors?.email ? inputError : inputNormal)}
            />
            {errors?.email && <FieldError msg={errors.email} />}
          </div>

          {/* 生年月日 */}
          <div className="py-4">
            <p className="block text-sm font-medium text-gray-700">
              生年月日
              <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  name="birthYear"
                  defaultValue={bd ? String(bd.getFullYear()) : ""}
                  className={cn(selectBase, "w-full", errors?.birthDate ? "border-red-300" : "border-gray-200 hover:border-[var(--brand-border)]")}
                >
                  <option value="">年</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}年</option>)}
                </select>
              </div>
              <div className="relative w-24">
                <select
                  name="birthMonth"
                  defaultValue={bd ? String(bd.getMonth() + 1) : ""}
                  className={cn(selectBase, "w-full", errors?.birthDate ? "border-red-300" : "border-gray-200 hover:border-[var(--brand-border)]")}
                >
                  <option value="">月</option>
                  {MONTHS.map((m) => <option key={m} value={m}>{m}月</option>)}
                </select>
              </div>
              <div className="relative w-20">
                <select
                  name="birthDay"
                  defaultValue={bd ? String(bd.getDate()) : ""}
                  className={cn(selectBase, "w-full", errors?.birthDate ? "border-red-300" : "border-gray-200 hover:border-[var(--brand-border)]")}
                >
                  <option value="">日</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}日</option>)}
                </select>
              </div>
            </div>
            {errors?.birthDate && <FieldError msg={errors.birthDate} />}
          </div>

          {/* 緊急連絡先 */}
          <div className="py-4">
            <label htmlFor="edit-emergencyContact" className="block text-sm font-medium text-gray-700">
              緊急連絡先
              <span className="ml-1.5 text-xs font-normal text-gray-400">任意</span>
            </label>
            <input
              id="edit-emergencyContact"
              name="emergencyContact"
              type="text"
              defaultValue={patient.emergencyContact ?? ""}
              placeholder="例: 山田 花子（妻）090-0000-0000"
              className={cn(inputBase, inputNormal)}
            />
          </div>

          {/* 院内メモ */}
          <div className="py-4">
            <label htmlFor="edit-memo" className="block text-sm font-medium text-gray-700">
              院内メモ
              <span className="ml-1.5 text-xs font-normal text-gray-400">任意・患者非表示</span>
            </label>
            <textarea
              id="edit-memo"
              name="memo"
              rows={3}
              defaultValue={patient.memo ?? ""}
              placeholder="アレルギー・注意事項など"
              className={cn(inputBase, inputNormal, "resize-none")}
            />
          </div>

          {/* アクションボタン */}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-100 bg-white py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <><Loader2 size={14} className="animate-spin" />保存中…</>
              ) : (
                <><Save size={14} />保存する</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 削除確認ダイアログ
// ─────────────────────────────────────────────────────────────────────────────

function DeleteDialog({
  patient,
  tenantId,
  tenantSlug,
  onClose,
}: {
  patient:    PatientData;
  tenantId:   string;
  tenantSlug: string;
  onClose:    () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isPending]);

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePatient(patient.id, tenantId, tenantSlug);
      // deletePatient が成功すると redirect() で遷移するためここには到達しない
      if (!result.success) {
        setError(result.error);
        toast.error("削除に失敗しました", { description: result.error });
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* ダイアログ本体 */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl">

        {/* ヘッダー */}
        <div className="flex items-start gap-4 p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-gray-900">患者情報を削除しますか？</p>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{patient.displayName}</span> 様の
              予約履歴・カルテを含むすべてのデータが完全に削除されます。
              <span className="mt-1 block font-semibold text-red-600">この操作は取り消せません。</span>
            </p>
          </div>
        </div>

        {/* エラー */}
        {error && (
          <div className="mx-6 mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ボタン */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex h-10 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex h-10 items-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <><Loader2 size={14} className="animate-spin" />削除中…</>
            ) : (
              <><Trash2 size={14} />削除する</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg: string }) {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
      <AlertCircle size={12} />
      {msg}
    </p>
  );
}
