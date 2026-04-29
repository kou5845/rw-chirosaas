import Link from "next/link";
import {
  Building2, TrendingUp, Users, CheckCircle2, XCircle,
  CreditCard, ArrowRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function AdminRootPage() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true, name: true, plan: true, isActive: true,
      contractType: true, monthlyPrice: true,
      createdAt: true,
      _count: { select: { patients: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const active   = tenants.filter(t => t.isActive);
  const inactive = tenants.filter(t => !t.isActive);

  const mrr = active.reduce((sum, t) => {
    const monthly = t.contractType === "yearly"
      ? Math.round(t.monthlyPrice / 12)
      : t.monthlyPrice;
    return sum + monthly;
  }, 0);

  const arr = mrr * 12;

  const recentTenants = tenants.slice(0, 5);

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-semibold text-gray-800">管理ダッシュボード</h1>
        <p className="mt-0.5 text-sm text-gray-500">SyncotBase 全体の運営状況</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          icon={<Building2 size={16} />}
          label="総テナント数"
          value={tenants.length}
          sub={`有効 ${active.length} / 停止 ${inactive.length}`}
          color="blue"
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="MRR"
          value={`¥${mrr.toLocaleString()}`}
          sub="月次換算"
          color="emerald"
        />
        <KpiCard
          icon={<CreditCard size={16} />}
          label="ARR"
          value={`¥${arr.toLocaleString()}`}
          sub="年次換算"
          color="purple"
        />
        <KpiCard
          icon={<Users size={16} />}
          label="総患者数"
          value={tenants.reduce((s, t) => s + t._count.patients, 0)}
          sub="全テナント合計"
          color="amber"
        />
      </div>

      {/* プラン別内訳 */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="mb-4 text-xs font-bold uppercase tracking-wide text-gray-400">プラン別テナント</p>
        <div className="flex gap-6">
          {(["pro", "standard"] as const).map(plan => {
            const count   = active.filter(t => t.plan === plan).length;
            const planMrr = active
              .filter(t => t.plan === plan)
              .reduce((s, t) => s + (t.contractType === "yearly" ? Math.round(t.monthlyPrice / 12) : t.monthlyPrice), 0);
            return (
              <div key={plan} className="flex-1 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold
                  ${plan === "pro" ? "bg-purple-100 text-purple-700" : "bg-gray-200 text-gray-600"}`}>
                  {plan === "pro" ? "Pro" : "Standard"}
                </span>
                <p className="mt-2 text-2xl font-bold text-gray-800">{count} <span className="text-sm font-normal text-gray-400">件</span></p>
                <p className="text-xs text-gray-400 mt-0.5">MRR ¥{planMrr.toLocaleString()}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 最近登録のテナント */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">最近登録のテナント</p>
          <Link
            href="/admin/tenants"
            className="flex items-center gap-1 text-xs text-[var(--brand-dark)] hover:underline"
          >
            すべて見る <ArrowRight size={12} />
          </Link>
        </div>
        <ul className="divide-y divide-gray-50">
          {recentTenants.map(t => (
            <li key={t.id}>
              <Link
                href={`/admin/tenants/${t.id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                  ${t.isActive ? "bg-[var(--brand-bg)] text-[var(--brand)]" : "bg-gray-100 text-gray-400"}`}>
                  <Building2 size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.createdAt.toLocaleDateString("ja-JP")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold
                    ${t.plan === "pro" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                    {t.plan === "pro" ? "Pro" : "Std"}
                  </span>
                  {t.isActive
                    ? <CheckCircle2 size={13} className="text-emerald-500" />
                    : <XCircle size={13} className="text-red-400" />
                  }
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode; label: string; value: string | number; sub: string;
  color: "blue" | "emerald" | "purple" | "amber";
}) {
  const colorMap = {
    blue:    "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    purple:  "bg-purple-50 text-purple-600",
    amber:   "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800 tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
