import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Building2, CreditCard, FileText, Users, CalendarDays,
  CheckCircle2, XCircle, MessageCircle, BadgeCheck,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { BasicInfoForm, ContractForm, AdminMemoForm, ToggleStatusButton } from "./TenantDetailForms";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "医院詳細" };

type Props = { params: Promise<{ tenantId: string }> };

export default async function TenantDetailPage({ params }: Props) {
  const { tenantId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      user: { select: { loginId: true, email: true } },
      _count: { select: { patients: true, appointments: true } },
    },
  });

  if (!tenant) notFound();

  const lineConfigured = !!(tenant.lineChannelSecret && tenant.lineChannelAccessToken);

  return (
    <div className="space-y-6">

      {/* パンくず + ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/admin/tenants"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft size={12} />
            テナント一覧に戻る
          </Link>
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
              ${tenant.isActive ? "bg-[var(--brand-bg)] text-[var(--brand)]" : "bg-gray-100 text-gray-400"}`}>
              <Building2 size={16} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">{tenant.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {tenant.subdomain && (
                  <code className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {tenant.subdomain}
                  </code>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold
                  ${tenant.plan === "pro" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                  {tenant.plan === "pro" ? "Pro" : "Standard"}
                </span>
                {tenant.isActive ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 size={11} />有効
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-400">
                    <XCircle size={11} />停止中
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <ToggleStatusButton tenantId={tenant.id} isActive={tenant.isActive} />
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Users size={15} />} label="患者数" value={tenant._count.patients} />
        <StatCard icon={<CalendarDays size={15} />} label="総予約数" value={tenant._count.appointments} />
        <StatCard
          icon={<CreditCard size={15} />}
          label="月額料金"
          value={`¥${tenant.monthlyPrice.toLocaleString()}`}
          sub={tenant.contractType === "yearly" ? "年次" : "月次"}
        />
        <StatCard
          icon={<BadgeCheck size={15} />}
          label="累計収益"
          value={`¥${tenant.totalRevenue.toLocaleString()}`}
        />
      </div>

      {/* 管理者アカウント */}
      {tenant.user && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">管理者アカウント</p>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-400">ログインID</p>
              <p className="font-medium text-gray-700">{tenant.user.loginId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">メールアドレス</p>
              <p className="font-medium text-gray-700">{tenant.user.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* 2カラムレイアウト */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* 基本情報 + LINE 設定 */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
          <SectionHeader icon={<Building2 size={15} />} title="基本情報・LINE設定" />
          <BasicInfoForm tenant={{
            id:                     tenant.id,
            name:                   tenant.name,
            plan:                   tenant.plan,
            phone:                  tenant.phone,
            address:                tenant.address,
            lineChannelSecret:      tenant.lineChannelSecret,
            lineChannelAccessToken: tenant.lineChannelAccessToken,
            lineFriendUrl:          tenant.lineFriendUrl,
          }} />
        </section>

        {/* 契約・請求 */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
          <SectionHeader icon={<CreditCard size={15} />} title="契約・請求管理" />
          <ContractForm tenant={{
            id:              tenant.id,
            contractType:    tenant.contractType,
            monthlyPrice:    tenant.monthlyPrice,
            contractStartAt: tenant.contractStartAt,
            nextBillingAt:   tenant.nextBillingAt,
            totalRevenue:    tenant.totalRevenue,
          }} />
        </section>

      </div>

      {/* LINE 連携ステータス */}
      <div className={`rounded-2xl border p-5 shadow-sm ${lineConfigured ? "border-green-100 bg-green-50/30" : "border-amber-100 bg-amber-50/30"}`}>
        <div className="flex items-center gap-2">
          <MessageCircle size={15} className={lineConfigured ? "text-green-600" : "text-amber-500"} />
          <p className="text-sm font-semibold text-gray-700">LINE 連携状態</p>
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold
            ${lineConfigured ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {lineConfigured ? "設定済み" : "未設定"}
          </span>
        </div>
        {!lineConfigured && (
          <p className="mt-2 text-xs text-amber-700">
            Channel Secret と Channel Access Token を上の「基本情報・LINE設定」フォームから設定してください。
          </p>
        )}
      </div>

      {/* 運営メモ */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <SectionHeader icon={<FileText size={15} />} title="運営メモ" />
        <AdminMemoForm tenantId={tenant.id} adminMemo={tenant.adminMemo} />
      </section>

    </div>
  );
}

function StatCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-800 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
      <span className="text-[var(--brand)]">{icon}</span>
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
    </div>
  );
}
