/**
 * NextAuth v5 (Auth.js) 設定
 *
 * CLAUDE.md 規約:
 *   - Credentials Provider で loginId + password (bcrypt) 認証
 *   - セッション (JWT) に tenantId / tenantSlug / tenantName を保持
 *   - tenantId はセッション由来の値のみ使用（リクエストパラメータ不使用）
 *   - SuperAdmin はメールアドレスを loginId として使用し、isSuperAdmin: true をセットする
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },

  providers: [
    Credentials({
      credentials: {
        loginId:  { label: "ログインID",  type: "text"     },
        password: { label: "パスワード",  type: "password" },
      },

      async authorize(credentials) {
        const loginId  = credentials?.loginId  as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!loginId || !password) {
          return null;
        }

        // ── 1. テナントユーザーとして照合 ──────────────────────
        const user = await prisma.user.findUnique({
          where:   { loginId },
          include: {
            tenant: { select: { id: true, name: true, subdomain: true, isActive: true } },
          },
        });

        if (user) {
          // 無効化されたテナントはログイン拒否
          if (!user.tenant.isActive) {
            return null;
          }

          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return null;

          return {
            id:          user.id,
            loginId:     user.loginId,
            email:       user.email ?? "",
            tenantId:    user.tenantId,
            tenantName:  user.tenant.name,
            tenantSlug:  user.tenant.subdomain ?? "",
            isSuperAdmin: false,
          };
        }

        // ── 2. システム管理者（SuperAdmin）として照合 ──────────
        // SuperAdmin は loginId フィールドにメールアドレスを入力する
        const superAdmin = await prisma.superAdmin.findUnique({
          where: { email: loginId },
        });

        if (superAdmin) {
          const valid = await bcrypt.compare(password, superAdmin.password);
          if (!valid) return null;

          return {
            id:          superAdmin.id,
            loginId:     superAdmin.email,
            email:       superAdmin.email,
            tenantId:    "",
            tenantName:  "システム管理者",
            tenantSlug:  "",
            isSuperAdmin: true,
          };
        }

        return null;
      },
    }),
  ],

  callbacks: {
    // JWT にカスタムフィールドを追加
    jwt({ token, user }) {
      if (user) {
        token.id          = user.id;
        token.loginId     = (user as { loginId: string }).loginId;
        token.tenantId    = (user as { tenantId: string }).tenantId;
        token.tenantName  = (user as { tenantName: string }).tenantName;
        token.tenantSlug  = (user as { tenantSlug: string }).tenantSlug;
        token.isSuperAdmin = (user as { isSuperAdmin: boolean }).isSuperAdmin;
      }
      return token;
    },

    // Session オブジェクトに JWT 値をコピー
    session({ session, token }) {
      session.user.id          = token.sub ?? "";
      session.user.loginId     = (token.loginId     as string)  ?? "";
      session.user.tenantId    = (token.tenantId    as string)  ?? "";
      session.user.tenantName  = (token.tenantName  as string)  ?? "";
      session.user.tenantSlug  = (token.tenantSlug  as string)  ?? "";
      session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});
