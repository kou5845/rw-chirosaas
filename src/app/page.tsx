import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * ルートページ — セッション状態に応じて適切なページへリダイレクト
 *
 * - 未ログイン       → /login
 * - SuperAdmin       → /admin
 * - テナントユーザー  → /{tenantSlug}/dashboard
 */
export default async function RootPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.isSuperAdmin) {
    redirect("/admin");
  }

  const slug = session.user.tenantSlug;
  if (slug) {
    redirect(`/${slug}/dashboard`);
  }

  // tenantSlug が取れない場合（データ不整合）はログインへ戻す
  redirect("/login");
}
