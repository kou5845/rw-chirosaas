/**
 * ステージングDB用シードスクリプト
 * やまだ整骨院（A院・pro）とさくら整骨院（B院・standard）を作成する
 *
 * 実行方法: bash scripts/run-staging-seed.sh
 */

import path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env.staging") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

function buildConnectionString(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (url) {
    const parsed = new URL(url);
    parsed.searchParams.delete("pgbouncer");
    parsed.searchParams.delete("connection_limit");
    return parsed.toString();
  }
  return process.env.DIRECT_URL ?? "";
}

const adapter = new PrismaPg({ connectionString: buildConnectionString() });
const prisma = new PrismaClient({ adapter });

// ── 設定値 ──────────────────────────────────────────────────────
const YAMADA = {
  name:                   "やまだ整骨院",
  subdomain:              "yamada",
  plan:                   "pro" as const,
  phone:                  "03-0000-0001",
  address:                "東京都渋谷区テスト1-1-1",
  loginId:                "yamada-admin",
  email:                  "yamada@staging.test",
  password:               process.env.STAGING_ADMIN_PASSWORD ?? "stagingpass123",
  lineChannelSecret:      process.env.STAGING_YAMADA_LINE_SECRET      ?? null,
  lineChannelAccessToken: process.env.STAGING_YAMADA_LINE_TOKEN       ?? null,
  lineFriendUrl:          process.env.STAGING_YAMADA_LINE_FRIEND_URL  ?? null,
};

const SAKURA = {
  name:                   "さくら整骨院",
  subdomain:              "sakura",
  plan:                   "standard" as const,
  phone:                  "03-0000-0002",
  address:                "東京都新宿区テスト2-2-2",
  loginId:                "sakura-admin",
  email:                  "sakura@staging.test",
  password:               process.env.STAGING_ADMIN_PASSWORD ?? "stagingpass123",
  lineChannelSecret:      process.env.STAGING_SAKURA_LINE_SECRET      ?? null,
  lineChannelAccessToken: process.env.STAGING_SAKURA_LINE_TOKEN       ?? null,
  lineFriendUrl:          process.env.STAGING_SAKURA_LINE_FRIEND_URL  ?? null,
};

// A院のフィーチャートグル
const YAMADA_FEATURES = [
  { key: "karte_mode",         value: "professional" },
  { key: "training_record",    value: "true" },
  { key: "staff_assignment",   value: "true" },
  { key: "multi_staff",        value: "true" },
  { key: "appointment_buffer", value: "10" },
  { key: "insurance_billing",  value: "true" },
  { key: "ticket_pass",        value: "true" },
  { key: "cancellation_hours", value: "12" },
  { key: "require_approval",   value: "true" },
  { key: "line_notify",        value: "true" },
];

// B院のフィーチャートグル
const SAKURA_FEATURES = [
  { key: "karte_mode",         value: "simple" },
  { key: "training_record",    value: "false" },
  { key: "staff_assignment",   value: "false" },
  { key: "multi_staff",        value: "false" },
  { key: "appointment_buffer", value: "30" },
  { key: "insurance_billing",  value: "false" },
  { key: "ticket_pass",        value: "false" },
  { key: "cancellation_hours", value: "24" },
  { key: "require_approval",   value: "true" },
  { key: "line_notify",        value: "true" },
];

// 営業時間（月〜土営業、日曜定休）
function buildBusinessHours(tenantId: string) {
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    tenantId,
    dayOfWeek:    dow,
    isOpen:       dow !== 0, // 0=日曜定休
    openTime:     "09:00",
    closeTime:    "20:00",
    hasLunchBreak: dow !== 0,
    lunchStart:   "12:00",
    lunchEnd:     "13:00",
  }));
}

async function seedTenant(config: typeof YAMADA, features: typeof YAMADA_FEATURES) {
  console.log(`\n📋 ${config.name} を作成中...`);

  // 既存チェック
  const existing = await prisma.tenant.findFirst({
    where: { subdomain: config.subdomain },
  });
  if (existing) {
    console.log(`  ⚠️  subdomain="${config.subdomain}" は既に存在します。スキップします。`);
    return;
  }

  const passwordHash = await bcrypt.hash(config.password, 12);

  // テナント作成
  const tenant = await prisma.tenant.create({
    data: {
      name:                   config.name,
      subdomain:              config.subdomain,
      plan:                   config.plan,
      phone:                  config.phone,
      address:                config.address,
      lineChannelSecret:      config.lineChannelSecret,
      lineChannelAccessToken: config.lineChannelAccessToken,
      lineFriendUrl:          config.lineFriendUrl,
      lineEnabled:            true,
      isActive:               true,
      slotInterval:           30,
      maxCapacity:            1,
    },
  });
  console.log(`  ✅ Tenant作成: ${tenant.id}`);

  // 管理者ユーザー作成
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      loginId:  config.loginId,
      email:    config.email,
      password: passwordHash,
    },
  });
  console.log(`  ✅ User作成: loginId="${config.loginId}"`);

  // フィーチャートグル作成
  await prisma.tenantSetting.createMany({
    data: features.map((f) => ({
      tenantId:     tenant.id,
      featureKey:   f.key,
      featureValue: f.value,
    })),
  });
  console.log(`  ✅ TenantSetting作成: ${features.length}件`);

  // 営業時間作成
  await prisma.businessHour.createMany({
    data: buildBusinessHours(tenant.id),
  });
  console.log(`  ✅ BusinessHour作成: 7件`);

  return tenant;
}

async function seedSuperAdmin() {
  const email    = process.env.STAGING_SUPER_ADMIN_EMAIL    ?? "admin@staging.test";
  const password = process.env.STAGING_SUPER_ADMIN_PASSWORD ?? "superadmin123";

  const existing = await prisma.superAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`\n⚠️  SuperAdmin(${email}) は既に存在します。スキップします。`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.superAdmin.create({ data: { email, password: hash } });
  console.log(`\n✅ SuperAdmin作成: ${email}`);
}

async function main() {
  console.log("🌱 ステージングDBのシードを開始します...");
  console.log(`   DB: ${(process.env.DIRECT_URL ?? "").replace(/:([^@:]+)@/, ":***@")}`);

  await seedTenant(YAMADA, YAMADA_FEATURES);
  await seedTenant(SAKURA, SAKURA_FEATURES);
  await seedSuperAdmin();

  console.log("\n🎉 シード完了！");
  console.log("\n📝 ログイン情報:");
  console.log(`   やまだ整骨院: loginId="${YAMADA.loginId}" / password="${YAMADA.password}"`);
  console.log(`   さくら整骨院: loginId="${SAKURA.loginId}" / password="${SAKURA.password}"`);
  console.log(`   SuperAdmin:   email="${process.env.STAGING_SUPER_ADMIN_EMAIL ?? "admin@staging.test"}" / password="${process.env.STAGING_SUPER_ADMIN_PASSWORD ?? "superadmin123"}"`);
}

main()
  .catch((e) => { console.error("❌ シードエラー:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
