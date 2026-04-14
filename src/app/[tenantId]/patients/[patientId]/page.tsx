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
  FileText,
  Dumbbell,
  MapPin,
  StickyNote,
  Activity,
  CheckSquare,
  Sparkles,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { calcAge, formatDateJa, formatDateTimeJa, formatPatientId, getInitial } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConditionStatus, KarteMode } from "@prisma/client";
import { AppointmentSection } from "./AppointmentSection";

type Props = {
  params: Promise<{ tenantId: string; patientId: string }>;
};

// ── 状態評価バッジ ────────────────────────────────────────────────
const CONDITION_STATUS_CONFIG: Record<
  ConditionStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  good:   { label: "良好",     bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  fair:   { label: "普通",     bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200" },
  pain:   { label: "痛い",     bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
  severe: { label: "強い痛み", bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200" },
};

function ConditionBadge({ status }: { status: ConditionStatus }) {
  const c = CONDITION_STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", c.bg, c.text, c.border)}>
      {c.label}
    </span>
  );
}

// ── カルテモードバッジ ────────────────────────────────────────────
function KarteModeBadge({ mode }: { mode: KarteMode }) {
  return mode === "professional" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand-dark)]">
      <Sparkles size={10} />
      Professional
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
      Simple
    </span>
  );
}

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
    select: { id: true, name: true, lunchStartTime: true, lunchEndTime: true, slotInterval: true },
  });
  if (!tenant) notFound();

  // ── 患者取得（CLAUDE.md 絶対ルール: tenantId でクロステナント防止）──
  const patient = await prisma.patient.findFirst({
    where: {
      id:       patientId,
      tenantId: tenant.id, // ← 他テナントへのアクセスをここで遮断する
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
    include: {
      staff: { select: { displayName: true } },
      exerciseRecords: {
        include: {
          exercise: { select: { name: true, category: true } },
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
        staff:       { select: { displayName: true } },
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
    prisma.profile.findMany({
      where:   { tenantId: tenant.id, isActive: true },
      select:  { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
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
          />

          {/* ── カルテ履歴セクション ── */}
          {/* セクションヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[var(--brand-medium)]" />
              <h2 className="text-sm font-semibold text-gray-800">
                カルテ履歴
                <span className="ml-2 text-gray-400 font-normal">
                  ({kartes.length}件)
                </span>
              </h2>
            </div>
            {/* カルテ追加ボタン */}
            <Link
              href={`/${slug}/patients/${patientId}/kartes/new`}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 text-xs font-medium text-[var(--brand-dark)] transition-colors hover:bg-[var(--brand-hover)]"
            >
              <FileText size={13} />
              カルテを追加
            </Link>
          </div>

          {/* カルテが0件 */}
          {kartes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 text-center">
              <FileText size={36} className="text-gray-200" />
              <p className="mt-3 text-sm font-medium text-gray-400">
                カルテが登録されていません
              </p>
              <p className="mt-1 text-xs text-gray-300">
                施術完了後にカルテを入力してください
              </p>
            </div>
          ) : (
            /* タイムライン */
            <div className="relative space-y-4">
              {/* タイムライン縦線 */}
              <div className="absolute left-[22px] top-0 h-full w-px bg-gray-100" />

              {kartes.map((karte) => (
                <div key={karte.id} className="relative flex gap-4">
                  {/* タイムラインドット */}
                  <div className="relative z-10 mt-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[var(--brand-bg)] shadow-sm">
                    <FileText size={16} className="text-[var(--brand-dark)]" />
                  </div>

                  {/* カルテカード */}
                  <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

                    {/* カードヘッダー */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">
                          {formatDateTimeJa(karte.createdAt)}
                        </span>
                        <KarteModeBadge mode={karte.karteModeSnapshot} />
                      </div>
                      {karte.staff && (
                        <span className="text-xs text-gray-500">
                          担当: {karte.staff.displayName}
                        </span>
                      )}
                    </div>

                    {/* カード本文 */}
                    <div className="space-y-4 p-5">

                      {/* 状態評価（professional モードのみ）*/}
                      {karte.conditionStatus && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">状態評価</span>
                          <ConditionBadge status={karte.conditionStatus} />
                        </div>
                      )}

                      {/* 症状・経過メモ */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {karte.conditionNote && (
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                              症状・主訴
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                              {karte.conditionNote}
                            </p>
                          </div>
                        )}
                        {karte.progressNote && (
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                              経過・所見
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                              {karte.progressNote}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* ── Professional モード専用フィールド ── */}
                      {isProfessional && (
                        <>
                          {/* 部位選択 */}
                          {karte.bodyParts.length > 0 && (
                            <div>
                              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                <MapPin size={11} />
                                施術部位
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {karte.bodyParts.map((part) => (
                                  <span
                                    key={part}
                                    className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] px-2.5 py-1 text-xs font-medium text-[var(--brand-dark)]"
                                  >
                                    {part}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 施術内容 */}
                          {karte.treatments.length > 0 && (
                            <div>
                              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                <CheckSquare size={11} />
                                施術内容
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {karte.treatments.map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* ── トレーニング記録（training_record トグル ON の場合のみ）── */}
                      {trainingEnabled && karte.exerciseRecords.length > 0 && (
                        <div className="rounded-xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-bg)]/40 p-4">
                          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--brand-dark)]">
                            <Dumbbell size={13} />
                            トレーニング記録（{karte.exerciseRecords.length}種目）
                          </p>
                          <div className="space-y-2">
                            {karte.exerciseRecords.map((rec) => (
                              <div
                                key={rec.id}
                                className="flex items-center justify-between gap-4 rounded-lg bg-white px-4 py-2.5 shadow-sm"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">
                                    {rec.exercise.name}
                                  </p>
                                  {rec.exercise.category && (
                                    <p className="text-[11px] text-gray-400">
                                      {rec.exercise.category}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-right text-xs text-gray-600">
                                  {rec.sets && rec.reps && (
                                    <span className="font-mono">
                                      {rec.sets}set × {rec.reps}rep
                                    </span>
                                  )}
                                  {rec.weightKg && Number(rec.weightKg) > 0 && (
                                    <span className="font-mono text-[var(--brand-dark)]">
                                      {rec.weightKg.toString()}kg
                                    </span>
                                  )}
                                  {rec.durationSec && (
                                    <span className="font-mono">{rec.durationSec}秒</span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {/* メモ（最初のレコードのメモを代表表示）*/}
                            {karte.exerciseRecords[0]?.memo && (
                              <p className="mt-2 text-xs italic text-[var(--brand-dark)]">
                                💬 {karte.exerciseRecords[0].memo}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* メディアファイル枠（professional モード）*/}
                      {isProfessional && (
                        <div className="rounded-xl border border-dashed border-gray-200 p-3">
                          {karte.media.length > 0 ? (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                添付ファイル（{karte.media.length}件）
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {karte.media.map((m) => (
                                  <span
                                    key={m.id}
                                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600"
                                  >
                                    {m.mediaType === "video" ? "🎬" : "🖼"}
                                    {m.mediaType === "video" ? "動画" : "画像"}
                                    {/* ⚠️ 実際の表示時は Signed URL を生成すること（CLAUDE.md 規約）*/}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-center text-xs text-gray-300">
                              添付ファイルなし
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
