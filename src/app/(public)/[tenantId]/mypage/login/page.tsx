/**
 * 患者マイページ ログインページ
 *
 * URL: /{tenantSlug}/mypage/login
 * 認証済みの場合は /{tenantSlug}/mypage へリダイレクト
 */

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySessionToken, COOKIE_NAME } from "@/lib/mypage-session";
import { MypageLoginForm } from "../MypageLoginForm";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export default async function MypageLoginPage({ params }: Props) {
  const { tenantId: slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where:  { subdomain: slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  // すでにログイン済みならマイページへ
  const jar       = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value ?? "";
  const session   = cookieVal ? verifySessionToken(cookieVal) : null;
  if (session && session.tenantId === tenant.id) {
    redirect(`/${slug}/mypage`);
  }

  return <MypageLoginForm tenantSlug={slug} clinicName={tenant.name} />;
}
