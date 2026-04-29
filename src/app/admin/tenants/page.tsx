/**
 * テナント一覧ページ（システム管理者専用）
 *
 * CLAUDE.md 規約:
 *   - 全 Prisma クエリに tenantId を含めること（ここでは全テナントを取得するため不要）
 *   - このページは isSuperAdmin === true のセッションのみアクセス可
 */

import Link from "next/link";
import { Building2, PlusCircle, Users, CalendarDays, CheckCircle2, XCircle, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TenantActions } from "./TenantActions";
import { TenantCsvButton } from "./TenantCsvButton";

export default async function AdminTenantsPage() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { loginId: true, email: true } },
      _count: {
        select: {
          patients:     true,
          appointments: true,
        },
      },
    },
    // LINE設定を含む
    // (findMany の select は include と併用できないので include 内で select しない)
  });

  return (
    <div className="space-y-5">

      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">テナント一覧</h1>
          <p className="mt-0.5 text-sm text-gray-500">契約中の医院 {tenants.length} 件</p>
        </div>
        <div className="flex items-center gap-2">
          <TenantCsvButton tenants={tenants.map(t => ({
            id:            t.id,
            name:          t.name,
            subdomain:     t.subdomain ?? "",
            plan:          t.plan,
            isActive:      t.isActive,
            contractType:  t.contractType,
            monthlyPrice:  t.monthlyPrice,
            totalRevenue:  t.totalRevenue,
            phone:         t.phone ?? "",
            address:       t.address ?? "",
            adminEmail:    t.user?.email ?? "",
            patients:      t._count.patients,
            appointments:  t._count.appointments,
            createdAt:     t.createdAt.toISOString().slice(0, 10),
          }))} />
          <Link
            href="/admin/tenants/new"
            className="flex items-center gap-2 rounded-xl bg-[var(--brand-medium)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--brand-dark)] transition-colors"
          >
            <PlusCircle size={15} />
            新規医院登録
          </Link>
        </div>
      </div>

      {/* テナントリスト */}
      {tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Building2 size={36} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">まだ医院が登録されていません</p>
          <Link
            href="/admin/tenants/new"
            className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[var(--brand-dark)] underline-offset-2 hover:underline"
          >
            <PlusCircle size={14} />
            最初の医院を登録する
          </Link>
        </div>
      ) : (
        /* overflow-x-auto でテーブルが画面幅を超えた際に横スクロール */
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full min-w-[940px] text-sm">
            <colgroup>
              {/* 各列の幅を colgroup で固定 */}
              <col className="w-[220px]" />  {/* 医院名 */}
              <col className="w-[110px]" />  {/* テナントID */}
              <col className="w-[190px]" />  {/* 管理者 */}
              <col className="w-[90px]"  />  {/* プラン */}
              <col className="w-[72px]"  />  {/* 状態 */}
              <col className="w-[70px]"  />  {/* LINE */}
              <col className="w-[60px]"  />  {/* 患者 */}
              <col className="w-[60px]"  />  {/* 予約 */}
              <col className="w-[90px]"  />  {/* 登録日 */}
              <col className="w-[160px]" />  {/* 操作 */}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3 text-left">医院名</th>
                <th className="px-4 py-3 text-left">テナントID</th>
                <th className="px-4 py-3 text-left">管理者</th>
                <th className="px-4 py-3 text-center">プラン</th>
                <th className="px-4 py-3 text-center">状態</th>
                <th className="px-4 py-3 text-center">LINE</th>
                <th className="px-4 py-3 text-right">患者</th>
                <th className="px-4 py-3 text-right">予約</th>
                <th className="px-4 py-3 text-right">登録日</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  className={`transition-colors hover:bg-gray-50/60 ${!t.isActive ? "opacity-55" : ""}`}
                >
                  {/* 医院名 — whitespace-nowrap で縦書き防止 */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5 whitespace-nowrap">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                        ${t.isActive ? "bg-[var(--brand-bg)] text-[var(--brand)]" : "bg-gray-100 text-gray-400"}`}>
                        <Building2 size={13} />
                      </div>
                      <span className="font-medium text-gray-800">{t.name}</span>
                    </div>
                  </td>

                  {/* テナントID */}
                  <td className="px-4 py-3.5">
                    <code className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 whitespace-nowrap">
                      {t.subdomain ?? "—"}
                    </code>
                  </td>

                  {/* 管理者 — 長いメールを truncate で切り詰め */}
                  <td className="px-4 py-3.5 max-w-[190px]">
                    {t.user ? (
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-700 text-xs">{t.user.loginId}</p>
                        <p className="truncate text-xs text-gray-400 mt-0.5">{t.user.email}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  {/* プラン */}
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold
                      ${t.plan === "pro"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600"}`}>
                      {t.plan === "pro" ? "Pro" : "Standard"}
                    </span>
                  </td>

                  {/* 状態 */}
                  <td className="px-4 py-3.5 text-center">
                    {t.isActive ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-600">
                        <CheckCircle2 size={12} />
                        <span className="text-xs font-medium">有効</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-red-400">
                        <XCircle size={12} />
                        <span className="text-xs font-medium">停止</span>
                      </span>
                    )}
                  </td>

                  {/* LINE 連携状態 */}
                  <td className="px-4 py-3.5 text-center">
                    {t.lineChannelSecret && t.lineChannelAccessToken ? (
                      <span
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                        title="Channel Secret・Access Token が設定済み"
                      >
                        <MessageCircle size={11} />
                        設定済
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400"
                        title="LINE 連携が未設定です"
                      >
                        <MessageCircle size={11} />
                        未設定
                      </span>
                    )}
                  </td>

                  {/* 患者数 */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="inline-flex items-center justify-end gap-1 text-gray-600">
                      <Users size={11} className="text-gray-400" />
                      <span className="tabular-nums">{t._count.patients}</span>
                    </span>
                  </td>

                  {/* 予約数 */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="inline-flex items-center justify-end gap-1 text-gray-600">
                      <CalendarDays size={11} className="text-gray-400" />
                      <span className="tabular-nums">{t._count.appointments}</span>
                    </span>
                  </td>

                  {/* 登録日 */}
                  <td className="px-4 py-3.5 text-right text-xs tabular-nums text-gray-400 whitespace-nowrap">
                    {t.createdAt.toLocaleDateString("ja-JP", {
                      year:  "numeric",
                      month: "2-digit",
                      day:   "2-digit",
                    })}
                  </td>

                  {/* 操作ボタン — 幅固定・右揃え */}
                  <td className="px-5 py-3.5">
                    <TenantActions
                      tenant={{
                        id:       t.id,
                        name:     t.name,
                        isActive: t.isActive,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
