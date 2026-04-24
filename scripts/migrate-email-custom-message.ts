/**
 * データ移行スクリプト: emailCustomMessage → emailConfirmMsg
 *
 * 既存の emailCustomMessage フィールドの値を emailConfirmMsg へコピーする。
 * 実行: npx tsx scripts/migrate-email-custom-message.ts
 */

import path from "path";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// prisma.config.ts と同様の接続URL構築ロジック
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

function buildDirectUrl(): string {
  const directUrl  = process.env.DIRECT_URL ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  if (directUrl.includes("db.") && directUrl.includes(".supabase.co")) {
    return directUrl;
  }

  const ref      = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = directUrl.match(/:\/\/[^:]+:([^@]+)@/)?.[1];

  if (ref && password) {
    return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;
  }

  return process.env.DATABASE_URL ?? directUrl;
}

const connectionString = buildDirectUrl();
const adapter = new PrismaPg({ connectionString });
const prisma  = new PrismaClient({ adapter });

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { emailCustomMessage: { not: null } },
    select: { id: true, name: true, emailCustomMessage: true },
  });

  if (tenants.length === 0) {
    console.log("移行対象のテナントはありません。");
    return;
  }

  console.log(`移行対象: ${tenants.length} テナント`);

  for (const tenant of tenants) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data:  { emailConfirmMsg: tenant.emailCustomMessage },
    });
    console.log(`  ✓ ${tenant.name} (${tenant.id}) を移行しました`);
  }

  console.log("移行完了。");
}

main()
  .catch((e) => {
    console.error("移行エラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
