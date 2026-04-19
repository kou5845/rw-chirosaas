/**
 * 旧マジックリンク URL の無効化
 *
 * /{tenantSlug}/mypage/{token} は廃止。
 * セッション認証（生年月日 + PIN）に統一したため、
 * このルートへのアクセスは新しいログインページへリダイレクトする。
 */

import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ tenantId: string; token: string }>;
};

export default async function MypageTokenRedirect({ params }: Props) {
  const { tenantId: slug } = await params;
  redirect(`/${slug}/mypage`);
}
