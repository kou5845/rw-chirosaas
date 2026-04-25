/**
 * 患者マイページ 暗証番号再発行ページ
 *
 * URL: /{tenantSlug}/mypage/pin-reset
 */

import { notFound } from "next/navigation";
import { prisma }   from "@/lib/prisma";
import { PinResetForm } from "./PinResetForm";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function PinResetPage({ params }: Props) {
  const { tenantId: slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { name: true },
  });
  if (!tenant) notFound();

  return <PinResetForm tenantSlug={slug} clinicName={tenant.name} />;
}
