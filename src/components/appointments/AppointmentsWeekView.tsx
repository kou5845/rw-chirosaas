"use client";

/**
 * 予約管理ページ — 週間ビュー ラッパー
 *
 * WeeklyCalendar + NewAppointmentDialog の状態を統合管理する
 * Client Component。スロットクリック / 「新規予約」ボタンから
 * モーダルを開く。
 *
 * DnD 機能:
 *   - DndContext でカレンダー全体をラップ
 *   - DragOverlay で浮いているカードを表示
 *   - onDragEnd で座標 → 日時変換 → 楽観的更新 → rescheduleAppointment
 *   - バリデーション違反（定休日・営業時間外・昼休み）でドロップ拒否
 *   - サーバーエラー時はロールバック + ミニトースト通知
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { WeeklyCalendar, type SerializedAppointment, type BusinessHourData, HOUR_HEIGHT } from "./WeeklyCalendar";
import { NewAppointmentDialog } from "./NewAppointmentDialog";
import { rescheduleAppointment } from "@/app/[tenantId]/appointments/reschedule-action";

// ─── 型定義 ──────────────────────────────────────────────────────────────────

type Staff   = { id: string; displayName: string };
type Patient = { id: string; displayName: string };

type Props = {
  weekStartStr:   string;
  appointments:   SerializedAppointment[];
  slug:           string;
  pendingCount:   number;
  tenantId:       string;
  businessHours:  BusinessHourData[];
  lunchStartTime: string | null;
  lunchEndTime:   string | null;
  slotInterval:   number;
  maxCapacity:    number;
  staffList:      Staff[];
  patientList:    Patient[];
};

// ─── ユーティリティ ───────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * 営業時間マップを構築（WeeklyCalendar と同じロジック）
 */
function buildBhMap(businessHours: BusinessHourData[]): Map<number, BusinessHourData> {
  const map = new Map<number, BusinessHourData>();
  for (const bh of businessHours) map.set(bh.dayOfWeek, bh);
  for (const d of [0, 1, 2, 3, 4, 5, 6]) {
    if (!map.has(d)) {
      map.set(d, { dayOfWeek: d, isOpen: d !== 0, openTime: "09:00", closeTime: "20:00" });
    }
  }
  return map;
}

/**
 * グリッド開始時刻を計算（WeeklyCalendar と同じロジック）
 */
function calcGridStartHour(businessHours: BusinessHourData[]): number {
  const openDays = businessHours.filter((bh) => bh.isOpen);
  if (openDays.length === 0) return 9;
  const startMin = Math.min(...openDays.map((bh) => timeToMin(bh.openTime)));
  return Math.floor(startMin / 60);
}

/**
 * ドロップ先の日時が営業ルール内かを検証する
 */
function isDropAllowed({
  newStartMin,
  newEndMin,
  dayOfWeek,
  bhMap,
  lunchStartTime,
  lunchEndTime,
}: {
  newStartMin:    number;
  newEndMin:      number;
  dayOfWeek:      number; // 0=日, 1=月,...
  bhMap:          Map<number, BusinessHourData>;
  lunchStartTime: string | null;
  lunchEndTime:   string | null;
}): { ok: boolean; reason?: string } {
  const bh = bhMap.get(dayOfWeek);
  if (!bh || !bh.isOpen) {
    return { ok: false, reason: "定休日には移動できません" };
  }
  if (newStartMin < timeToMin(bh.openTime)) {
    return { ok: false, reason: "営業開始前の時間帯には移動できません" };
  }
  if (newEndMin > timeToMin(bh.closeTime)) {
    return { ok: false, reason: "営業終了後の時間帯には移動できません" };
  }
  if (lunchStartTime && lunchEndTime) {
    const lunchStart = timeToMin(lunchStartTime);
    const lunchEnd   = timeToMin(lunchEndTime);
    // 予約が昼休みと重なる場合は拒否
    if (newStartMin < lunchEnd && newEndMin > lunchStart) {
      return { ok: false, reason: "昼休み時間帯には移動できません" };
    }
  }
  return { ok: true };
}

// ─── ミニトースト ─────────────────────────────────────────────────────────────

type ToastType = "error" | "success";

type ToastItem = {
  id:      number;
  message: string;
  type:    ToastType;
};

function MiniToast({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={[
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm",
            "animate-in fade-in slide-in-from-bottom-2 duration-200",
            item.type === "error"
              ? "bg-red-50/95 text-red-700 ring-1 ring-red-200"
              : "bg-emerald-50/95 text-emerald-700 ring-1 ring-emerald-200",
          ].join(" ")}
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              item.type === "error" ? "bg-red-400" : "bg-emerald-400",
            ].join(" ")}
          />
          {item.message}
        </div>
      ))}
    </div>
  );
}

