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
import { MypageStaleSessionClearer } from "../MypageStaleSessionClearer";

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

  // すでにログイン済みならマイページへ（患者の存在も確認してリダイレクトループを防止）
  const jar       = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value ?? "";
  const session   = cookieVal ? verifySessionToken(cookieVal) : null;
  if (session && session.tenantId === tenant.id) {
    // 患者が有効かを確認してからリダイレクト
    // 削除済み・非アクティブ患者のセッションが残っている場合は
    // /mypage へ戻すとループになるため、ここでフォーム表示に留める
    const patient = await prisma.patient.findFirst({
      where: { id: session.patientId, tenantId: tenant.id, isActive: true },
      select: { id: true },
    });
    if (patient) {
      redirect(`/${slug}/mypage`);
    }
    // 患者が見つからない → 古い Cookie をクリアしてログインフォームを表示
    return <MypageStaleSessionClearer tenantSlug={slug} clinicName={tenant.name} />;
  }

  return <MypageLoginForm tenantSlug={slug} clinicName={tenant.name} />;
}
