/**
 * 新規医院登録ページ（システム管理者専用）
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RegisterClinicForm } from "./RegisterClinicForm";

export default function NewTenantPage() {
  return (
    <div className="space-y-6">

      {/* パンくず */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/tenants"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft size={14} />
          テナント一覧
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">新規医院登録</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-800">新規医院登録</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          登録後すぐに管理者アカウントでログインできます
        </p>
      </div>

      <RegisterClinicForm />

    </div>
  );
}
