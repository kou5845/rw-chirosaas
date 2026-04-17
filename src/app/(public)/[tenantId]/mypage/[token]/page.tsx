/**
 * 患者専用マイページ — マジックリンク方式（クリーン・ホワイトテーマ）
 *
 * URL: /{tenantSlug}/mypage/{accessToken}
 *
 * - 認証不要（accessToken の一致のみで本人確認）
 * - 全予約履歴をタイムライン表示（Upcoming / Past 分離）
 * - karte_mode=professional のテナントのみグラフ・メディアを表示
 * - simple モードは予約履歴と医院情報のみの最小構成
 *
 * CLAUDE.md 規約:
 *   - memo フィールドは「院内メモ（患者非表示）」のため絶対に select しない
 *   - tenantId フィルタは accessToken 経由の JOIN で代替する
 */

import { notFound } from "next/navigation";
import {
  Phone, MapPin, CalendarDays, Clock, Activity,
  ChevronRight, Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { GrowthChart } from "./GrowthChart";
import { MediaGallery } from "./MediaGallery";
import { AppointmentHistory } from "./AppointmentHistory";
import { parseMetricsConfig, type BodyCompDataPoint } from "@/lib/training-metrics";

type Props = {
  params: Promise<{ tenantId: string; token: string }>;
};

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ── 日付フォーマット（ヒーローカード用）──────────────────────────────
function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props) {
  const { tenantId: slug, token } = await params;
  const p = await prisma.patient.findFirst({
    where: { accessToken: token, isActive: true, tenant: { subdomain: slug } },
    select: { displayName: true, tenant: { select: { name: true } } },
  });
  if (!p) return { title: "マイページ" };
  return { title: `${p.displayName} 様のマイページ — ${p.tenant.name}` };
}

