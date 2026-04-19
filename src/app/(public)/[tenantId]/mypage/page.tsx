/**
 * 患者マイページ — セッション認証方式
 *
 * URL: /{tenantSlug}/mypage
 *
 * 未認証 → ログインフォームを表示
 * 認証済み → マイページコンテンツを表示（[token]/page.tsx と同等）
 *
 * CLAUDE.md 規約:
 *   - memo フィールドは「院内メモ（患者非表示）」のため絶対に select しない
 *   - 全 Prisma クエリに tenantId を含めること
 */

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  Phone, MapPin, CalendarDays, Clock, Activity, ChevronRight, Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifySessionToken, COOKIE_NAME } from "@/lib/mypage-session";
import { GrowthChart } from "./[token]/GrowthChart";
import { MediaGallery } from "./[token]/MediaGallery";
import { AppointmentHistory } from "./[token]/AppointmentHistory";
import { MypageLogoutButton } from "./MypageLogoutButton";
import { parseMetricsConfig, type BodyCompDataPoint } from "@/lib/training-metrics";

type Props = {
  params: Promise<{ tenantId: string }>;
};

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function generateMetadata({ params }: Props) {
  const { tenantId: slug } = await params;
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { name: true },
  });
  return { title: `患者マイページ — ${tenant?.name ?? ""}` };
}

export default async function MypageIndexPage({ params }: Props) {
  const { tenantId: slug } = await params;

  // テナント照合
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true, phone: true, address: true, trainingMetricsConfig: true },
  });
  if (!tenant) notFound();

  // ── セッション確認 ────────────────────────────────────────────────
  const jar       = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value ?? "";
  const session   = cookieVal ? verifySessionToken(cookieVal) : null;

  // 未認証 → ログインページへリダイレクト
  if (!session || session.tenantId !== tenant.id) {
    redirect(`/${slug}/mypage/login`);
  }

  // ── 患者データ取得 ────────────────────────────────────────────────
  const patient = await prisma.patient.findFirst({
    where: {
      id:       session.patientId,
      tenantId: tenant.id, // CLAUDE.md 絶対ルール: tenantId でクロステナント防止
      isActive: true,
    },
    select: {
      id:          true,
      displayName: true,
      tenantId:    true,
      accessToken: true,
    },
  });
  // セッションが有効でも患者が削除済み・別テナントの場合はログインへ
  if (!patient) {
    redirect(`/${slug}/mypage/login`);
  }

  // ── フィーチャートグル ────────────────────────────────────────────
  const [karteFeature, trainingFeature] = await Promise.all([
    prisma.tenantSetting.findUnique({
      where:  { tenantId_featureKey: { tenantId: tenant.id, featureKey: "karte_mode" } },
      select: { featureValue: true },
    }),
    prisma.tenantSetting.findUnique({
      where:  { tenantId_featureKey: { tenantId: tenant.id, featureKey: "training_record" } },
      select: { featureValue: true },
    }),
  ]);
  const isProfessional  = karteFeature?.featureValue === "professional";
  const trainingEnabled = trainingFeature?.featureValue === "true";

  // ── 全予約履歴（降順）────────────────────────────────────────────
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
      staff:       { select: { name: true } },
    },
  });

  const now      = new Date();
  const upcoming = allAppointments
    .filter((a) => a.startAt > now && (a.status === "confirmed" || a.status === "pending"))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const past = allAppointments.filter(
    (a) => !(a.startAt > now && (a.status === "confirmed" || a.status === "pending"))
  );

  // ── Professional: メディア + 体組成 ──────────────────────────────
  let allMedia: { id: string; mediaType: string; karteType: string; karteDate: string }[] = [];
  const bodyCompData: BodyCompDataPoint[] = [];

  if (isProfessional) {
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
      }))
    );

    if (trainingEnabled) {
      const trainingKartes = await prisma.karte.findMany({
        where: {
          tenantId:  tenant.id,
          patientId: patient.id,
          karteType: "TRAINING",
          OR: [
            { weight: { not: null } }, { bodyFat: { not: null } }, { bmi: { not: null } },
            { muscleMass: { not: null } }, { bmr: { not: null } }, { visceralFat: { not: null } },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true, weight: true, bodyFat: true, bmi: true,
          muscleMass: true, bmr: true, visceralFat: true,
        },
      });
      for (const k of trainingKartes) {
        const dateStr   = k.createdAt.toISOString().split("T")[0];
        bodyCompData.push({
          date: dateStr,
          dateLabel: dateStr.slice(5).replace("-", "/"),
          weight: k.weight, bodyFat: k.bodyFat, bmi: k.bmi,
          muscleMass: k.muscleMass, bmr: k.bmr, visceralFat: k.visceralFat,
        });
      }
    }
  }

  const metricsConfig  = parseMetricsConfig(tenant.trainingMetricsConfig);
  const nextConfirmed  = upcoming.find((a) => a.status === "confirmed");

  function serializeAppt(a: (typeof allAppointments)[number]) {
    return {
      id: a.id, status: a.status,
      startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(),
      menuName: a.menuName, durationMin: a.durationMin, price: a.price, staff: a.staff,
    };
  }

  return (
    <div className="mx-auto max-w-md">

      {/* ━━ HERO ━━ */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-6 pt-14 pb-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize:  "20px 20px",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#F9FAFB] to-transparent" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              {tenant.name}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              {patient.displayName}
              <span className="ml-1.5 text-base font-normal text-white/60">様</span>
            </h1>
            <p className="mt-0.5 text-sm text-white/50">患者マイページ</p>
          </div>
          <MypageLogoutButton tenantSlug={slug} />
        </div>
      </header>

      {/* ━━ 次回予約カード ━━ */}
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

        {/* 予約履歴 */}
        {allAppointments.length > 0 && (
          <Section icon={<CalendarDays size={14} />} title="ご予約の履歴">
            <AppointmentHistory
              upcoming={upcoming.map(serializeAppt)}
              past={past.map(serializeAppt)}
              initialTab={upcoming.length > 0 ? "upcoming" : "past"}
            />
          </Section>
        )}

        {/* 体組成グラフ（professional + training のみ）*/}
        {isProfessional && trainingEnabled && (
          <Section icon={<Activity size={14} />} title="体組成の記録">
            <GrowthChart bodyCompData={bodyCompData} metricsConfig={metricsConfig} />
          </Section>
        )}

        {/* 写真・動画（professional のみ）*/}
        {isProfessional && (
          <Section icon={<Sparkles size={14} />} title="写真・動画の記録">
            <MediaGallery media={allMedia} token={patient.accessToken ?? ""} />
          </Section>
        )}

        {/* 医院情報 */}
        <Section icon={<MapPin size={14} />} title="医院情報">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">医院名</p>
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
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">電話番号</p>
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
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">住所</p>
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

      <footer className="px-6 pb-10 text-center">
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        <p className="mt-5 text-[10px] font-medium uppercase tracking-widest text-gray-300">
          {tenant.name} — 患者専用ページ
        </p>
      </footer>
    </div>
  );
}

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
