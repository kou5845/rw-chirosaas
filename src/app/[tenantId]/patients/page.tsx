/**
 * 患者一覧ページ
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（絶対ルール）
 *   - 検索はサーバーサイドで処理する（URL searchParams を利用）
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Users,
  MessageCircle,
  Phone,
  CalendarDays,
  ChevronRight,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PatientSearchBar } from "@/components/patients/PatientSearchBar";
import { formatPatientId, formatDateJa, getInitial } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  params:       Promise<{ tenantId: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default async function PatientsPage({ params, searchParams }: Props) {
  const { tenantId: slug } = await params;
  const { q }              = await searchParams;

  // テナントをサブドメインで解決
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  // ── 患者一覧取得（CLAUDE.md 絶対ルール: tenantId フィルタ必須）──
  const patients = await prisma.patient.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { nameKana:    { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      // 最終来院日: 完了済み予約の中で最新のもの
      appointments: {
        where:   { tenantId: tenant.id, status: "completed" },
        orderBy: { startAt: "desc" },
        take:    1,
        select:  { startAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // 患者ごとの予約件数（全ステータス）
  const appointmentCounts = await prisma.appointment.groupBy({
    by:     ["patientId"],
    where:  { tenantId: tenant.id },
    _count: { id: true },
  });
  const countMap = new Map(
    appointmentCounts.map((r) => [r.patientId, r._count.id])
  );

  const totalCount = await prisma.patient.count({
    where: { tenantId: tenant.id, isActive: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── ページヘッダー ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">患者管理</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            登録患者 <span className="font-semibold text-gray-700">{totalCount}</span> 名
            {q && (
              <span className="ml-2 text-[var(--brand-dark)]">
                「{q}」の検索結果: {patients.length} 件
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PatientSearchBar defaultValue={q ?? ""} />
          <Link
            href={`/${slug}/patients/new`}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--brand-dark)]"
          >
            <UserPlus size={16} />
            <span className="hidden sm:inline">患者を追加</span>
          </Link>
        </div>
      </div>

      {/* ── 患者テーブル ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* テーブルヘッダー */}
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] items-center gap-4 border-b border-gray-100 bg-gray-50/60 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <span>患者情報</span>
          <span>電話番号</span>
          <span>最終来院日</span>
          <span>LINE</span>
          <span />
        </div>

        {patients.length === 0 ? (
          /* ── Empty State ── */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {q ? (
              <>
                <AlertCircle size={40} className="text-gray-200" />
                <p className="mt-3 text-sm font-medium text-gray-400">
                  「{q}」に一致する患者は見つかりませんでした
                </p>
                <Link
                  href={`/${slug}/patients`}
                  className="mt-2 text-xs text-[var(--brand-dark)] underline-offset-2 hover:underline"
                >
                  検索をクリア
                </Link>
              </>
            ) : (
              <>
                <Users size={40} className="text-gray-200" />
                <p className="mt-3 text-sm font-medium text-gray-400">
                  患者が登録されていません
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {patients.map((patient, index) => {
              const lastVisit = patient.appointments[0]?.startAt ?? null;
              const apptCount = countMap.get(patient.id) ?? 0;
              const hasLine   = !!patient.lineUserId;

              return (
                <Link
                  key={patient.id}
                  href={`/${slug}/patients/${patient.id}`}
                  className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--brand-hover)]"
                >
                  {/* 患者情報（アバター + 名前 + ID）*/}
                  <div className="flex min-w-0 items-center gap-3">
                    {/* アバター */}
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        index % 4 === 0 && "bg-[var(--brand-bg)] text-[var(--brand-dark)]",
                        index % 4 === 1 && "bg-indigo-50 text-indigo-600",
                        index % 4 === 2 && "bg-amber-50 text-amber-600",
                        index % 4 === 3 && "bg-emerald-50 text-emerald-600",
                      )}
                    >
                      {getInitial(patient.displayName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {patient.displayName}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[11px] font-mono text-gray-400">
                          {formatPatientId(patient.id)}
                        </span>
                        {apptCount > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-gray-400">
                            <CalendarDays size={10} />
                            {apptCount}件
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 電話番号 */}
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    {patient.phone ? (
                      <>
                        <Phone size={13} className="shrink-0 text-gray-400" />
                        <span className="truncate">{patient.phone}</span>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>

                  {/* 最終来院日 */}
                  <div className="text-sm">
                    {lastVisit ? (
                      <span className="text-gray-600">
                        {formatDateJa(lastVisit)}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">来院歴なし</span>
                    )}
                  </div>

                  {/* LINE 連携バッジ */}
                  <div>
                    {hasLine ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#00C300]/30 bg-[#00C300]/10 px-2.5 py-1 text-[11px] font-semibold text-[#00830B]">
                        <MessageCircle size={11} />
                        連携済
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-400">
                        未連携
                      </span>
                    )}
                  </div>

                  {/* 詳細矢印 */}
                  <ChevronRight size={16} className="text-gray-300" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
