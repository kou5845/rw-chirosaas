"use client";

/**
 * 予約作成・編集ダイアログ（汎用版）
 *
 * 患者詳細ページ（patientId 固定）と予約管理ページ（患者を検索選択）の
 * 両方で使用できる。editMode を渡すと編集モードで動作する。
 *
 * CLAUDE.md 規約:
 *   - 予約は pending ステータスで作成（require_approval 必須）
 *   - モバイルファースト・44px タップターゲット保証
 */

import { useActionState, useEffect, useRef, useState } from "react";
import {
  X, CalendarPlus, Pencil, Loader2, AlertCircle, CheckCircle2,
  Clock, Search, User,
} from "lucide-react";
import {
  upsertAppointment,
  type UpsertAppointmentState,
} from "@/app/[tenantId]/appointments/upsert-action";

export type BusinessHourData = {
  dayOfWeek: number;
  isOpen:    boolean;
  openTime:  string;
  closeTime: string;
};

type Staff   = { id: string; displayName: string };
type Patient = { id: string; displayName: string };

export type EditModeData = {
  appointmentId: string;
  patientId:     string;
  patientName:   string;
  date:          string;   // "YYYY-MM-DD"
  time:          string;   // "HH:mm"
  menuName:      string;
  durationMin:   number;
  price:         number;
  staffId?:      string | null;
  note?:         string | null;
};

type Props = {
  tenantId:       string;
  tenantSlug:     string;
  /** 固定患者ID（患者詳細ページから開く場合）。未指定の場合は患者検索UIを表示 */
  patientId?:     string;
  /** patientId 未指定時に必須 */
  patientList?:   Patient[];
  staffList:      Staff[];
  businessHours:  BusinessHourData[];
  lunchStartTime: string | null;
  lunchEndTime:   string | null;
  /** 予約スロットの刻み幅（分）: 15 | 20 | 30 | 60 */
  slotInterval?:  number;
  /** カレンダーのスロットクリックで渡される初期日付 "YYYY-MM-DD" */
  initialDate?:   string;
  /** カレンダーのスロットクリックで渡される初期時刻 "HH:mm" */
  initialTime?:   string;
  /** 渡すと編集モードとして動作する */
  editMode?:      EditModeData;
  onClose:        () => void;
};

// ── 定数 ─────────────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { value: 30,  label: "30分" },
  { value: 45,  label: "45分" },
  { value: 60,  label: "60分" },
  { value: 90,  label: "90分" },
  { value: 120, label: "120分" },
];

function buildTimeOptions(slotInterval: number): string[] {
  const opts: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += slotInterval) {
      if (h === 22 && m > 0) break;
      opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return opts;
}

const today = new Date().toISOString().split("T")[0];

// ── スタイル定数 ──────────────────────────────────────────────────────────────

const selectCls =
  "mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800 " +
  "hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] " +
  "focus:border-transparent transition-colors appearance-none cursor-pointer";
const inputCls =
  "mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 " +
  "placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--brand)] focus:border-transparent transition-colors";
const errCls = "border-red-300 bg-red-50/50";

// ── バリデーション ─────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function validateSlot(
  dateStr: string,
  timeStr: string,
  duration: number,
  businessHours: BusinessHourData[],
  lunchStartTime: string | null,
  lunchEndTime:   string | null,
): string | null {
  if (!dateStr || !timeStr || !duration) return null;

  const date   = new Date(dateStr + "T00:00:00");
  const jsDay  = date.getDay();
  const bh     = businessHours.find((h) => h.dayOfWeek === jsDay);
  const isOpen = bh?.isOpen  ?? true;

  if (!isOpen) return "この日は休診日です";

  const openTime  = bh?.openTime  ?? "09:00";
  const closeTime = bh?.closeTime ?? "20:00";
  const startMin  = timeToMin(timeStr);
  const endMin    = startMin + duration;

  if (startMin < timeToMin(openTime))
    return `営業開始前です（開始: ${openTime}〜）`;
  if (endMin > timeToMin(closeTime))
    return `終業時間を超えます（〜${closeTime}まで）`;

  if (lunchStartTime && lunchEndTime) {
    const ls = timeToMin(lunchStartTime), le = timeToMin(lunchEndTime);
    if (startMin < le && endMin > ls)
      return `昼休みと重複しています（${lunchStartTime}〜${lunchEndTime}）`;
  }

  return null;
}

// ── 患者検索コンポーネント ────────────────────────────────────────────────────

