"use client";

/**
 * 患者向け公開予約フォーム — 3ステップ形式
 *
 * Step 1: 日付選択（月間カレンダー）
 * Step 2: 時間選択（スロットグリッド）
 * Step 3: 患者情報入力 + 送信
 */

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  ChevronLeft, ChevronRight, Clock, CalendarDays,
  User, Phone, Mail, CheckCircle2, AlertCircle, Loader2, MapPin, MessageCircle, Cake,
} from "lucide-react";
import {
  getAvailableSlots, submitPublicReservation, checkPatientMatch,
  type PublicReservationState,
} from "./actions";

// ── 型定義 ────────────────────────────────────────────────────────────

export type BusinessHourSummary = {
  dayOfWeek: number;
  isOpen:    boolean;
};

export type ServiceSummary = {
  id:          string;
  name:        string;
  duration:    number;
  intervalMin: number;
  price:       number;
};

type PrefillData = {
  name?:     string;
  nameKana?: string;
  phone?:    string;
  email?:    string;
};

export type LockedPatient = {
  id:          string;
  displayName: string;
  nameKana:    string | null;
  phone:       string | null;
  email:       string | null;
  lineUserId:  string | null;
};

type WarningState = {
  type: "not_found" | "name_mismatch";
};

type Props = {
  tenantSlug:     string;
  businessHours:  BusinessHourSummary[];
  services?:      ServiceSummary[];
  phone?:         string | null;
  address?:       string | null;
  lineEnabled?:   boolean;
  lineFriendUrl?: string | null;
  prefill?:       PrefillData;
  lockedPatient?: LockedPatient;
};

// ── 定数 ─────────────────────────────────────────────────────────────

const DAY_LABELS  = ["日", "月", "火", "水", "木", "金", "土"] as const;
const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月",
                     "7月", "8月", "9月", "10月", "11月", "12月"] as const;

// ── ユーティリティ ────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateJP(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${y}年${m}月${d}日（${DAY_LABELS[dow]}）`;
}

/** カレンダー用: 週の最初から始まるマス（null = 空白）の配列を返す */
function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDow  = new Date(year, month, 1).getDay();
  const lastDate  = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);
  return cells;
}

// ── 共通スタイル ──────────────────────────────────────────────────────

const btnPrimary =
  "flex items-center justify-center gap-2 h-12 w-full rounded-2xl " +
  "bg-[var(--brand-medium)] text-white font-semibold text-sm " +
  "hover:bg-[var(--brand-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const btnOutline =
  "flex items-center justify-center gap-1.5 h-11 rounded-xl " +
  "border border-gray-200 bg-white text-sm font-medium text-gray-600 " +
  "hover:bg-gray-50 transition-colors px-4";

const inputCls =
  "block w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-[16px] leading-snug text-gray-800 " +
  "placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-medium)] " +
  "focus:border-transparent transition-colors";

// ── 登録済み患者エラーカード ──────────────────────────────────────────

function ExistingPatientCard({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-800">
            すでにご登録済みのお客様です
          </p>
          <p className="text-xs leading-relaxed text-amber-700">
            「2回目以降の方」のフローからご予約ください。
          </p>
        </div>
      </div>
      <a
        href={`/${tenantSlug}/reserve`}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
      >
        2回目以降の方はこちら →
      </a>
    </div>
  );
}

