/**
 * 患者新規登録ページ
 *
 * CLAUDE.md 規約:
 *   - tenantId はセッション由来の値を使用（DB照合済み）
 *   - モバイルファースト設計・44px タップターゲット確保
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewPatientForm } from "./NewPatientForm";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function NewPatientPage({ params }: Props) {
  const { tenantId: slug } = await params;

  // CLAUDE.md 絶対ルール: tenantId フィルタ必須
  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <NewPatientForm tenantId={tenant.id} tenantSlug={slug} />
    </div>
  );
}