function PatientSelector({
  patientList,
  onSelect,
}: {
  patientList: Patient[];
  onSelect: (p: Patient | null) => void;
}) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [open,     setOpen]     = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.length === 0
    ? patientList.slice(0, 30)
    : patientList
        .filter((p) => p.displayName.includes(query))
        .slice(0, 30);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function choose(p: Patient) {
    setSelected(p);
    setQuery(p.displayName);
    setOpen(false);
    onSelect(p);
  }

  function handleInput(v: string) {
    setQuery(v);
    setOpen(true);
    if (selected && selected.displayName !== v) {
      setSelected(null);
      onSelect(null);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative mt-1.5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          placeholder="患者名で検索…"
          autoComplete="off"
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          className={`${inputCls} pl-9 pr-3 ${!selected && query ? errCls : ""}`}
        />
        {selected && (
          <User size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-medium)]" />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-[var(--brand-dark)]">
                {p.displayName.slice(0, 1)}
              </div>
              {p.displayName}
            </button>
          ))}
        </div>
      )}

      {open && query.length > 0 && filtered.length === 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400 shadow-lg">
          一致する患者が見つかりません
        </div>
      )}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export function NewAppointmentDialog({
  tenantId,
  tenantSlug,
  patientId,
  patientList,
  staffList,
  businessHours,
  lunchStartTime,
  lunchEndTime,
  slotInterval = 30,
  initialDate,
  initialTime,
  editMode,
  onClose,
}: Props) {
  const isEdit = !!editMode;
  const TIME_OPTIONS = buildTimeOptions(slotInterval);

  const [state, action, isPending] = useActionState<UpsertAppointmentState, FormData>(
    upsertAppointment,
    null
  );

  // バリデーション用制御値（編集モードでは既存値で初期化）
  const [selectedDate,     setSelectedDate]     = useState(editMode?.date     ?? initialDate  ?? "");
  const [selectedTime,     setSelectedTime]     = useState(editMode?.time     ?? initialTime  ?? "");
  const [selectedDuration, setSelectedDuration] = useState(editMode?.durationMin ?? 0);

  // 患者選択（patientId 未固定の場合）
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; displayName: string } | null>(null);
  const needPatientSelect = !patientId && !editMode?.patientId;

  // 成功後: 0.9秒後に自動クローズ
  useEffect(() => {
    if (state?.success) {
      const t = setTimeout(onClose, 900);
      return () => clearTimeout(t);
    }
  }, [state?.success, onClose]);

  const errors = state?.errors;

  const slotWarning = validateSlot(
    selectedDate, selectedTime, selectedDuration,
    businessHours, lunchStartTime, lunchEndTime,
  );
  const hasSlotError    = slotWarning !== null && Boolean(selectedDate && selectedTime && selectedDuration);
  const hasPatientError = needPatientSelect && !selectedPatient;
  const blockSubmit     = hasSlotError || hasPatientError;

  // 編集モードの実効 patientId
  const effectivePatientId = patientId ?? editMode?.patientId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">

        {/* ── ヘッダー ── */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-[var(--brand-bg)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
              {isEdit ? <Pencil size={15} /> : <CalendarPlus size={15} />}
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--brand-darker)]">
                {isEdit ? "予約を編集" : "新規予約を追加"}
              </p>
              <p className="text-xs text-[var(--brand-dark)]/70">
                {isEdit
                  ? `${editMode.patientName} さんの予約を変更します`
                  : "予約は「確定済み」として登録されます"}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* ── 成功 ── */}
        {state?.success ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <p className="text-sm font-semibold text-gray-800">
              {isEdit ? "予約を更新しました" : "予約を登録しました"}
            </p>
            <p className="text-xs text-gray-400">予約一覧・患者詳細に反映されました</p>
          </div>
        ) : (
          <form action={action}>
            {/* hidden */}
            <input type="hidden" name="tenantId"   value={tenantId} />
            <input type="hidden" name="tenantSlug" value={tenantSlug} />
            {effectivePatientId && <input type="hidden" name="patientId" value={effectivePatientId} />}
            {!effectivePatientId && selectedPatient && (
              <input type="hidden" name="patientId" value={selectedPatient.id} />
            )}
            {isEdit && <input type="hidden" name="appointmentId" value={editMode.appointmentId} />}

            <div className="max-h-[72vh] overflow-y-auto">
              <div className="divide-y divide-gray-50 px-6">

                {/* 全体エラー */}
                {errors?.general && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{errors.general}</span>
                  </div>
                )}

                {/* ── 患者選択（patientId 未固定 + 編集モード外の場合のみ）── */}
                {needPatientSelect && (
                  <div className="py-4">
                    <label className="block text-sm font-medium text-gray-700">
                      患者
                      <span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <PatientSelector
                      patientList={patientList ?? []}
                      onSelect={setSelectedPatient}
                    />
                    {!selectedPatient && hasPatientError && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle size={11} />患者を選択してください
                      </p>
                    )}
                  </div>
                )}

                {/* 編集モード: 患者名表示（読み取り専用）*/}
                {isEdit && (
                  <div className="py-4">
                    <p className="text-sm font-medium text-gray-700">患者</p>
                    <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-[var(--brand-dark)]">
                        {editMode.patientName.slice(0, 1)}
                      </div>
                      <span className="text-sm font-medium text-gray-700">{editMode.patientName}</span>
                    </div>
                  </div>
                )}

                {/* ── 予約日 + 時間 ── */}
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div>
                    <label htmlFor="appt-date" className="block text-sm font-medium text-gray-700">
                      予約日<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <input
                      id="appt-date"
                      name="date"
                      type="date"
                      min={isEdit ? undefined : today}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className={`${inputCls} ${errors?.date ? errCls : ""}`}
                    />
                    {errors?.date && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle size={11} />{errors.date}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="appt-time" className="block text-sm font-medium text-gray-700">
                      時間<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <select
                      id="appt-time"
                      name="time"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className={`${selectCls} ${errors?.time ? errCls : ""}`}
                    >
                      <option value="">選択</option>
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {errors?.time && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle size={11} />{errors.time}
                      </p>
                    )}
                  </div>
                </div>

                {/* スロットバリデーション警告 */}
                {slotWarning && selectedDate && selectedTime && selectedDuration > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    <Clock size={14} className="mt-0.5 shrink-0" />
                    <span>{slotWarning}</span>
                  </div>
                )}

                {/* ── メニュー ── */}
                <div className="py-4">
                  <label htmlFor="appt-menu" className="block text-sm font-medium text-gray-700">
                    メニュー<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                  </label>
                  <input
                    id="appt-menu"
                    name="menuName"
                    type="text"
                    defaultValue={editMode?.menuName ?? ""}
                    placeholder="例: 整体施術60分、骨盤矯正"
                    className={`${inputCls} ${errors?.menuName ? errCls : ""}`}
                  />
                  {errors?.menuName && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle size={11} />{errors.menuName}
                    </p>
                  )}
                </div>

                {/* ── 所要時間 + 料金 ── */}
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div>
                    <label htmlFor="appt-duration" className="block text-sm font-medium text-gray-700">
                      所要時間<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <select
                      id="appt-duration"
                      name="durationMin"
                      value={selectedDuration || ""}
                      onChange={(e) => setSelectedDuration(Number(e.target.value))}
                      className={`${selectCls} ${errors?.durationMin ? errCls : ""}`}
                    >
                      <option value="">選択</option>
                      {DURATION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {errors?.durationMin && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle size={11} />{errors.durationMin}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="appt-price" className="block text-sm font-medium text-gray-700">
                      料金（円）<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <input
                      id="appt-price"
                      name="price"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={100}
                      defaultValue={editMode?.price ?? ""}
                      placeholder="例: 5000"
                      className={`${inputCls} ${errors?.price ? errCls : ""}`}
                    />
                    {errors?.price && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle size={11} />{errors.price}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── スタッフ ── */}
                {staffList.length > 0 && (
                  <div className="py-4">
                    <label htmlFor="appt-staff" className="block text-sm font-medium text-gray-700">
                      担当スタッフ<span className="ml-1 text-xs font-normal text-gray-400">任意</span>
                    </label>
                    <select
                      id="appt-staff"
                      name="staffId"
                      defaultValue={editMode?.staffId ?? ""}
                      className={selectCls}
                    >
                      <option value="">指定なし</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>{s.displayName}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* ── 備考 ── */}
                <div className="py-4">
                  <label htmlFor="appt-note" className="block text-sm font-medium text-gray-700">
                    備考<span className="ml-1 text-xs font-normal text-gray-400">任意</span>
                  </label>
                  <textarea
                    id="appt-note"
                    name="note"
                    rows={3}
                    defaultValue={editMode?.note ?? ""}
                    placeholder="患者からの要望・院内メモなど"
                    className="mt-1.5 block w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors"
                  />
                </div>

                {/* ── 通知チェックボックス（新規作成のみ）── */}
                {!isEdit && (
                  <div className="py-4">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        name="sendNotification"
                        defaultChecked
                        className="h-4 w-4 rounded border-gray-300 text-[var(--brand-medium)] accent-[var(--brand-medium)] focus:ring-[var(--brand)]"
                      />
                      <span className="text-sm text-gray-700">
                        患者に通知を送る
                        <span className="ml-1.5 text-xs text-gray-400">（メール・LINE）</span>
                      </span>
                    </label>
                  </div>
                )}

              </div>
            </div>

            {/* ── フッター ── */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-6 py-4">
              <button type="button" onClick={onClose}
                className="flex h-11 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50">
                キャンセル
              </button>
              <button type="submit" disabled={isPending || blockSubmit}
                className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60">
                {isPending ? (
                  <><Loader2 size={15} className="animate-spin" />{isEdit ? "更新中…" : "登録中…"}</>
                ) : isEdit ? (
                  <><Pencil size={15} />変更を保存する</>
                ) : (
                  <><CalendarPlus size={15} />予約を登録する</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