// ── ステップインジケーター ────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "日付" },
    { n: 2, label: "時間" },
    { n: 3, label: "情報" },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
              current === s.n
                ? "bg-[var(--brand-medium)] text-white shadow-md"
                : current > s.n
                ? "bg-[var(--brand-light)] text-[var(--brand-dark)]"
                : "bg-gray-100 text-gray-400"
            }`}>
              {current > s.n ? <CheckCircle2 size={16} /> : s.n}
            </div>
            <span className={`text-[11px] font-medium ${current >= s.n ? "text-[var(--brand-dark)]" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-0.5 mx-1 mb-4 rounded-full ${current > s.n ? "bg-[var(--brand-light)]" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────

export function ReserveForm({ tenantSlug, businessHours, services, phone, address, lineEnabled, lineFriendUrl, prefill, lockedPatient }: Props) {
  const today = new Date();

  // ステップ管理
  const [step, setStep]               = useState<1 | 2 | 3 | "done">(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  // メニュー選択（サービスマスタがある場合のみ使用）
  const hasServices = (services ?? []).length > 0;
  const [selectedServiceId,   setSelectedServiceId]   = useState<string>("");
  const [selectedMenuName,    setSelectedMenuName]     = useState<string>("");
  const [selectedDurationMin, setSelectedDurationMin] = useState<number>(0);
  const [selectedIntervalMin, setSelectedIntervalMin] = useState<number>(0);
  const [selectedPrice,       setSelectedPrice]       = useState<number>(0);

  function handleServiceSelect(id: string) {
    const svc = (services ?? []).find((s) => s.id === id);
    if (!svc) return;
    setSelectedServiceId(id);
    setSelectedMenuName(svc.name);
    setSelectedDurationMin(svc.duration);
    setSelectedIntervalMin(svc.intervalMin);
    setSelectedPrice(svc.price);
    // 日付・スロット選択をリセット
    setSelectedDate("");
    setSelectedTime("");
    setAvailableSlots([]);
    setSlotsError("");
  }

  // カレンダーが操作可能か: サービスがない or サービス選択済み
  const calendarActive = !hasServices || selectedServiceId !== "";

  // カレンダー表示月
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // タイムスロット
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsError,     setSlotsError]     = useState<string>("");
  const [,               startFetching]     = useTransition();

  // フォーム送信
  const [formState, formAction, isPending] = useActionState<PublicReservationState, FormData>(
    submitPublicReservation,
    null,
  );

  // 送信成功 → done 画面へ（useEffect で管理し、リセット後に再トリガーされないようにする）
  useEffect(() => {
    if (formState?.success) setStep("done");
  }, [formState]);

  // ── 患者照合・警告ステート ──
  const [warningState,  setWarningState]  = useState<WarningState | null>(null);
  const [isChecking,    setIsChecking]    = useState(false);
  const pendingFdRef = useRef<FormData | null>(null);

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    // マイページ認証済み → 照合スキップ
    if (lockedPatient) {
      formAction(fd);
      return;
    }

    const inputPhone = (fd.get("phone") as string | null)?.trim() ?? "";
    const inputName  = (fd.get("name")  as string | null)?.trim() ?? "";

    setIsChecking(true);
    try {
      const result = await checkPatientMatch(tenantSlug, inputPhone, inputName);
      if (result.status === "matched") {
        formAction(fd);
      } else {
        pendingFdRef.current = fd;
        setWarningState({ type: result.status });
      }
    } finally {
      setIsChecking(false);
    }
  }

  function handleWarningConfirm() {
    if (pendingFdRef.current) {
      formAction(pendingFdRef.current);
      pendingFdRef.current = null;
      setWarningState(null);
    }
  }

  function handleWarningBack() {
    pendingFdRef.current = null;
    setWarningState(null);
  }

  // ── 月移動 ──
  function prevMonth() {
    if (viewYear === today.getFullYear() && viewMonth === today.getMonth()) return;
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    const maxDate = new Date(today.getFullYear(), today.getMonth() + 3, 0);
    if (viewYear > maxDate.getFullYear() ||
        (viewYear === maxDate.getFullYear() && viewMonth >= maxDate.getMonth())) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  // ── 日付選択 ──
  function isDateAvailable(day: number) {
    const date       = new Date(viewYear, viewMonth, day);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dow        = date.getDay(); // 0=日〜6=土

    if (date < todayStart) return false;
    const bh = businessHours.find(b => Number(b.dayOfWeek) === dow);
    return bh?.isOpen ?? false;
  }

  function handleDateSelect(day: number) {
    if (!calendarActive) return;
    const dateStr = toDateStr(viewYear, viewMonth, day);
    setSelectedDate(dateStr);
    setAvailableSlots([]);
    setSlotsError("");

    startFetching(async () => {
      const result = await getAvailableSlots(
        tenantSlug,
        dateStr,
        selectedDurationMin > 0 ? selectedDurationMin : undefined,
        selectedIntervalMin > 0 ? selectedIntervalMin : undefined,
      );
      if (result.error) {
        setSlotsError(result.error);
      } else if (result.slots.length === 0) {
        setSlotsError("この日は満枠です。別の日をお選びください。");
      } else {
        setAvailableSlots(result.slots);
      }
      setStep(2);
    });
  }

  // ── 完了画面 ──
  if (step === "done") {
    const mapsUrl = address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;

    return (
      <div className="flex flex-col items-center gap-5 py-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--brand-bg)]">
          <CheckCircle2 size={40} className="text-[var(--brand-dark)]" />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-800">予約を受け付けました</p>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            スタッフが確認後、確定のご連絡をいたします。
            <br />
            LINE連携済みの方には、通知をお送りしました。
          </p>
        </div>

        {/* 予約内容 */}
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-6 py-4 text-left w-full space-y-1">
          <p className="text-xs font-semibold text-[var(--brand-dark)] mb-1">予約内容</p>
          {selectedMenuName && (
            <p className="text-sm font-semibold text-[var(--brand-darker)]">{selectedMenuName}</p>
          )}
          <p className="text-sm font-medium text-gray-800">{formatDateJP(selectedDate)}</p>
          <p className="text-sm text-gray-600">{selectedTime} 〜</p>
        </div>

        {/* 医院情報（電話・住所） */}
        {(phone || address) && (
          <div className="w-full rounded-2xl border border-gray-100 bg-white px-5 py-4 text-left space-y-3">
            {phone && (
              <div className="flex items-start gap-3">
                <Phone size={14} className="mt-0.5 shrink-0 text-[var(--brand-medium)]" />
                <div>
                  <p className="text-xs text-gray-500">変更・キャンセルはお電話ください</p>
                  <p className="text-sm font-semibold text-gray-800">{phone}</p>
                </div>
              </div>
            )}
            {address && mapsUrl && (
              <div className="flex items-start gap-3">
                <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--brand-medium)]" />
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">{address}</p>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-[var(--brand-medium)] underline underline-offset-2"
                  >
                    Google マップで見る →
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LINE 案内（未連携の患者のみ表示） */}
        {lineEnabled && lineFriendUrl && !lockedPatient?.lineUserId && (
          <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4 text-left space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle size={14} className="text-[#06C755] shrink-0" />
              <p className="text-xs font-semibold text-gray-700">LINEで次回がもっと便利に</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              公式LINEを友だち追加して電話番号を送ると、次回からLINEで予約管理ができます。
            </p>
            <a
              href={lineFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect width="20" height="20" rx="5" fill="white" fillOpacity="0.25"/>
                <path d="M10 3C6.134 3 3 5.686 3 9c0 1.98 1.05 3.74 2.693 4.888-.117.438-.424 1.582-.486 1.826-.076.3.11.296.23.216.094-.063 1.494-.98 2.098-1.378.454.063.921.096 1.396.096 3.866 0 7-2.686 7-6s-3.134-6-7-6z" fill="white"/>
              </svg>
              公式LINEを友だち追加
            </a>
          </div>
        )}

        {/* マイページリンク（マイページからの既存患者 or 今回新規登録した患者） */}
        {(lockedPatient || formState?.isNewPatient) && (
          <a
            href={`/${tenantSlug}/mypage${formState?.isNewPatient ? "/login" : ""}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] py-3.5 text-sm font-semibold text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-light)] active:bg-[var(--brand-light)]"
          >
            <CalendarDays size={15} />
            マイページで予約を確認する
          </a>
        )}

        <button
          onClick={() => {
            setSelectedDate("");
            setSelectedTime("");
            setAvailableSlots([]);
            setSlotsError("");
            setViewYear(today.getFullYear());
            setViewMonth(today.getMonth());
            setSelectedServiceId("");
            setSelectedMenuName("");
            setSelectedDurationMin(0);
            setSelectedIntervalMin(0);
            setSelectedPrice(0);
            setStep(1);
          }}
          className={btnOutline + " w-full"}
        >
          別の予約をする
        </button>
      </div>
    );
  }

  // ── Step 1: 日付選択 ──
  if (step === 1) {
    const cells = buildCalendarCells(viewYear, viewMonth);
    const isAtMin = viewYear === today.getFullYear() && viewMonth === today.getMonth();

    return (
      <div className="space-y-4">
        <StepIndicator current={1} />

        {/* メニュー選択（施術マスタがある場合のみ表示）*/}
        {hasServices && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              施術メニューを選択
              <span className="ml-1 text-red-500 font-normal normal-case">必須</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {(services ?? []).map((svc) => (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => handleServiceSelect(svc.id)}
                  className={[
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    selectedServiceId === svc.id
                      ? "border-[var(--brand-medium)] bg-[var(--brand-bg)] text-[var(--brand-dark)]"
                      : "border-gray-200 bg-white text-gray-700 hover:border-[var(--brand-border)] hover:bg-[var(--brand-bg)]",
                  ].join(" ")}
                >
                  <span>{svc.name}</span>
                  <span className="text-xs text-gray-400">
                    {svc.duration > 0 && `${svc.duration}分`}
                    {svc.duration > 0 && svc.price > 0 && " · "}
                    {svc.price > 0 && `¥${svc.price.toLocaleString()}`}
                  </span>
                </button>
              ))}
            </div>
            {!calendarActive && (
              <p className="text-xs text-amber-600">
                メニューを選択すると日付が選択できます
              </p>
            )}
          </div>
        )}

        {/* 月ナビゲーション */}
        <div className={["flex items-center justify-between px-1", !calendarActive && "opacity-40 pointer-events-none"].filter(Boolean).join(" ")}>
          <button
            onClick={prevMonth}
            disabled={isAtMin || !calendarActive}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors"
            aria-label="前の月"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <span className="font-semibold text-gray-800">
            {viewYear}年 {MONTH_NAMES[viewMonth]}
          </span>
          <button
            onClick={nextMonth}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            aria-label="次の月"
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 text-center">
          {DAY_LABELS.map((l, i) => (
            <div key={l} className={`py-1.5 text-xs font-semibold ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}>
              {l}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className={["grid grid-cols-7 gap-y-1 text-center", !calendarActive && "opacity-40 pointer-events-none"].filter(Boolean).join(" ")}>
          {cells.map((day, idx) => {
            if (day === null) return <div key={`e-${idx}`} />;
            const available = calendarActive && isDateAvailable(day);
            const dow = new Date(viewYear, viewMonth, day).getDay();
            const isToday =
              today.getFullYear() === viewYear &&
              today.getMonth()    === viewMonth &&
              today.getDate()     === day;

            return (
              <button
                key={day}
                onClick={() => available && handleDateSelect(day)}
                disabled={!available}
                className={`
                  mx-auto flex h-9 w-9 items-center justify-center rounded-full
                  text-sm font-medium transition-colors sm:h-10 sm:w-10
                  ${!available
                    ? "text-gray-200 cursor-not-allowed"
                    : dow === 0
                    ? "text-red-500 hover:bg-red-50 active:bg-red-100"
                    : dow === 6
                    ? "text-blue-500 hover:bg-blue-50 active:bg-blue-100"
                    : "text-gray-700 hover:bg-[var(--brand-bg)] active:bg-[var(--brand-light)]"
                  }
                  ${isToday && available ? "ring-2 ring-[var(--brand-medium)] ring-offset-1" : ""}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 pt-1">
          ご希望の日付をタップしてください
        </p>
      </div>
    );
  }

  // ── Step 2: 時間選択 ──
  if (step === 2) {
    return (
      <div className="space-y-5">
        <StepIndicator current={2} />

        {/* 選択済み日付 */}
        <div className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3">
          <CalendarDays size={15} className="shrink-0 text-[var(--brand-dark)]" />
          <span className="text-sm font-medium text-[var(--brand-darker)]">{formatDateJP(selectedDate)}</span>
        </div>

        {slotsError ? (
          <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {slotsError}
          </div>
        ) : availableSlots.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-[var(--brand-medium)]" />
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              ご希望の時間を選択
            </p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => { setSelectedTime(slot); setStep(3); }}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-[var(--brand-medium)] hover:bg-[var(--brand-bg)] hover:text-[var(--brand-dark)] transition-colors"
                >
                  <Clock size={13} className="text-gray-400" />
                  {slot}
                </button>
              ))}
            </div>
          </>
        )}

        <button onClick={() => setStep(1)} className={btnOutline}>
          <ChevronLeft size={14} />
          日付を選び直す
        </button>
      </div>
    );
  }

  // ── Step 3: 患者情報入力 ──
  const errors = formState?.success === false ? formState.errors : undefined;

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5">
      <StepIndicator current={3} />

      {/* 隠しフィールド */}
      <input type="hidden" name="tenantSlug"   value={tenantSlug} />
      <input type="hidden" name="date"         value={selectedDate} />
      <input type="hidden" name="time"         value={selectedTime} />
      {selectedMenuName    && <input type="hidden" name="menuName"    value={selectedMenuName} />}
      {selectedDurationMin > 0 && <input type="hidden" name="durationMin"  value={String(selectedDurationMin)} />}
      {selectedIntervalMin > 0 && <input type="hidden" name="intervalMin"  value={String(selectedIntervalMin)} />}
      {selectedPrice       > 0 && <input type="hidden" name="price"        value={String(selectedPrice)} />}

      {/* 予約内容サマリー */}
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-4 space-y-1.5">
        <p className="text-xs font-semibold text-[var(--brand-dark)] mb-2">ご予約内容</p>
        {selectedMenuName && (
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--brand-darker)]">
            {selectedMenuName}
            {selectedDurationMin > 0 && (
              <span className="text-xs font-normal text-gray-500">（{selectedDurationMin}分）</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <CalendarDays size={14} className="text-[var(--brand-medium)] shrink-0" />
          {formatDateJP(selectedDate)}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Clock size={14} className="text-[var(--brand-medium)] shrink-0" />
          {selectedTime} 〜
        </div>
      </div>

      {/* 全体エラー */}
      {errors?.general && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {errors.general}
        </div>
      )}

      {/* 登録済み患者エラー（同テナント内に同じ電話番号 or メールアドレスが存在） */}
      {formState?.existingPatient && (
        <ExistingPatientCard tenantSlug={tenantSlug} />
      )}

      {/* ── マイページ認証済み: ロック表示 ── */}
      {lockedPatient ? (
        <div className="space-y-3">
          {/* 隠し入力（フォーム送信用） */}
          <input type="hidden" name="patientId" value={lockedPatient.id} />
          <input type="hidden" name="name"      value={lockedPatient.displayName} />
          <input type="hidden" name="nameKana"  value={lockedPatient.nameKana ?? ""} />
          <input type="hidden" name="phone"     value={lockedPatient.phone ?? ""} />
          {lockedPatient.email && <input type="hidden" name="email" value={lockedPatient.email} />}

          {/* 患者情報カード */}
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-4">
            {/* バッジ */}
            <div className="mb-4 flex items-center gap-1.5">
              <CheckCircle2 size={15} className="shrink-0 text-[var(--brand-medium)]" />
              <p className="text-xs font-semibold text-[var(--brand-dark)]">登録情報を使用中</p>
            </div>

            {/* 情報グリッド */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <div>
                <p className="text-[11px] font-medium text-gray-400">お名前</p>
                <p className="mt-1 font-semibold text-gray-800">{lockedPatient.displayName}</p>
              </div>
              {lockedPatient.nameKana && (
                <div>
                  <p className="text-[11px] font-medium text-gray-400">ふりがな</p>
                  <p className="mt-1 font-medium text-gray-700">{lockedPatient.nameKana}</p>
                </div>
              )}
              {lockedPatient.phone && (
                <div>
                  <p className="text-[11px] font-medium text-gray-400">電話番号</p>
                  <p className="mt-1 font-mono font-medium text-gray-800">{lockedPatient.phone}</p>
                </div>
              )}
              {lockedPatient.email && (
                <div className="col-span-2">
                  <p className="text-[11px] font-medium text-gray-400">メールアドレス</p>
                  <p className="mt-1 break-all font-medium text-gray-700">{lockedPatient.email}</p>
                </div>
              )}
            </div>

            {/* マイページリンク */}
            <div className="mt-4 border-t border-[var(--brand-border)] pt-3 flex items-center justify-between">
              <p className="text-[11px] text-gray-400">登録情報の変更はマイページから行えます</p>
              <a
                href={`/${tenantSlug}/mypage#profile`}
                className="ml-3 shrink-0 text-[11px] font-semibold text-[var(--brand-medium)] underline underline-offset-2 hover:text-[var(--brand-dark)]"
              >
                マイページへ →
              </a>
            </div>
          </div>
        </div>
      ) : (
        /* ── 通常入力フォーム ── */
        <div className="space-y-5">
          {/* お名前 */}
          <div>
            <label htmlFor="reserve-name" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <User size={14} className="text-gray-400" />
              お名前
              <span className="ml-1 text-xs font-normal text-red-500">必須</span>
            </label>
            <input
              id="reserve-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="山田 太郎"
              defaultValue={prefill?.name ?? ""}
              className={inputCls + (errors?.name ? " border-red-300 bg-red-50/50" : "")}
            />
            {errors?.name && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.name}
              </p>
            )}
          </div>

          {/* ふりがな */}
          <div>
            <label htmlFor="reserve-kana" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <User size={14} className="text-gray-400" />
              ふりがな
              <span className="ml-1 text-xs font-normal text-red-500">必須</span>
            </label>
            <input
              id="reserve-kana"
              name="nameKana"
              type="text"
              required
              autoComplete="off"
              placeholder="やまだ たろう"
              defaultValue={prefill?.nameKana ?? ""}
              className={inputCls + (errors?.nameKana ? " border-red-300 bg-red-50/50" : "")}
            />
            {errors?.nameKana && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.nameKana}
              </p>
            )}
          </div>

          {/* 生年月日 */}
          <div>
            <label htmlFor="reserve-birthDate" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Cake size={14} className="text-gray-400" />
              生年月日
              <span className="ml-1 text-xs font-normal text-red-500">必須</span>
            </label>
            <input
              id="reserve-birthDate"
              name="birthDate"
              type="text"
              inputMode="numeric"
              maxLength={8}
              required
              autoComplete="bday"
              placeholder="例: 19830405"
              className={inputCls + " font-mono tracking-[0.15em]" + (errors?.birthDate ? " border-red-300 bg-red-50/50" : "")}
            />
            {errors?.birthDate ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.birthDate}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-400">
                西暦8桁で入力（例: 1983年4月5日 → 19830405）— 次回以降のログインIDとして使用します
              </p>
            )}
          </div>

          {/* 電話番号 */}
          <div>
            <label htmlFor="reserve-phone" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Phone size={14} className="text-gray-400" />
              電話番号
              <span className="ml-1 text-xs font-normal text-red-500">必須</span>
            </label>
            <input
              id="reserve-phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="090-1234-5678"
              defaultValue={prefill?.phone ?? ""}
              className={inputCls + (errors?.phone ? " border-red-300 bg-red-50/50" : "")}
            />
            {errors?.phone && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.phone}
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-400">
              ご登録の電話番号を入力するとLINE通知が届きます
            </p>
          </div>

          {/* メールアドレス（任意） */}
          <div>
            <label htmlFor="reserve-email" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Mail size={14} className="text-gray-400" />
              メールアドレス
              <span className="ml-1 text-xs font-normal text-gray-400">任意</span>
            </label>
            <input
              id="reserve-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="example@mail.com"
              defaultValue={prefill?.email ?? ""}
              className={inputCls + (errors?.email ? " border-red-300 bg-red-50/50" : "")}
            />
            {errors?.email && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={11} />{errors.email}
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-400">
              入力するとメールでも通知を受け取れます
            </p>
          </div>
        </div>
      )}

      {/* ── 警告パネル（照合不一致時） ── */}
      {warningState && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-amber-800">
                {warningState.type === "not_found"
                  ? "この電話番号は未登録です"
                  : "お名前が登録情報と異なります"}
              </p>
              {warningState.type === "not_found" ? (
                <p className="text-xs text-amber-700 leading-relaxed">
                  入力された電話番号はまだ登録されていません。<br />
                  新規患者として予約を続けてもよいですか？
                </p>
              ) : (
                <p className="text-xs text-amber-700 leading-relaxed">
                  入力されたお名前が登録情報と異なります。<br />
                  お名前を修正するか、このまま続けますか？
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleWarningBack}
              className="flex flex-1 items-center justify-center gap-1.5 h-10 rounded-xl border border-amber-300 bg-white text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 active:bg-amber-100"
            >
              <ChevronLeft size={13} />
              {warningState.type === "not_found" ? "電話番号を修正" : "お名前を修正"}
            </button>
            <button
              type="button"
              onClick={handleWarningConfirm}
              disabled={isPending}
              className="flex flex-1 items-center justify-center gap-1.5 h-10 rounded-xl bg-amber-500 text-xs font-semibold text-white transition-colors hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50"
            >
              {isPending
                ? <Loader2 size={13} className="animate-spin" />
                : null}
              {warningState.type === "not_found" ? "新規患者として予約" : "このまま予約する"}
            </button>
          </div>
        </div>
      )}

      {/* 送信ボタン（警告表示中は非表示） */}
      {!warningState && (
        <div className="pt-1">
          <button type="submit" disabled={isPending || isChecking} className={btnPrimary}>
            {isPending
              ? <><Loader2 size={16} className="animate-spin" />送信中…</>
              : isChecking
              ? <><Loader2 size={16} className="animate-spin" />確認中…</>
              : "予約を申し込む"
            }
          </button>
        </div>
      )}

      <button type="button" onClick={() => setStep(2)} className={btnOutline + " w-full"}>
        <ChevronLeft size={14} />
        時間を選び直す
      </button>
    </form>
  );
}
