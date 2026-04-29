"use client";

import { Download } from "lucide-react";

type TenantRow = {
  id: string; name: string; subdomain: string; plan: string;
  isActive: boolean; contractType: string; monthlyPrice: number;
  totalRevenue: number; phone: string; address: string;
  adminEmail: string; patients: number; appointments: number; createdAt: string;
};

export function TenantCsvButton({ tenants }: { tenants: TenantRow[] }) {
  function download() {
    const headers = [
      "ID", "医院名", "サブドメイン", "プラン", "状態",
      "契約タイプ", "月額料金", "累計収益", "電話番号", "住所",
      "管理者メール", "患者数", "予約数", "登録日",
    ];
    const rows = tenants.map(t => [
      t.id, t.name, t.subdomain, t.plan,
      t.isActive ? "有効" : "停止",
      t.contractType === "yearly" ? "年次" : "月次",
      t.monthlyPrice, t.totalRevenue,
      t.phone, t.address, t.adminEmail,
      t.patients, t.appointments, t.createdAt,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `tenants_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
    >
      <Download size={14} />
      CSV出力
    </button>
  );
}
