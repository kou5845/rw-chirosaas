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
  // DATABASE_URL を優先（本番 Vercel）
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (databaseUrl) {
    // PrismaPg は pg ライブラリを直接使うため、Prisma 固有の pgbouncer パラメータを除去する。
    // pgbouncer=true / connection_limit=1 は Prisma 組み込みプール向けのフラグ。
    const url = new URL(databaseUrl);
    url.searchParams.delete("pgbouncer");
    url.searchParams.delete("connection_limit");
    return url.toString();
  }

  // ローカル開発: DIRECT_URL をフォールバック
  return process.env.DIRECT_URL ?? "";
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
