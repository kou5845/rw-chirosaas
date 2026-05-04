/**
 * ログイン中ユーザーの Profile を取得する。存在しない場合は自動作成する。
 *
 * NextAuth v5 は User テーブルを使って認証するが、AppointmentLog.changedById は
 * Profile テーブルの id を参照する。このユーティリティが両者を橋渡しする。
 */

import { prisma } from "@/lib/prisma";

export async function getOrCreateProfile(
  userId:   string,
  tenantId: string,
): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, email: true, loginId: true },
  });
  if (!user) return null;

  const existing = await prisma.profile.findUnique({
    where:  { id: user.id },
    select: { id: true },
  });
  if (existing) return existing;

  try {
    return await prisma.profile.create({
      data: {
        id:          user.id,
        tenantId,
        email:       user.email,
        displayName: user.loginId,
        role:        "admin",
        isActive:    true,
      },
      select: { id: true },
    });
  } catch {
    // email unique 制約違反の場合は email で再検索
    const byEmail = await prisma.profile.findUnique({
      where:  { tenantId_email: { tenantId, email: user.email } },
      select: { id: true },
    });
    return byEmail ?? null;
  }
}