export default async function MypagePage({ params }: Props) {
  const { tenantId: slug, token } = await params;

  // ── アクセストークン＋テナント両方を DB 照合 ─────────────────────
  const patient = await prisma.patient.findFirst({
    where: {
      accessToken: token,
      isActive:    true,
      tenant:      { subdomain: slug },
    },
    select: {
      id:          true,
      displayName: true,
      tenantId:    true,
      tenant: {
        select: { id: true, name: true, phone: true, address: true, trainingMetricsConfig: true },
      },
    },
  });
  if (!patient) notFound();

  const { tenant } = patient;

  // ── フィーチャートグル ────────────────────────────────────────────
  const [karteFeature, trainingFeature] = await Promise.all([
    prisma.tenantSetting.findUnique({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: "karte_mode" } },
      select: { featureValue: true },
    }),
    prisma.tenantSetting.findUnique({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: "training_record" } },
      select: { featureValue: true },
    }),
  ]);
  const isProfessional  = karteFeature?.featureValue === "professional";
  const trainingEnabled = trainingFeature?.featureValue === "true";

  // ── 全予約履歴（降順）取得 ────────────────────────────────────────
  const allAppointments = await prisma.appointment.findMany({
    where:   { tenantId: tenant.id, patientId: patient.id },
    orderBy: { startAt: "desc" },
    select: {
      id:          true,
      status:      true,
      startAt:     true,
      endAt:       true,
      menuName:    true,
      durationMin: true,
      price:       true,
      staff: { select: { name: true } },
    },
  });

  const now = new Date();
  // Upcoming: 未来かつ pending/confirmed
  const upcoming = allAppointments
    .filter((a) => a.startAt > now && (a.status === "confirmed" || a.status === "pending"))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime()); // 近い順
  // Past: それ以外
  const past = allAppointments.filter(
    (a) => !(a.startAt > now && (a.status === "confirmed" || a.status === "pending"))
  );

  // ── Professional モード: メディア＋体組成グラフ ──────────────────
  let allMedia: { id: string; mediaType: string; karteType: string; karteDate: string }[] = [];
  const bodyCompData: BodyCompDataPoint[] = [];

  if (isProfessional) {
    // メディア取得
    const kartesWithMedia = await prisma.karte.findMany({
      where: {
        tenantId:          tenant.id,
        patientId:         patient.id,
        karteModeSnapshot: "professional",
        media:             { some: {} },
      },
      orderBy: { createdAt: "desc" },
      select: {
        karteType: true,
        createdAt: true,
        media: {
          select:  { id: true, mediaType: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    allMedia = kartesWithMedia.flatMap((k) =>
      k.media.map((m) => ({
        id:        m.id,
        mediaType: m.mediaType,
        karteType: k.karteType as string,
        karteDate: k.createdAt.toISOString(),
      })),
    );

    // 体組成グラフデータ（training_record が有効な場合のみ）
    if (trainingEnabled) {
      const trainingKartes = await prisma.karte.findMany({
        where: {
          tenantId:  tenant.id,
          patientId: patient.id,
          karteType: "TRAINING",
          OR: [
            { weight:      { not: null } },
            { bodyFat:     { not: null } },
            { bmi:         { not: null } },
            { muscleMass:  { not: null } },
            { bmr:         { not: null } },
            { visceralFat: { not: null } },
          ],
        },
        orderBy: { createdAt: "asc" }, // グラフ用に昇順
        select: {
          createdAt:   true,
          weight:      true,
          bodyFat:     true,
          bmi:         true,
          muscleMass:  true,
          bmr:         true,
          visceralFat: true,
        },
      });

      for (const k of trainingKartes) {
        const dateStr   = k.createdAt.toISOString().split("T")[0];
        const dateLabel = dateStr.slice(5).replace("-", "/");
        bodyCompData.push({
          date:        dateStr,
          dateLabel,
          weight:      k.weight,
          bodyFat:     k.bodyFat,
          bmi:         k.bmi,
          muscleMass:  k.muscleMass,
          bmr:         k.bmr,
          visceralFat: k.visceralFat,
        });
      }
    }
  }

  const metricsConfig = parseMetricsConfig(tenant.trainingMetricsConfig);

  // ── 次回確定予約（ヒーロー表示用）────────────────────────────────
  const nextConfirmed = upcoming.find((a) => a.status === "confirmed");

  // ── Client Component 向けシリアライズ ────────────────────────────
  // Date は Client Component に直接渡せないため ISO 文字列に変換する
  function serializeAppt(a: (typeof allAppointments)[number]) {
    return {
      id:          a.id,
      status:      a.status,
      startAt:     a.startAt.toISOString(),
      endAt:       a.endAt.toISOString(),
      menuName:    a.menuName,
      durationMin: a.durationMin,
      price:       a.price,
      staff:       a.staff,
    };
  }
  const upcomingSerial = upcoming.map(serializeAppt);
  const pastSerial     = past.map(serializeAppt);

  return (
    <div className="mx-auto max-w-md">

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO ヘッダー — ブランドグラデーション
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-6 pt-14 pb-10">
        {/* 和柄ドット（微細・白） */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize:  "20px 20px",
          }}
        />
        {/* 下部フェード */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#F9FAFB] to-transparent" />

        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
          {tenant.name}
        </p>
        <h1 className="relative mt-2 text-2xl font-bold tracking-tight text-white">
          {patient.displayName}
          <span className="ml-1.5 text-base font-normal text-white/60">様</span>
        </h1>
        <p className="relative mt-0.5 text-sm text-white/50">患者マイページ</p>
      </header>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO カード — 次回確定予約
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="px-4 -mt-2">
        {nextConfirmed ? (
          <div className="rounded-3xl border border-[var(--brand-border)] bg-white px-6 py-5 shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--brand-bg)]">
                <CalendarDays size={13} className="text-[var(--brand-dark)]" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--brand-dark)]">
                次回のご予約
              </p>
            </div>

            {/* 大きな日付表示 */}
            <div className="flex items-end gap-4">
              <div>
                <p className="text-[11px] font-medium text-gray-400">
                  {nextConfirmed.startAt.getFullYear()}年
                </p>
                <p className="text-5xl font-bold leading-none text-gray-900 tabular-nums">
                  {String(nextConfirmed.startAt.getMonth() + 1).padStart(2, "0")}
                  <span className="mx-1 text-2xl font-normal text-gray-300">/</span>
                  {String(nextConfirmed.startAt.getDate()).padStart(2, "0")}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-400">
                  （{DOW_JA[nextConfirmed.startAt.getDay()]}）
                </p>
              </div>
              <div className="mb-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Clock size={12} className="text-gray-400" />
                  <span className="font-mono text-base font-semibold text-gray-700">
                    {fmtTime(nextConfirmed.startAt)}
                    <span className="mx-1 text-xs text-gray-400">〜</span>
                    {fmtTime(nextConfirmed.endAt)}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-700">{nextConfirmed.menuName}</p>
                {nextConfirmed.staff && (
                  <p className="text-xs text-gray-400">担当: {nextConfirmed.staff.name}</p>
                )}
                {nextConfirmed.price > 0 && (
                  <p className="text-xs font-semibold text-[var(--brand-dark)]">
                    ¥{nextConfirmed.price.toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 h-px bg-gray-100" />
            <p className="mt-3 text-xs text-gray-400">
              キャンセル・変更はお電話にてご連絡ください
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-gray-100 bg-white px-6 py-8 shadow-sm text-center">
            <CalendarDays size={28} className="mx-auto text-gray-200" />
            <p className="mt-3 text-sm font-medium text-gray-400">ご予約は登録されていません</p>
            <p className="mt-1 text-xs text-gray-300">ご来院の際にスタッフにお声がけください</p>
          </div>
        )}
      </div>

      <div className="space-y-4 px-4 pb-20 mt-4">

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SECTION — 予約履歴（タブ + アコーディオン）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {allAppointments.length > 0 && (
          <Section icon={<CalendarDays size={14} />} title="ご予約の履歴">
            <AppointmentHistory
              upcoming={upcomingSerial}
              past={pastSerial}
              initialTab={upcomingSerial.length > 0 ? "upcoming" : "past"}
            />
          </Section>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SECTION — 成長の記録（professional のみ）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isProfessional && trainingEnabled && (
          <Section icon={<Activity size={14} />} title="体組成の記録">
            <GrowthChart bodyCompData={bodyCompData} metricsConfig={metricsConfig} />
          </Section>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SECTION — 写真・動画の記録（professional のみ）
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isProfessional && (
          <Section icon={<Sparkles size={14} />} title="写真・動画の記録">
            <MediaGallery media={allMedia} token={token} />
          </Section>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            SECTION — 医院情報
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Section icon={<MapPin size={14} />} title="医院情報">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                医院名
              </p>
              <p className="mt-1 text-base font-semibold text-gray-800">{tenant.name}</p>
            </div>

            {tenant.phone && (
              <a
                href={`tel:${tenant.phone}`}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 transition-colors active:bg-gray-100"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)]">
                  <Phone size={14} className="text-[var(--brand-dark)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    電話番号
                  </p>
                  <p className="font-mono text-base font-semibold text-gray-800">{tenant.phone}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300" />
              </a>
            )}

            {tenant.address && (
              <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)]">
                  <MapPin size={14} className="text-[var(--brand-dark)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    住所
                  </p>
                  <p className="mt-0.5 text-sm text-gray-700">{tenant.address}</p>
                </div>
              </div>
            )}

            <p className="pt-1 text-center text-xs text-gray-300">
              ご不明な点はお気軽にお問い合わせください
            </p>
          </div>
        </Section>
      </div>

      {/* フッター */}
      <footer className="px-6 pb-10 text-center">
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        <p className="mt-5 text-[10px] font-medium uppercase tracking-widest text-gray-300">
          {tenant.name} — 患者専用ページ
        </p>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section カード
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon:     React.ReactNode;
  title:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--brand-bg)] text-[var(--brand-dark)]">
          {icon}
        </div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">
          {title}
        </h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

