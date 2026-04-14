/**
 * Prisma Client シングルトン
 *
 * 接続戦略:
 *   - ローカル開発: pgBouncer が疎通しないため DIRECT_URL から直接接続URLを構築
 *   - 本番 (Vercel): DATABASE_URL (pgBouncer) が使用可能
 *
 * CLAUDE.md 規約: 全クエリに tenant_id を含めること（このファイルでは強制不可・呼び出し側の責務）
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function buildConnectionString(): string {
  const directUrl = process.env.DIRECT_URL ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  // DIRECT_URL がすでに直接接続形式 (db.*.supabase.co) ならそのまま使う
  if (directUrl.includes(".supabase.co") && !directUrl.includes("pooler")) {
    return directUrl;
  }

  // DIRECT_URL がプール形式の場合: project ref + password を抽出して直接接続URLを構築
  const ref = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = directUrl.match(/:\/\/[^:]+:([^@]+)@/)?.[1];

  if (ref && password) {
    return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;
  }

  // 本番環境 (Vercel) では DATABASE_URL (pgBouncer) が利用可能
  return process.env.DATABASE_URL ?? "";
}

const prismaClientSingleton = () => {
  const adapter = new PrismaPg({ connectionString: buildConnectionString() });
  return new PrismaClient({ adapter });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}
