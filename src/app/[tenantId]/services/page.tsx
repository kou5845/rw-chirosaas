/**
 * 施術マスタ管理ページ（Server Component）
 *
 * CLAUDE.md 規約: 全 Prisma クエリに tenantId を含めること（絶対ルール）
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ServicesClient, type ServiceRow } from "./ServicesClient";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function ServicesPage({ params }: Props) {
  const { tenantId: slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true },
  });
  if (!tenant) notFound();

  const services = await prisma.service.findMany({
    where:   { tenantId: tenant.id }, // CLAUDE.md 絶対ルール
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id:          true,
      name:        true,
      duration:    true,
      intervalMin: true,
      price:       true,
      description: true,
      sortOrder:   true,
      isActive:    true,
    },
  });

  const rows: ServiceRow[] = services;

  return (
    <div className="mx-auto max-w-4xl">
      <ServicesClient
        services={rows}
        tenantId={tenant.id}
        tenantSlug={slug}
      />
    </div>
  );
}