// ─── DragOverlay カードプレビュー ─────────────────────────────────────────────

function DragCardPreview({ appt }: { appt: SerializedAppointment }) {
  const statusColors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
    pending:   { bg: "bg-amber-50",    border: "border-amber-300",  text: "text-amber-900",   accent: "bg-amber-400" },
    confirmed: { bg: "bg-[#E8F7F8]",   border: "border-[#91D2D9]",  text: "text-[#1a6a72]",   accent: "bg-[#91D2D9]" },
  };
  const cfg = statusColors[appt.status] ?? statusColors.confirmed;
  const isShort = appt.durationMin <= 30;
  const heightPx = Math.max((appt.durationMin / 60) * HOUR_HEIGHT - 4, 28);

  // 時刻フォーマット
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div
      className={[
        "overflow-hidden rounded-lg border text-left shadow-2xl",
        "cursor-grabbing opacity-95 ring-2 ring-[var(--brand)]/30",
        cfg.bg, cfg.border,
      ].join(" ")}
      style={{ width: "140px", height: `${heightPx}px` }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${cfg.accent}`} />
      <div className={`pl-2 pr-1 ${isShort ? "py-0.5" : "py-1"}`}>
        <p className={`truncate font-semibold leading-tight ${cfg.text} ${isShort ? "text-[10px]" : "text-[11px]"}`}>
          {appt.patientName}
        </p>
        {!isShort && (
          <p className="truncate text-[10px] leading-tight text-gray-500">
            {appt.menuName}
          </p>
        )}
        {!isShort && (
          <p className={`mt-0.5 text-[10px] leading-none opacity-70 ${cfg.text}`}>
            {fmtTime(appt.startAt)}〜
          </p>
        )}
      </div>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export function AppointmentsWeekView({
  weekStartStr,
  appointments: initialAppointments,
  slug,
  pendingCount,
  tenantId,
  businessHours,
  lunchStartTime,
  lunchEndTime,
  slotInterval,
  maxCapacity,
  staffList,
  patientList,
}: Props) {
  // ── モーダル状態 ──
  const [modalOpen,    setModalOpen]   = useState(false);
  const [initialDate,  setInitialDate] = useState<string | undefined>(undefined);
  const [initialTime,  setInitialTime] = useState<string | undefined>(undefined);

  function openModal(date?: string, time?: string) {
    setInitialDate(date);
    setInitialTime(time);
    setModalOpen(true);
  }

  // ── 楽観的更新のための予約リスト ──
  const [localAppts, setLocalAppts] = useState<SerializedAppointment[]>(initialAppointments);

  // propsが変わった（週移動等）ときにリセット
  useEffect(() => {
    setLocalAppts(initialAppointments);
  }, [initialAppointments]);

  // ── DnD: ドラッグ中の予約 ──
  const [activeAppt, setActiveAppt] = useState<SerializedAppointment | null>(null);

  // ── DnD: グリッド ref（座標計算に使用）──
  const calGridRef    = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // ── トースト管理 ──
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "error") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // ── DnD: センサー設定（5px 動かしてからDnD開始 → クリックと区別）──
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // ── DnD: 事前計算（メモ化して毎レンダーの再生成を防ぐ）──
  const bhMap         = useMemo(() => buildBhMap(businessHours), [businessHours]);
  const gridStartHour = useMemo(() => calcGridStartHour(businessHours), [businessHours]);

  // ── DnD: ドラッグ開始 ──
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const appt = event.active.data.current?.appt as SerializedAppointment | undefined;
    if (appt) setActiveAppt(appt);
  }, []);

  // ── DnD: ドラッグ終了（メイン処理）──
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const appt = event.active.data.current?.appt as SerializedAppointment | undefined;
    setActiveAppt(null);

    if (!appt) return;

    // ── 1. ドロップ位置の取得 ──
    // dnd-kit が管理する「ドロップ後のビューポート座標」を取得
    const droppedRect = event.active.rect.current.translated;
    if (!droppedRect) return;

    const gridEl      = calGridRef.current;
    const scrollEl    = scrollAreaRef.current;
    if (!gridEl || !scrollEl) return;

    const gridRect = gridEl.getBoundingClientRect();

    // ── 2. X軸: どの日（dayIdx: 0=月 〜 6=日）に落とされたか ──
    // グリッドは「56px の時間ラベル列 + 均等7列」
    const TIME_COL_WIDTH = 56;
    const gridContentWidth = gridRect.width - TIME_COL_WIDTH;
    const dayWidth  = gridContentWidth / 7;
    // ドロップしたカードの中央X座標を使う（精度向上）
    const cardCenterX = droppedRect.left + droppedRect.width / 2;
    const relX       = cardCenterX - gridRect.left - TIME_COL_WIDTH;
    const dayIdx     = Math.max(0, Math.min(6, Math.floor(relX / dayWidth)));

    // ── 3. Y軸: 何時何分か（スクロール量を加算して補正）──
    // droppedRect はビューポート座標。グリッド内の相対Yはスクロールを加算する必要がある。
    const scrollTop  = scrollEl.scrollTop;
    // グリッドのビューポート上端 + スクロール量 = グリッド内の絶対上端
    const relY       = droppedRect.top - gridRect.top + scrollTop;
    const rawMin     = (relY / HOUR_HEIGHT) * 60; // グリッド開始からの分数
    const absMin     = gridStartHour * 60 + rawMin; // 絶対分
    // slotInterval 分スナップ
    const snappedMin = Math.round(absMin / slotInterval) * slotInterval;
    const newEndMin  = snappedMin + appt.durationMin;

    // ── 4. バリデーション ──
    // ドロップ先の曜日（週Indexから JS の dayOfWeek へ変換: 月=1,...,日=0）
    const weekStart = parseDateStr(weekStartStr);
    const dropDate  = addDays(weekStart, dayIdx);
    const dayOfWeek = dropDate.getDay(); // 0=日,...,6=土

    const validation = isDropAllowed({
      newStartMin: snappedMin,
      newEndMin,
      dayOfWeek,
      bhMap,
      lunchStartTime,
      lunchEndTime,
    });

    if (!validation.ok) {
      showToast(validation.reason ?? "この時間帯には移動できません");
      return;
    }

    // ── 5. 変更なしチェック（同じ日時にドロップした場合は何もしない）──
    const origStart = new Date(appt.startAt);
    if (
      isSameDate(origStart, dropDate) &&
      origStart.getHours() * 60 + origStart.getMinutes() === snappedMin
    ) {
      return;
    }

    // ── 6. 新しいISO文字列を構築 ──
    const newStartAt = new Date(
      dropDate.getFullYear(),
      dropDate.getMonth(),
      dropDate.getDate(),
      Math.floor(snappedMin / 60),
      snappedMin % 60,
      0,
      0,
    );
    const newEndAt = new Date(newStartAt.getTime() + appt.durationMin * 60 * 1000);

    // ── 7. 楽観的更新 ──
    const originalAppts = localAppts;
    setLocalAppts((prev) =>
      prev.map((a) =>
        a.id === appt.id
          ? { ...a, startAt: newStartAt.toISOString(), endAt: newEndAt.toISOString() }
          : a
      )
    );

    // ── 8. サーバーアクション呼び出し ──
    try {
      const result = await rescheduleAppointment({
        appointmentId: appt.id,
        tenantSlug:    slug,
        newStartIso:   newStartAt.toISOString(),
        newEndIso:     newEndAt.toISOString(),
      });

      if (!result.success) {
        // サーバー拒否 → ロールバック
        setLocalAppts(originalAppts);
        showToast(result.error ?? "予約の移動に失敗しました");
      } else {
        const h = String(Math.floor(snappedMin / 60)).padStart(2, "0");
        const m = String(snappedMin % 60).padStart(2, "0");
        showToast(`${appt.patientName}さんを ${h}:${m} に移動しました`, "success");
      }
    } catch (err) {
      console.error("[AppointmentsWeekView] rescheduleAppointment error:", err);
      // 通信エラー → ロールバック
      setLocalAppts(originalAppts);
      showToast("通信エラーが発生しました。再度お試しください。");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAppts, slug, weekStartStr, gridStartHour, bhMap, lunchStartTime, lunchEndTime, showToast]);

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <WeeklyCalendar
          weekStartStr={weekStartStr}
          appointments={localAppts}
          slug={slug}
          pendingCount={pendingCount}
          businessHours={businessHours}
          lunchStartTime={lunchStartTime}
          lunchEndTime={lunchEndTime}
          slotInterval={slotInterval}
          onNewAppt={() => openModal()}
          onSlotClick={(date, time) => openModal(date, time)}
          calGridRef={calGridRef}
          scrollAreaRef={scrollAreaRef}
          draggingId={activeAppt?.id ?? null}
        />

        {/* DragOverlay: ドラッグ中に浮いているカードを表示 */}
        <DragOverlay dropAnimation={null}>
          {activeAppt ? <DragCardPreview appt={activeAppt} /> : null}
        </DragOverlay>
      </DndContext>

      {/* 新規予約モーダル */}
      {modalOpen && (
        <NewAppointmentDialog
          tenantId={tenantId}
          tenantSlug={slug}
          patientList={patientList}
          staffList={staffList}
          businessHours={businessHours}
          lunchStartTime={lunchStartTime}
          lunchEndTime={lunchEndTime}
          slotInterval={slotInterval}
          initialDate={initialDate}
          initialTime={initialTime}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* ミニトースト通知 */}
      <MiniToast items={toasts} />
    </>
  );
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}
