/**
 * NextAuth v5 の型拡張
 * session.user と JWT に tenantId / tenantSlug / tenantName / loginId / isSuperAdmin を追加する。
 */

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tenantId:    string;
    tenantName:  string;
    tenantSlug:  string;
    loginId:     string;
    isSuperAdmin: boolean;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id:          string;
      tenantId:    string;
      tenantName:  string;
      tenantSlug:  string;
      loginId:     string;
      isSuperAdmin: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId:    string;
    tenantName:  string;
    tenantSlug:  string;
    loginId:     string;
    isSuperAdmin: boolean;
  }
}
