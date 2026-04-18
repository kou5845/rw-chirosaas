"use client";

/**
 * 予約作成・編集ダイアログ（汎用版）
 *
 * - A院（Professional + training）: 施術 / トレーニング タブ → マスタドロップダウン → 自動入力
 * - A院（Professional のみ）/ B院: 施術マスタドロップダウン → 自動入力
 * - マスタ未登録: 自由入力フォールバック
 *
 * CLAUDE.md 規約:
 *   - 予約は pending ステータスで作成（require_approval 必須）
 *   - モバイルファースト・44px タップターゲット保証
 */

import { useActionState, useEffect, useRef, useState } from "react";
import {
  X, CalendarPlus, Pencil, Loader2, AlertCircle, CheckCircle2,
  Clock, Search, User, Dumbbell, Syringe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  upsertAppointment,
  type UpsertAppointmentState,
} from "@/app/[tenantId]/appointments/upsert-action";

// ── 外部公開型 ────────────────────────────────────────────────────────────────

export type BusinessHourData = {
  dayOfWeek: number;
  isOpen:    boolean;
  openTime:  string;
  closeTime: string;
};

export type ServiceItem = {
  id:          string;
  name:        string;
  duration:    number;
  intervalMin: number;
  price:       number;
};

export type ExerciseItem = {
  id:          string;
  name:        string;
  duration:    number;
  intervalMin: number;
  price:       number;
  category:    string | null;
};

type Staff   = { id: string; displayName: string };
type Patient = { id: string; displayName: string; nameKana: string | null };

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
  tenantId:        string;
  tenantSlug:      string;
  patientId?:      string;
  patientList?:    Patient[];
  staffList:       Staff[];
  businessHours:   BusinessHourData[];
  lunchStartTime:  string | null;
  lunchEndTime:    string | null;
  slotInterval?:   number;
  initialDate?:    string;
  initialTime?:    string;
  editMode?:       EditModeData;
  /** 施術マスタ（duration/price でオートフィル）*/
  services?:       ServiceItem[];
  /** トレーニング種目マスタ（professional + training_record 有効時）*/
  exercises?:      ExerciseItem[];
  isProfessional?: boolean;
  trainingEnabled?: boolean;
  onClose:         () => void;
};

// ── ユーティリティ ────────────────────────────────────────────────────────────

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

  const date  = new Date(dateStr + "T00:00:00");
  const jsDay = date.getDay();
  const bh    = businessHours.find((h) => h.dayOfWeek === jsDay);

  if (!bh?.isOpen) return "この日は休診日です";

  const openTime  = bh?.openTime  ?? "09:00";
  const closeTime = bh?.closeTime ?? "20:00";
  const startMin  = timeToMin(timeStr);
  const endMin    = startMin + duration;

  if (startMin < timeToMin(openTime))  return `営業開始前です（開始: ${openTime}〜）`;
  if (endMin > timeToMin(closeTime))   return `終業時間を超えます（〜${closeTime}まで）`;

  if (lunchStartTime && lunchEndTime) {
    const ls = timeToMin(lunchStartTime), le = timeToMin(lunchEndTime);
    if (startMin < le && endMin > ls)
      return `昼休みと重複しています（${lunchStartTime}〜${lunchEndTime}）`;
  }

  return null;
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

// ── 患者検索 ─────────────────────────────────────────────────────────────────

