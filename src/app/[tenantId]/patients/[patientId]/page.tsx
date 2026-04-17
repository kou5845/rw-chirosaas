/**
 * 患者詳細・カルテ履歴ページ
 *
 * CLAUDE.md 規約:
 *   - 患者取得時は必ず tenantId フィルタを含めること（クロステナントアクセス防止）
 *   - professional モードのフィールドは karte_mode トグルで表示制御する
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  MessageCircle,
  StickyNote,
  Activity,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { calcAge, formatDateJa, formatPatientId, getInitial } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AppointmentSection } from "./AppointmentSection";
import { PatientActions } from "./PatientActions";
import { MypageShareSection } from "./MypageShareSection";
import { KarteSection, type KarteForDisplay } from "./KarteSection";
import { parseMetricsConfig, type BodyCompDataPoint } from "@/lib/training-metrics";

type Props = {
  params: Promise<{ tenantId: string; patientId: string }>;
};

// ── 情報行コンポーネント ──────────────────────────────────────────
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-gray-700">{value}</p>
      </div>
    </div>
  );
}

export default async function PatientDetailPage({ params }: Props) {
  const { tenantId: slug, patientId } = await params;

  // テナントを解決（昼休みも取得）
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true, lunchStartTime: true, lunchEndTime: true, slotInterval: true, trainingMetricsConfig: true },
  });
  if (!tenant) notFound();

  // ── 患者取得（CLAUDE.md 絶対ルール: tenantId でクロステナント防止）──
  const patient = await prisma.patient.findFirst({
    where: {
      id:       patientId,
      tenantId: tenant.id, // ← 他テナントへのアクセスをここで遮断する
    },
    select: {
      id:              true,
      displayName:     true,
      nameKana:        true,
      phone:           true,
      email:           true,
      birthDate:       true,
      lineUserId:      true,
      accessToken:     true, // マイページ共有用
      emergencyContact: true,
      memo:            true,
      isActive:        true,
      createdAt:       true,
      heightCm:        true,
    },
  });
  if (!patient) notFound();

  // ── フィーチャートグル取得 ──────────────────────────────────────
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
  const isProfessional   = karteFeature?.featureValue === "professional";
  const trainingEnabled  = trainingFeature?.featureValue === "true";

  // ── カルテ履歴取得 ─────────────────────────────────────────────
  const kartes = await prisma.karte.findMany({
    where: {
      tenantId:  tenant.id, // CLAUDE.md 絶対ルール
      patientId: patient.id,
    },
    select: {
      id:                true,
      karteType:         true,
      karteModeSnapshot: true,
      conditionNote:     true,
      progressNote:      true,
      conditionStatus:   true,
      bodyParts:         true,
      treatments:        true,
      createdAt:         true,
      staff:             { select: { name: true } },
      weight:      true,
      bodyFat:     true,
      bmi:         true,
      muscleMass:  true,
      bmr:         true,
      visceralFat: true,
      bodyCompValues: true,
      exerciseRecords: {
        select: {
          id:          true,
          exerciseId:  true,
          sets:        true,
          reps:        true,
          weightKg:    true,
          durationSec: true,
          memo:        true,
          exercise:    { select: { name: true, category: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      media: {
        select: { id: true, mediaType: true, storagePath: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // メディアは /api/media/[mediaId] Route Handler 経由でオンデマンドに署名付きURLを取得する
  // （ページロード時の一括生成は廃止: URL期限切れ・生成失敗の問題を根本解決）
  const kartesWithUrls = kartes;

  // ── 体組成グラフ用データ集計（training_record が有効な場合のみ）──
  // CLAUDE.md 規約: ビジネスロジックは Server Component で処理する
  const bodyCompData: BodyCompDataPoint[] = [];
  if (trainingEnabled) {
    const points = kartes
      .filter((k) => k.karteType === "TRAINING")
      .filter((k) =>
        k.weight != null || k.bodyFat != null || k.bmi != null ||
        k.muscleMass != null || k.bmr != null || k.visceralFat != null ||
        (k.bodyCompValues && typeof k.bodyCompValues === 'object' && Object.keys(k.bodyCompValues).length > 0)
      )
      .map((k) => {
        const dateStr   = k.createdAt.toISOString().split("T")[0]; // "YYYY-MM-DD"
        const dateLabel = dateStr.slice(5).replace("-", "/");       // "MM/DD"
        
        let customValues = {};
        if (k.bodyCompValues && typeof k.bodyCompValues === 'object') {
          customValues = k.bodyCompValues as Record<string, number>;
        }

        return {
          ...customValues,
          date:        dateStr,
          dateLabel,
          weight:      k.weight,
          bodyFat:     k.bodyFat,
          bmi:         k.bmi,
          muscleMass:  k.muscleMass,
          bmr:         k.bmr,
          visceralFat: k.visceralFat,
        };
      })
      .reverse(); // kartes は降順取得 → グラフ用に昇順へ
    bodyCompData.push(...points);
  }

  const metricsConfig = parseMetricsConfig(tenant.trainingMetricsConfig);

  // ── Service マスタ取得（施術内容選択用: Simple/Professional 共通）──
  const services = await prisma.service.findMany({
    where:   { tenantId: tenant.id, isActive: true }, // CLAUDE.md 絶対ルール
    select:  { id: true, name: true, duration: true, intervalMin: true, price: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // ── 種目マスタ取得（編集ダイアログ用: Professional + training_record 有効時のみ）──
  const exercises =
    isProfessional && trainingEnabled
      ? await prisma.exercise.findMany({
          where:   { tenantId: tenant.id, isActive: true }, // CLAUDE.md 絶対ルール
          select:  { id: true, name: true, duration: true, intervalMin: true, price: true, category: true, unit: true },
          orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { name: "asc" }],
        })
      : [];

  // ── 曜日別営業時間 ────────────────────────────────────────────
  const businessHours = await prisma.businessHour.findMany({
    where:  { tenantId: tenant.id },
    select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
  });

  // ── 予約一覧 + 集計 + スタッフ一覧 ──────────────────────────────
  const [appointments, appointmentCounts, lastCompletedAppt, staffList] = await Promise.all([
    // 全予約（新しい順）
    prisma.appointment.findMany({
      where:   { tenantId: tenant.id, patientId: patient.id },
      orderBy: { startAt: "desc" },
      select: {
        id:          true,
        status:      true,
        startAt:     true,
        menuName:    true,
        durationMin: true,
        price:       true,
        staff:       { select: { name: true } },
      },
    }),
    // ステータス別集計
    prisma.appointment.groupBy({
      by:     ["status"],
      where:  { tenantId: tenant.id, patientId: patient.id },
      _count: { id: true },
    }),
    // 最終来院日
    prisma.appointment.findFirst({
      where:   { tenantId: tenant.id, patientId: patient.id, status: "completed" },
      orderBy: { startAt: "desc" },
      select:  { startAt: true },
    }),
    // ダイアログ用スタッフ一覧
    prisma.staff.findMany({
      where:   { tenantId: tenant.id, isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: "asc" },
    }).then(staffs => staffs.map(s => ({ id: s.id, displayName: s.name }))),
  ]);

  const totalAppts = appointmentCounts.reduce((s, r) => s + r._count.id, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── パンくず + 戻るボタン ── */}
      <div className="flex items-center gap-2">
        <Link
          href={`/${slug}/patients`}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-[var(--brand-hover)] hover:text-[var(--brand-dark)]"
        >
          <ArrowLeft size={15} />
          患者一覧に戻る
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">{patient.displayName}</span>
      </div>

      {/* ── メイン2カラムレイアウト ── */}
      <div className="flex gap-6 items-start">

        {/* ══ 左カラム: 患者基本情報（320px固定）══ */}
        <aside className="w-80 shrink-0 space-y-4">

          {/* プロフィールカード */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* カラーヘッダー */}
            <div className="bg-gradient-to-br from-[var(--brand)] to-[var(--brand-medium)] px-6 py-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-xl font-bold text-white backdrop-blur-sm">
                    {getInitial(patient.displayName)}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white/70">
                      {formatPatientId(patient.id)}
                    </p>
                    <p className="text-lg font-bold text-white">
                      {patient.displayName}
                    </p>
                    {patient.birthDate && (
                      <p className="mt-0.5 text-xs text-white/80">
                        {calcAge(patient.birthDate)}歳
                      </p>
                    )}
                  </div>
                </div>
                {/* 編集・削除ボタン */}
                <PatientActions
                  patient={{
                    id:              patient.id,
                    displayName:     patient.displayName,
                    nameKana:        patient.nameKana,
                    phone:           patient.phone,
                    email:           patient.email,
                    birthDate:       patient.birthDate,
                    emergencyContact: patient.emergencyContact,
                    memo:            patient.memo,
                  }}
                  tenantId={tenant.id}
                  tenantSlug={slug}
                />
              </div>
            </div>

            {/* 来院サマリー（カード内）*/}
            <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
              <div className="py-3 text-center">
                <p className="text-xs text-gray-400">総予約数</p>
                <p className="mt-0.5 text-xl font-bold text-gray-800">{totalAppts}</p>
              </div>
              <div className="py-3 text-center">
                <p className="text-xs text-gray-400">カルテ数</p>
                <p className="mt-0.5 text-xl font-bold text-gray-800">{kartes.length}</p>
              </div>
            </div>

            {/* 詳細情報 */}
            <div className="divide-y divide-gray-50 px-5">
              {patient.phone && (
                <InfoRow icon={Phone} label="電話番号" value={patient.phone} />
              )}
              {patient.email && (
                <InfoRow icon={Mail} label="メールアドレス" value={patient.email} />
              )}
              {patient.birthDate && (
                <InfoRow
                  icon={Calendar}
                  label="生年月日"
                  value={`${formatDateJa(patient.birthDate)}（${calcAge(patient.birthDate)}歳）`}
                />
              )}
              {lastCompletedAppt && (
                <InfoRow
                  icon={Activity}
                  label="最終来院日"
                  value={formatDateJa(lastCompletedAppt.startAt)}
                />
              )}
              {patient.lineUserId ? (
                <InfoRow
                  icon={MessageCircle}
                  label="LINE連携"
                  value={
                    <span className="inline-flex items-center gap-1 text-[#00830B]">
                      <span className="font-semibold">連携済み</span>
                    </span>
                  }
                />
              ) : (
                <InfoRow
                  icon={MessageCircle}
                  label="LINE連携"
                  value={<span className="text-gray-400">未連携</span>}
                />
              )}
              {patient.emergencyContact && (
                <InfoRow
                  icon={AlertTriangle}
                  label="緊急連絡先"
                  value={patient.emergencyContact}
                />
              )}
            </div>

            {/* 院内メモ */}
            {patient.memo && (
              <div className="border-t border-gray-100 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <StickyNote size={12} />
                  院内メモ
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                  {patient.memo}
                </p>
              </div>
            )}
          </div>

          {/* マイページ共有 */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <MypageShareSection
              patientId={patient.id}
              patientName={patient.displayName}
              tenantId={tenant.id}
              tenantSlug={slug}
              accessToken={patient.accessToken}
            />
          </div>

          {/* 登録日 */}
          <p className="px-1 text-center text-xs text-gray-400">
            登録日: {formatDateJa(patient.createdAt)}
          </p>
        </aside>

        {/* ══ 右カラム: 予約履歴 + カルテ履歴 ══ */}
        <main className="min-w-0 flex-1 space-y-8">

          {/* ── 予約履歴セクション ── */}
          <AppointmentSection
            tenantId={tenant.id}
            tenantSlug={slug}
            patientId={patient.id}
            staffList={staffList}
            appointments={appointments}
            businessHours={businessHours}
            lunchStartTime={tenant.lunchStartTime}
            lunchEndTime={tenant.lunchEndTime}
            slotInterval={tenant.slotInterval}
            services={services}
            exercises={exercises}
            isProfessional={isProfessional}
            trainingEnabled={trainingEnabled}
          />

          {/* ── カルテ履歴セクション（タブ切り替え対応）── */}
          <KarteSection
            kartes={kartesWithUrls as KarteForDisplay[]}
            isProfessional={isProfessional}
            trainingEnabled={trainingEnabled}
            slug={slug}
            patientId={patient.id}
            patientName={patient.displayName}
            tenantId={tenant.id}
            services={services}
            exercises={exercises}
            bodyCompData={bodyCompData}
            metricsConfig={metricsConfig}
            patientHeightCm={patient.heightCm}
          />
        </main>
      </div>
    </div>
  );
}
