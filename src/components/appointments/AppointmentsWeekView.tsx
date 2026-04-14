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
  type DragMoveEvent,
} from "@dnd-kit/core";
import { WeeklyCalendar, type SerializedAppointment, type BusinessHourData, HOUR_HEIGHT } from "./WeeklyCalendar";
import { NewAppointmentDialog, type EditModeData } from "./NewAppointmentDialog";
import { rescheduleAppointment } from "@/app/[tenantId]/appointments/reschedule-action";
import { deleteAppointment } from "@/app/[tenantId]/appointments/delete-action";

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

// ─── 共通スナップ計算 ────────────────────────────────────────────────────────

type SnapResult = {
  dayIdx:     number; // 0=月 〜 6=日
  snappedMin: number; // 絶対分（クランプ済み）
  top:        number; // グリッド内 Y px（表示用）
  timeStr:    string; // "HH:mm"
};

/**
 * ドラッグ中カードの translatedRect から
 * - どの曜日列（dayIdx）
 * - 何分（slotInterval スナップ）
 * を計算する共通ロジック。
 *
 * handleDragMove / handleDragEnd の両方でこの関数を使うことで
 * 「インジケーターが示す時刻」と「実際に確定される時刻」を完全に一致させる。
 */
function computeSnapFromRect(
  rect:          { top: number; left: number; width: number },
  gridEl:        HTMLDivElement,
  scrollEl:      HTMLDivElement,
  gridStartHour: number,
  slotInterval:  number,
): SnapResult | null {
  const gridRect         = gridEl.getBoundingClientRect();
  const TIME_COL_WIDTH   = 56;
  const gridContentWidth = gridRect.width - TIME_COL_WIDTH;
  if (gridContentWidth <= 0) return null;

  // X: 中央座標でどの曜日列か判定（端クリック時の誤検知を防ぐ）
  const dayWidth    = gridContentWidth / 7;
  const cardCenterX = rect.left + rect.width / 2;
  const relX        = cardCenterX - gridRect.left - TIME_COL_WIDTH;
  const dayIdx      = Math.max(0, Math.min(6, Math.floor(relX / dayWidth)));

  // Y: スクロール量を加算してグリッド内絶対座標に変換
  const relY      = rect.top - gridRect.top + scrollEl.scrollTop;
  const rawMin    = (relY / HOUR_HEIGHT) * 60;
  const absMin    = gridStartHour * 60 + rawMin;

  // slotInterval スナップ → グリッド開始未満にはクランプ
  const snapped   = Math.round(absMin / slotInterval) * slotInterval;
  const clamped   = Math.max(gridStartHour * 60, snapped);

  const offsetMin = clamped - gridStartHour * 60;
  const top       = (offsetMin / 60) * HOUR_HEIGHT;
  const h         = Math.floor(clamped / 60);
  const m         = clamped % 60;
  const timeStr   = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  return { dayIdx, snappedMin: clamped, top, timeStr };
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

/**
 * ドラッグ中に浮かぶカードプレビュー。
 * snapTimeStr が渡された場合、カード右横にスナップ先の時刻バッジを表示する。
 * バッジは DragOverlay 内に同梱されるため z-index の影響を受けず、
 * グリッド列内のインジケーターラインに隠れることがない。
 */
function DragCardPreview({
  appt,
  snapTimeStr,
}: {
  appt:         SerializedAppointment;
  snapTimeStr?: string;
}) {
  const statusColors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
    pending:   { bg: "bg-amber-50",    border: "border-amber-300",  text: "text-amber-900",   accent: "bg-amber-400" },
    confirmed: { bg: "bg-[#E8F7F8]",   border: "border-[#91D2D9]",  text: "text-[#1a6a72]",   accent: "bg-[#91D2D9]" },
  };
  const cfg      = statusColors[appt.status] ?? statusColors.confirmed;
  const isShort  = appt.durationMin <= 30;
  const heightPx = Math.max((appt.durationMin / 60) * HOUR_HEIGHT - 4, 28);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    // 外枠を relative にしてバッジを絶対配置する
    <div className="relative" style={{ width: "140px", height: `${heightPx}px` }}>
      {/* カード本体 */}
      <div
        className={[
          "absolute inset-0 overflow-hidden rounded-lg border text-left shadow-2xl",
          "cursor-grabbing opacity-95 ring-2 ring-[var(--brand)]/30",
          cfg.bg, cfg.border,
        ].join(" ")}
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

      {/* スナップタイムバッジ（カード右横に常時表示）
          DragOverlay 内に同梱されているため z-index 競合なし */}
      {snapTimeStr && (
        <span
          className={[
            "absolute top-1 left-full ml-1.5",
            "whitespace-nowrap rounded-md px-2 py-0.5",
            "text-[11px] font-bold text-white",
            "bg-[var(--brand)] shadow-lg ring-2 ring-white/70",
          ].join(" ")}
        >
          {snapTimeStr}
        </span>
      )}
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
  // ── 新規作成モーダル状態 ──
  const [modalOpen,    setModalOpen]   = useState(false);
  const [initialDate,  setInitialDate] = useState<string | undefined>(undefined);
  const [initialTime,  setInitialTime] = useState<string | undefined>(undefined);

  function openModal(date?: string, time?: string) {
    setInitialDate(date);
    setInitialTime(time);
    setModalOpen(true);
  }

  // ── 編集モーダル状態 ──
  const [editMode, setEditMode] = useState<EditModeData | null>(null);

  // ── 楽観的更新のための予約リスト ──
  const [localAppts, setLocalAppts] = useState<SerializedAppointment[]>(initialAppointments);

  // propsが変わった（週移動等）ときにリセット
  useEffect(() => {
    setLocalAppts(initialAppointments);
  }, [initialAppointments]);

  // ── DnD: ドラッグ中の予約 ──
  const [activeAppt, setActiveAppt] = useState<SerializedAppointment | null>(null);

  // ── DnD: リアルタイムスナップインジケーター ──
  const [dragIndicator, setDragIndicator] = useState<{ dayIdx: number; top: number; timeStr: string } | null>(null);

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

  // ── 編集ハンドラー ──
  const handleEditAppt = useCallback((appt: SerializedAppointment) => {
    const start = new Date(appt.startAt);
    const dateStr = [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, "0"),
      String(start.getDate()).padStart(2, "0"),
    ].join("-");
    const timeStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    setEditMode({
      appointmentId: appt.id,
      patientId:     appt.patientId,
      patientName:   appt.patientName,
      date:          dateStr,
      time:          timeStr,
      menuName:      appt.menuName,
      durationMin:   appt.durationMin,
      price:         appt.price,
      staffId:       null,
      note:          appt.note,
    });
  }, []);

  // ── 削除ハンドラー（楽観的更新）──
  const handleDeleteAppt = useCallback(async (apptId: string) => {
    const original = localAppts;
    setLocalAppts((prev) => prev.filter((a) => a.id !== apptId));
    try {
      const result = await deleteAppointment(apptId, slug);
      if (!result.success) {
        setLocalAppts(original);
        showToast(result.error ?? "削除に失敗しました");
      } else {
        showToast("予約を削除しました", "success");
      }
    } catch {
      setLocalAppts(original);
      showToast("通信エラーが発生しました。再度お試しください。");
    }
  }, [localAppts, slug, showToast]);

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
    setDragIndicator(null);
  }, []);

  // ── DnD: ドラッグ移動（リアルタイムインジケーター更新）──
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const translatedRect = event.active.rect.current.translated;
    if (!translatedRect) { setDragIndicator(null); return; }

    const gridEl   = calGridRef.current;
    const scrollEl = scrollAreaRef.current;
    if (!gridEl || !scrollEl) { setDragIndicator(null); return; }

    const snap = computeSnapFromRect(translatedRect, gridEl, scrollEl, gridStartHour, slotInterval);
    if (snap) {
      setDragIndicator({ dayIdx: snap.dayIdx, top: snap.top, timeStr: snap.timeStr });
    } else {
      setDragIndicator(null);
    }
  }, [gridStartHour, slotInterval]);

  // ── DnD: ドラッグ終了（メイン処理）──
  // computeSnapFromRect を使い handleDragMove と全く同じ座標計算を行う。
  // これにより「インジケーターが示す時刻 = 実際に確定される時刻」が保証される。
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const appt = event.active.data.current?.appt as SerializedAppointment | undefined;
    setActiveAppt(null);
    setDragIndicator(null); // インジケーターをクリア

    if (!appt) return;

    // ── 1. ドロップ位置の取得 ──
    const droppedRect = event.active.rect.current.translated;
    if (!droppedRect) return;

    const gridEl   = calGridRef.current;
    const scrollEl = scrollAreaRef.current;
    if (!gridEl || !scrollEl) return;

    // ── 2 & 3. 共通スナップ計算（handleDragMove と同一ロジック）──
    const snap = computeSnapFromRect(droppedRect, gridEl, scrollEl, gridStartHour, slotInterval);
    if (!snap) return;

    const { dayIdx, snappedMin } = snap;
    const newEndMin = snappedMin + appt.durationMin;

    // ── 4. バリデーション ──
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

    // ── 5. 変更なしチェック ──
    const origStart = new Date(appt.startAt);
    if (
      isSameDate(origStart, dropDate) &&
      origStart.getHours() * 60 + origStart.getMinutes() === snappedMin
    ) {
      return;
    }

    // ── 6. 新しいISO文字列を構築 ──
    const newStartAt = new Date(
      dropDate.getFullYear(), dropDate.getMonth(), dropDate.getDate(),
      Math.floor(snappedMin / 60), snappedMin % 60, 0, 0,
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
        setLocalAppts(originalAppts);
        showToast(result.error ?? "予約の移動に失敗しました");
      } else {
        const h = String(Math.floor(snappedMin / 60)).padStart(2, "0");
        const m = String(snappedMin % 60).padStart(2, "0");
        showToast(`${appt.patientName}さんを ${h}:${m} に移動しました`, "success");
      }
    } catch (err) {
      console.error("[AppointmentsWeekView] rescheduleAppointment error:", err);
      setLocalAppts(originalAppts);
      showToast("通信エラーが発生しました。再度お試しください。");
    }
  }, [localAppts, slug, weekStartStr, gridStartHour, slotInterval, bhMap, lunchStartTime, lunchEndTime, showToast]);

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
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
          dragIndicator={dragIndicator}
          onNewAppt={() => openModal()}
          onSlotClick={(date, time) => openModal(date, time)}
          calGridRef={calGridRef}
          scrollAreaRef={scrollAreaRef}
          draggingId={activeAppt?.id ?? null}
          onEditAppt={handleEditAppt}
          onDeleteAppt={handleDeleteAppt}
        />

        {/* DragOverlay: ドラッグ中に浮いているカードを表示
            snapTimeStr を渡してカード右横にスナップ時刻バッジを表示する */}
        <DragOverlay dropAnimation={null}>
          {activeAppt ? (
            <DragCardPreview appt={activeAppt} snapTimeStr={dragIndicator?.timeStr} />
          ) : null}
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

      {/* 編集モーダル */}
      {editMode && (
        <NewAppointmentDialog
          tenantId={tenantId}
          tenantSlug={slug}
          staffList={staffList}
          businessHours={businessHours}
          lunchStartTime={lunchStartTime}
          lunchEndTime={lunchEndTime}
          slotInterval={slotInterval}
          editMode={editMode}
          onClose={() => setEditMode(null)}
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