/** 患者選択後の表示ラベル: 氏名 / 読み仮名 / ID */
function patientLabel(p: Patient): string {
  const id = `#${p.id.slice(-6).toUpperCase()}`;
  return p.nameKana ? `${p.displayName} / ${p.nameKana} / ${id}` : `${p.displayName} / ${id}`;
}

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

  const filtered = (() => {
    if (query.length === 0) return patientList.slice(0, 30);
    // "#" 除去で ID 検索にも対応
    const q       = query.toLowerCase();
    const qNoHash = q.replace(/^#/, "");
    return patientList.filter((p) =>
      p.displayName.toLowerCase().includes(q) ||
      (p.nameKana && p.nameKana.toLowerCase().includes(q)) ||
      p.id.slice(-6).toLowerCase().includes(qNoHash)
    ).slice(0, 30);
  })();

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function choose(p: Patient) {
    setSelected(p);
    setQuery(patientLabel(p));
    setOpen(false);
    onSelect(p);
  }

  function handleInput(v: string) {
    setQuery(v);
    setOpen(true);
    if (selected && patientLabel(selected) !== v) { setSelected(null); onSelect(null); }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative mt-1.5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text" value={query} placeholder="患者名・ふりがな・IDで検索…" autoComplete="off"
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          className={`${inputCls} pl-9 pr-3 ${!selected && query ? errCls : ""}`}
        />
        {selected && <User size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--brand-medium)]" />}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtered.map((p) => (
            <button key={p.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--brand-bg)]">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)] text-xs font-bold text-[var(--brand-dark)]">
                {p.displayName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{p.displayName}</p>
                <p className="text-xs text-gray-400 truncate">
                  {p.nameKana && <span className="mr-2">{p.nameKana}</span>}
                  <span>#{p.id.slice(-6).toUpperCase()}</span>
                </p>
              </div>
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
  services     = [],
  exercises    = [],
  isProfessional  = false,
  trainingEnabled = false,
  onClose,
}: Props) {
  const isEdit       = !!editMode;
  const TIME_OPTIONS = buildTimeOptions(slotInterval);

  // タブ表示制御
  const showTreatmentTab = services.length > 0;
  const showExerciseTab  = trainingEnabled && exercises.length > 0;
  const showTabs         = showTreatmentTab && showExerciseTab;
  const hasAnyMaster     = showTreatmentTab || showExerciseTab;

  const [state, action, isPending] = useActionState<UpsertAppointmentState, FormData>(
    upsertAppointment,
    null
  );

  // 日時・所要時間（バリデーション用制御値）
  const [selectedDate,     setSelectedDate]     = useState(editMode?.date     ?? initialDate  ?? "");
  const [selectedTime,     setSelectedTime]     = useState(editMode?.time     ?? initialTime  ?? "");
  const [selectedDuration, setSelectedDuration] = useState(editMode?.durationMin ?? 0);

  // メニュー選択
  const [menuType,      setMenuType]      = useState<"service" | "exercise">("service");
  const [menuName,      setMenuName]      = useState(editMode?.menuName ?? "");
  const [priceValue,    setPriceValue]    = useState(
    editMode?.price != null ? String(editMode.price) : ""
  );
  const [intervalMin,   setIntervalMin]   = useState(0);

  // 患者選択（patientId 未固定の場合）
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
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

  const effectivePatientId = patientId ?? editMode?.patientId;

  // ── マスタ選択 → オートフィル ─────────────────────────────────
  function handleMenuSelect(id: string, type: "service" | "exercise") {
    const list = type === "service" ? services : exercises;
    const item = list.find((i) => i.id === id);
    if (!item) return;
    setMenuName(item.name);
    if (item.duration > 0) setSelectedDuration(item.duration);
    setPriceValue(String(item.price));
    setIntervalMin(item.intervalMin);
  }

  // ── タブ切替 ─────────────────────────────────────────────────
  function handleTabChange(type: "service" | "exercise") {
    setMenuType(type);
    setMenuName("");
    setSelectedDuration(0);
    setPriceValue("");
  }

  // カテゴリごとにグループ化（exercise の場合のみ）
  const groupedExercises = exercises.reduce<Record<string, ExerciseItem[]>>((acc, ex) => {
    const key = ex.category ?? "その他";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ex);
    return acc;
  }, {});

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
            <input type="hidden" name="tenantId"    value={tenantId} />
            <input type="hidden" name="tenantSlug"  value={tenantSlug} />
            <input type="hidden" name="intervalMin" value={intervalMin} />
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

                {/* ── 患者選択 ── */}
                {needPatientSelect && (
                  <div className="py-4">
                    <label className="block text-sm font-medium text-gray-700">
                      患者<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <PatientSelector patientList={patientList ?? []} onSelect={setSelectedPatient} />
                    {!selectedPatient && hasPatientError && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle size={11} />患者を選択してください
                      </p>
                    )}
                  </div>
                )}
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

                {/* ── メニュー ── */}
                <div className="py-4 space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    メニュー<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                  </label>

                  {/* タブバー（施術 + トレーニング 両方あり） */}
                  {showTabs && (
                    <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                      <button
                        type="button"
                        onClick={() => handleTabChange("service")}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-colors",
                          menuType === "service"
                            ? "bg-white text-[var(--brand-dark)] shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        )}
                      >
                        <Syringe size={13} />施術
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTabChange("exercise")}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-colors",
                          menuType === "exercise"
                            ? "bg-white text-[var(--brand-dark)] shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        )}
                      >
                        <Dumbbell size={13} />トレーニング
                      </button>
                    </div>
                  )}

                  {/* マスタドロップダウン */}
                  {hasAnyMaster && (menuType === "service" ? showTreatmentTab : showExerciseTab) && (
                    menuType === "service" ? (
                      <select
                        key={`service-select-${menuType}`}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) handleMenuSelect(e.target.value, "service");
                          e.target.value = "";
                        }}
                        className={selectCls}
                      >
                        <option value="" disabled>施術メニューを選択…</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.duration > 0 ? ` — ${s.duration}分` : ""}
                            {s.price > 0 ? ` / ¥${s.price.toLocaleString()}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        key={`exercise-select-${menuType}`}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) handleMenuSelect(e.target.value, "exercise");
                          e.target.value = "";
                        }}
                        className={selectCls}
                      >
                        <option value="" disabled>トレーニング種目を選択…</option>
                        {Object.entries(groupedExercises).map(([cat, items]) => (
                          <optgroup key={cat} label={cat}>
                            {items.map((ex) => (
                              <option key={ex.id} value={ex.id}>
                                {ex.name}
                                {ex.duration > 0 ? ` — ${ex.duration}分` : ""}
                                {ex.price > 0 ? ` / ¥${ex.price.toLocaleString()}` : ""}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )
                  )}

                  {/* hidden: form 送信用 */}
                  <input type="hidden" name="menuName" value={menuName} />

                  {/* 選択済みメニュー名 — 編集可能フィールド（選択後 or 編集モード or マスタなし） */}
                  {(menuName || !hasAnyMaster || isEdit) && (
                    <div>
                      {hasAnyMaster && (
                        <p className="mb-1 text-xs text-gray-400">
                          メニュー名<span className="ml-1 text-gray-300">（変更可）</span>
                        </p>
                      )}
                      <input
                        type="text"
                        value={menuName}
                        onChange={(e) => setMenuName(e.target.value)}
                        placeholder={hasAnyMaster ? "メニュー名を変更する場合は入力" : "例: 整体施術60分、骨盤矯正"}
                        className={`${inputCls} ${errors?.menuName ? errCls : ""}`}
                      />
                    </div>
                  )}

                  {/* マスタあり + 未選択 の案内 */}
                  {hasAnyMaster && !menuName && !isEdit && (
                    <p className="text-xs text-gray-400">
                      ↑ メニューを選択すると所要時間・料金が自動入力されます
                    </p>
                  )}

                  {errors?.menuName && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle size={11} />{errors.menuName}
                    </p>
                  )}
                </div>

                {/* ── 予約日 + 時間 ── */}
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div>
                    <label htmlFor="appt-date" className="block text-sm font-medium text-gray-700">
                      予約日<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <input
                      id="appt-date" name="date" type="date"
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
                      id="appt-time" name="time"
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

                {/* ── 所要時間 + 料金 ── */}
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div>
                    <label htmlFor="appt-duration" className="block text-sm font-medium text-gray-700">
                      所要時間（分）<span className="ml-1 text-xs font-normal text-red-500">必須</span>
                    </label>
                    <input
                      id="appt-duration"
                      name="durationMin"
                      type="number"
                      min={1}
                      max={480}
                      value={selectedDuration || ""}
                      onChange={(e) => setSelectedDuration(Number(e.target.value))}
                      placeholder="60"
                      className={`${inputCls} ${errors?.durationMin ? errCls : ""}`}
                    />
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
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
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
                    <select id="appt-staff" name="staffId"
                      defaultValue={editMode?.staffId ?? ""}
                      className={selectCls}>
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
                  <textarea id="appt-note" name="note" rows={3}
                    defaultValue={editMode?.note ?? ""}
                    placeholder="患者からの要望・院内メモなど"
                    className="mt-1.5 block w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 hover:border-[var(--brand-border)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors"
                  />
                </div>

                {/* ── 通知チェックボックス（新規作成のみ）── */}
                {!isEdit && (
                  <div className="py-4">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" name="sendNotification" defaultChecked
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
