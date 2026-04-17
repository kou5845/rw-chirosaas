"use client";

/**
 * 予約履歴セクション — タブ切替 + アコーディオン
 *
 * - タブ: "これから" / "通院履歴"
 * - 各カードは日付 + メニュー名だけのコンパクト表示
 * - タップすると時刻・担当・料金がスムーズに展開
 * - grid-template-rows アニメーションで静謐な開閉を実現
 */

import { useState } from "react";
import {
  ChevronDown, Clock,
  CheckCircle2, XCircle, HourglassIcon, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── 型 ───────────────────────────────────────────────────────────────

export type ApptItem = {
  id:          string;
  status:      string;
  startAt:     string; // ISO 文字列（Server→Client シリアライズ済み）
  endAt:       string;
  menuName:    string;
  durationMin: number;
  price:       number;
  staff: { name: string } | null;
};

type Props = {
  upcoming:    ApptItem[];
  past:        ApptItem[];
  initialTab?: "upcoming" | "past";
};

// ── 定数 ─────────────────────────────────────────────────────────────

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const STATUS_CONFIG = {
  confirmed: {
    label: "確定",
    icon:  CheckCircle2,
    cls:   "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  pending: {
    label: "承認待ち",
    icon:  HourglassIcon,
    cls:   "text-amber-600 bg-amber-50 border-amber-200",
  },
  completed: {
    label: "完了",
    icon:  CheckCircle2,
    cls:   "text-gray-400 bg-gray-50 border-gray-200",
  },
  cancelled: {
    label: "キャンセル",
    icon:  XCircle,
    cls:   "text-red-400 bg-red-50 border-red-200",
  },
} as const;

// ── メインコンポーネント ───────────────────────────────────────────────

export function AppointmentHistory({ upcoming, past, initialTab }: Props) {
  const [tab, setTab]               = useState<"upcoming" | "past">(
    initialTab ?? (upcoming.length > 0 ? "upcoming" : "past")
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const items = tab === "upcoming" ? upcoming : past;

  function switchTab(next: "upcoming" | "past") {
    setTab(next);
    setExpandedId(null); // タブ切替時に全カードを閉じる
  }

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      {/* ── タブ ── */}
      <div className="mb-3 flex gap-2">
        <TabPill
          active={tab === "upcoming"}
          label="これから"
          count={upcoming.length}
          onClick={() => switchTab("upcoming")}
        />
        <TabPill
          active={tab === "past"}
          label="通院履歴"
          count={past.length}
          onClick={() => switchTab("past")}
        />
      </div>

      {/* ── リスト ── */}
      {items.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-1.5">
          {items.map((appt) => (
            <AccordionCard
              key={appt.id}
              appt={appt}
              isOpen={expandedId === appt.id}
              onToggle={() => toggle(appt.id)}
              accent={tab === "upcoming"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── タブピル ─────────────────────────────────────────────────────────

function TabPill({
  active, label, count, onClick,
}: {
  active:  boolean;
  label:   string;
  count:   number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors",
        active
          ? "bg-[var(--brand)] text-white shadow-sm"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-px text-[10px] font-bold",
          active ? "bg-white/20 text-white" : "bg-white text-gray-400"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ── アコーディオンカード ──────────────────────────────────────────────

function AccordionCard({
  appt,
  isOpen,
  onToggle,
  accent,
}: {
  appt:     ApptItem;
  isOpen:   boolean;
  onToggle: () => void;
  accent:   boolean;
}) {
  const startAt  = new Date(appt.startAt);
  const endAt    = new Date(appt.endAt);
  const cfg      = STATUS_CONFIG[appt.status as keyof typeof STATUS_CONFIG]
    ?? STATUS_CONFIG.completed;
  const StatusIcon = cfg.icon;

  const dateStr = `${startAt.getMonth() + 1}月${startAt.getDate()}日（${DOW_JA[startAt.getDay()]}）`;
  const pad     = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(startAt.getHours())}:${pad(startAt.getMinutes())} 〜 ${pad(endAt.getHours())}:${pad(endAt.getMinutes())}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border transition-colors",
        isOpen
          ? accent
            ? "border-[var(--brand-border)] bg-[var(--brand-bg)]/30"
            : "border-gray-200 bg-white"
          : accent
            ? "border-[var(--brand-border)]/60 bg-white"
            : "border-gray-100 bg-white"
      )}
    >
      {/* ── ヘッダー（常時表示・タップ領域）── */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "text-[11px] font-semibold",
                accent ? "text-[var(--brand-dark)]" : "text-gray-400"
              )}
            >
              {dateStr}
            </p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold",
                cfg.cls
              )}
            >
              <StatusIcon size={9} />
              {cfg.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-gray-700">
            {appt.menuName}
          </p>
        </div>

        {/* 開閉シェブロン */}
        <ChevronDown
          size={15}
          className={cn(
            "shrink-0 text-gray-300 transition-transform duration-200 ease-out",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* ── 詳細エリア（アコーディオン）── */}
      {/* grid-template-rows アニメーション: 0fr → 1fr */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-1.5 border-t border-gray-50 px-4 py-3">
            {/* 時刻 */}
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="shrink-0 text-gray-400" />
              <span className="font-mono text-xs font-medium text-gray-600">
                {timeStr}
              </span>
              <span className="text-[10px] text-gray-400">（{appt.durationMin}分）</span>
            </div>
            {/* 担当スタッフ */}
            {appt.staff && (
              <p className="text-xs text-gray-500">担当: {appt.staff.name}</p>
            )}
            {/* 料金 */}
            {appt.price > 0 && (
              <p
                className={cn(
                  "text-xs font-bold tabular-nums",
                  accent ? "text-[var(--brand-dark)]" : "text-gray-500"
                )}
              >
                ¥{appt.price.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 空状態 ────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: "upcoming" | "past" }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <CalendarDays size={24} className="text-gray-200" />
      <p className="mt-2 text-sm text-gray-400">
        {tab === "upcoming"
          ? "予定されている予約はありません"
          : "通院履歴はありません"}
      </p>
    </div>
  );
}
