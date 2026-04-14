/**
 * chiro-saas シードデータ
 * A院（高機能・professional モード）と B院（シンプル運用）のテストデータを投入する。
 *
 * 実行: npx tsx prisma/seed.ts
 *
 * CLAUDE.md 規約:
 *   - 全クエリに tenant_id を含めること
 *   - Profile の id は Supabase auth.users.id と一致させる（ここではテスト用 UUID を使用）
 */

import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env.local") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// シードスクリプトはダイレクト接続を使う
// pgBouncer (DATABASE_URL) はローカル環境から疎通しない場合があるため
function buildDirectUrl(): string {
  const directUrl = process.env.DIRECT_URL ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (directUrl.includes("db.") && directUrl.includes(".supabase.co")) return directUrl;
  const ref = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = directUrl.match(/:\/\/[^:]+:([^@]+)@/)?.[1];
  if (!ref || !password) throw new Error("Supabase 接続情報が不足しています");
  return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;
}

const adapter = new PrismaPg({
  connectionString: buildDirectUrl(),
});
const prisma = new PrismaClient({ adapter });

// ── テスト用固定 UUID ──────────────────────────────────────────
const IDS = {
  // Tenants
  TENANT_A: "00000000-0000-0000-0000-000000000001",
  TENANT_B: "00000000-0000-0000-0000-000000000002",

  // Users（認証用）
  USER_A: "30000000-0000-0000-0000-000000000001",
  USER_B: "30000000-0000-0000-0000-000000000002",

  // Profiles (A院)
  PROFILE_A_ADMIN: "10000000-0000-0000-0000-000000000001",
  PROFILE_A_STAFF: "10000000-0000-0000-0000-000000000002",

  // Profiles (B院)
  PROFILE_B_ADMIN: "20000000-0000-0000-0000-000000000001",

  // Patients (A院)
  PATIENT_A1: "11000000-0000-0000-0000-000000000001",
  PATIENT_A2: "11000000-0000-0000-0000-000000000002",
  PATIENT_A3: "11000000-0000-0000-0000-000000000003",

  // Patients (B院)
  PATIENT_B1: "21000000-0000-0000-0000-000000000001",
  PATIENT_B2: "21000000-0000-0000-0000-000000000002",

  // Appointments (A院)
  APPT_A1: "12000000-0000-0000-0000-000000000001",
  APPT_A2: "12000000-0000-0000-0000-000000000002",
  APPT_A3: "12000000-0000-0000-0000-000000000003",

  // Appointments (B院)
  APPT_B1: "22000000-0000-0000-0000-000000000001",
  APPT_B2: "22000000-0000-0000-0000-000000000002",

  // Exercises (A院)
  EX_SQUAT: "13000000-0000-0000-0000-000000000001",
  EX_LUNGE: "13000000-0000-0000-0000-000000000002",
  EX_PLANK: "13000000-0000-0000-0000-000000000003",
  EX_BRIDGE: "13000000-0000-0000-0000-000000000004",
  EX_DEADLIFT: "13000000-0000-0000-0000-000000000005",
} as const;

// ── ヘルパー: 日時オフセット ──────────────────────────────────
const daysFromNow = (d: number, h = 10): Date => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(h, 0, 0, 0);
  return dt;
};

async function main() {
  console.log("🌱 シードデータ投入開始...\n");

  // ── 既存データを全削除（開発用リセット）─────────────────────
  console.log("🗑️  既存データをリセット中...");
  await prisma.notificationQueue.deleteMany();
  await prisma.exerciseRecord.deleteMany();
  await prisma.karteMedia.deleteMany();
  await prisma.karte.deleteMany();
  await prisma.appointmentLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.exercise.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.tenantSetting.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.superAdmin.deleteMany();
  console.log("✅ リセット完了\n");

  // ────────────────────────────────────────────────────────────
  // 1. テナント作成
  // ────────────────────────────────────────────────────────────
  console.log("🏥 テナント作成中...");

  const tenantA = await prisma.tenant.create({
    data: {
      id: IDS.TENANT_A,
      name: "やまだ整骨院（A院）",
      subdomain: "yamada",
      logoUrl: null,
      colorTheme: { primary: "#3B82F6", accent: "#10B981" },
      plan: "pro",
    },
  });

  const tenantB = await prisma.tenant.create({
    data: {
      id: IDS.TENANT_B,
      name: "さくら整骨院（B院）",
      subdomain: "sakura",
      colorTheme: { primary: "#6366F1", accent: "#F59E0B" },
      plan: "standard",
    },
  });

  console.log(`  ✅ ${tenantA.name}`);
  console.log(`  ✅ ${tenantB.name}\n`);

  // ────────────────────────────────────────────────────────────
  // 2. フィーチャートグル設定
  // ────────────────────────────────────────────────────────────
  console.log("⚙️  フィーチャートグル設定中...");

  // A院: 全機能 ON
  const settingsA = [
    { featureKey: "karte_mode", featureValue: "professional" },
    { featureKey: "training_record", featureValue: "true" },
    { featureKey: "staff_assignment", featureValue: "true" },
    { featureKey: "multi_staff", featureValue: "true" },
    { featureKey: "appointment_buffer", featureValue: "10" },
    { featureKey: "insurance_billing", featureValue: "true" },
    { featureKey: "ticket_pass", featureValue: "true" },
    { featureKey: "cancellation_hours", featureValue: "12" },
    { featureKey: "require_approval", featureValue: "true" },
    { featureKey: "line_notify", featureValue: "true" },
  ];

  // B院: シンプル設定
  const settingsB = [
    { featureKey: "karte_mode", featureValue: "simple" },
    { featureKey: "training_record", featureValue: "false" },
    { featureKey: "staff_assignment", featureValue: "false" },
    { featureKey: "multi_staff", featureValue: "false" },
    { featureKey: "appointment_buffer", featureValue: "30" },
    { featureKey: "insurance_billing", featureValue: "false" },
    { featureKey: "ticket_pass", featureValue: "false" },
    { featureKey: "cancellation_hours", featureValue: "24" },
    { featureKey: "require_approval", featureValue: "true" },
    { featureKey: "line_notify", featureValue: "true" },
  ];

  await prisma.tenantSetting.createMany({
    data: [
      ...settingsA.map((s) => ({ tenantId: IDS.TENANT_A, ...s })),
      ...settingsB.map((s) => ({ tenantId: IDS.TENANT_B, ...s })),
    ],
  });

  console.log(`  ✅ A院: ${settingsA.length}件 (professional モード、全機能ON)`);
  console.log(`  ✅ B院: ${settingsB.length}件 (simple モード、最小限)\n`);

  // ────────────────────────────────────────────────────────────
  // 3. プロフィール（スタッフ・管理者）
  // ────────────────────────────────────────────────────────────
  console.log("👤 プロフィール作成中...");

  // A院: 院長 + スタッフ1名
  await prisma.profile.createMany({
    data: [
      {
        id: IDS.PROFILE_A_ADMIN,
        tenantId: IDS.TENANT_A,
        email: "yamada.admin@example.com",
        displayName: "山田 太郎（院長）",
        role: "admin",
      },
      {
        id: IDS.PROFILE_A_STAFF,
        tenantId: IDS.TENANT_A,
        email: "yamada.staff@example.com",
        displayName: "鈴木 花子（スタッフ）",
        role: "staff",
      },
    ],
  });

  // B院: 院長のみ
  await prisma.profile.create({
    data: {
      id: IDS.PROFILE_B_ADMIN,
      tenantId: IDS.TENANT_B,
      email: "sakura.admin@example.com",
      displayName: "佐藤 次郎（院長）",
      role: "admin",
    },
  });

  console.log("  ✅ A院: 院長・スタッフ 2名");
  console.log("  ✅ B院: 院長 1名\n");

  // ────────────────────────────────────────────────────────────
  // 3b. 認証ユーザー作成（bcrypt ハッシュ化）
  // ────────────────────────────────────────────────────────────
  console.log("🔐 認証ユーザー作成中...");

  const [hashA, hashB] = await Promise.all([
    bcrypt.hash("password123", 12),
    bcrypt.hash("password123", 12),
  ]);

  await prisma.user.createMany({
    data: [
      {
        id:       IDS.USER_A,
        tenantId: IDS.TENANT_A,
        loginId:  "yamada-admin",
        email:    "yamada.admin@example.com",
        password: hashA,
      },
      {
        id:       IDS.USER_B,
        tenantId: IDS.TENANT_B,
        loginId:  "sakura-admin",
        email:    "sakura.admin@example.com",
        password: hashB,
      },
    ],
  });

  console.log("  ✅ A院: loginId=yamada-admin / pass=password123");
  console.log("  ✅ B院: loginId=sakura-admin / pass=password123\n");

  // ────────────────────────────────────────────────────────────
  // 4. 患者データ
  // ────────────────────────────────────────────────────────────
  console.log("🧑‍⚕️  患者データ作成中...");

  await prisma.patient.createMany({
    data: [
      // A院 患者
      {
        id: IDS.PATIENT_A1,
        tenantId: IDS.TENANT_A,
        displayName: "田中 一郎",
        email: "tanaka@example.com",
        phone: "090-1111-0001",
        birthDate: new Date("1985-06-15"),
        lineUserId: "Uaaaa0001",
        emergencyContact: "田中 花子（妻）090-1111-9001",
        memo: "腰痛持ち。長時間座位で悪化する傾向あり。",
      },
      {
        id: IDS.PATIENT_A2,
        tenantId: IDS.TENANT_A,
        displayName: "佐々木 美咲",
        email: "sasaki@example.com",
        phone: "090-1111-0002",
        birthDate: new Date("1992-11-03"),
        lineUserId: "Uaaaa0002",
        memo: "肩こり・頭痛が主訴。デスクワーク8時間/日。",
      },
      {
        id: IDS.PATIENT_A3,
        tenantId: IDS.TENANT_A,
        displayName: "高橋 健司",
        phone: "090-1111-0003",
        birthDate: new Date("1978-02-20"),
        lineUserId: "Uaaaa0003",
        memo: "マラソン愛好家。左膝痛。月2回定期来院。",
      },
      // B院 患者
      {
        id: IDS.PATIENT_B1,
        tenantId: IDS.TENANT_B,
        displayName: "中村 陽子",
        email: "nakamura@example.com",
        phone: "090-2222-0001",
        birthDate: new Date("1968-08-28"),
        lineUserId: "Ubbbb0001",
      },
      {
        id: IDS.PATIENT_B2,
        tenantId: IDS.TENANT_B,
        displayName: "伊藤 光男",
        phone: "090-2222-0002",
        birthDate: new Date("1955-04-10"),
      },
    ],
  });

  console.log("  ✅ A院: 3名（LINE連携・備考あり）");
  console.log("  ✅ B院: 2名\n");

  // ────────────────────────────────────────────────────────────
  // 5. 予約データ
  // ────────────────────────────────────────────────────────────
  console.log("📅 予約データ作成中...");

  // A院: pending 1件 + confirmed 2件
  await prisma.appointment.create({
    data: {
      id: IDS.APPT_A1,
      tenantId: IDS.TENANT_A,
      patientId: IDS.PATIENT_A1,
      staffId: IDS.PROFILE_A_STAFF,
      menuName: "全身矯正コース",
      durationMin: 60,
      price: 8000,
      status: "pending",
      startAt: daysFromNow(3, 10),
      endAt: daysFromNow(3, 11),
      note: "初回来院。腰と肩を中心にお願いしたい。",
    },
  });

  const apptA2 = await prisma.appointment.create({
    data: {
      id: IDS.APPT_A2,
      tenantId: IDS.TENANT_A,
      patientId: IDS.PATIENT_A2,
      staffId: IDS.PROFILE_A_ADMIN,
      menuName: "肩こり集中ケア",
      durationMin: 40,
      price: 5500,
      status: "confirmed",
      startAt: daysFromNow(1, 14),
      endAt: daysFromNow(1, 15),
      confirmedAt: new Date(),
      confirmedBy: IDS.PROFILE_A_ADMIN,
    },
  });

  const apptA3 = await prisma.appointment.create({
    data: {
      id: IDS.APPT_A3,
      tenantId: IDS.TENANT_A,
      patientId: IDS.PATIENT_A3,
      staffId: IDS.PROFILE_A_STAFF,
      menuName: "スポーツケア（膝）",
      durationMin: 50,
      price: 7000,
      status: "completed",
      startAt: daysFromNow(-7, 10),
      endAt: daysFromNow(-7, 11),
      confirmedAt: daysFromNow(-8),
      confirmedBy: IDS.PROFILE_A_ADMIN,
    },
  });

  // B院: pending 1件 + confirmed 1件
  await prisma.appointment.create({
    data: {
      id: IDS.APPT_B1,
      tenantId: IDS.TENANT_B,
      patientId: IDS.PATIENT_B1,
      menuName: "腰痛施術",
      durationMin: 30,
      price: 3000,
      status: "pending",
      startAt: daysFromNow(2, 11),
      endAt: daysFromNow(2, 12),
      note: "3ヶ月ぶりの来院。",
    },
  });

  await prisma.appointment.create({
    data: {
      id: IDS.APPT_B2,
      tenantId: IDS.TENANT_B,
      patientId: IDS.PATIENT_B2,
      menuName: "全身調整",
      durationMin: 30,
      price: 3000,
      status: "confirmed",
      startAt: daysFromNow(5, 9),
      endAt: daysFromNow(5, 10),
      confirmedAt: new Date(),
      confirmedBy: IDS.PROFILE_B_ADMIN,
    },
  });

  console.log("  ✅ A院: 3件（pending 1 / confirmed 1 / completed 1）");
  console.log("  ✅ B院: 2件（pending 1 / confirmed 1）\n");

  // ────────────────────────────────────────────────────────────
  // 6. 予約変更ログ（CLAUDE.md 絶対ルール: 全ステータス変更を記録）
  // ────────────────────────────────────────────────────────────
  await prisma.appointmentLog.createMany({
    data: [
      // A院 apptA2: pending → confirmed
      {
        appointmentId: apptA2.id,
        oldStatus: "pending",
        newStatus: "confirmed",
        changedById: IDS.PROFILE_A_ADMIN,
        note: "電話にて患者確認済み",
        changedAt: new Date(),
      },
      // A院 apptA3: pending → confirmed → completed
      {
        appointmentId: apptA3.id,
        oldStatus: "pending",
        newStatus: "confirmed",
        changedById: IDS.PROFILE_A_ADMIN,
        changedAt: daysFromNow(-8),
      },
      {
        appointmentId: apptA3.id,
        oldStatus: "confirmed",
        newStatus: "completed",
        changedById: IDS.PROFILE_A_STAFF,
        note: "施術完了。次回2週間後を推奨。",
        changedAt: daysFromNow(-7),
      },
    ],
  });

  console.log("📋 予約ログ: 3件記録\n");

  // ────────────────────────────────────────────────────────────
  // 6b. 営業時間設定（BusinessHour）
  // ────────────────────────────────────────────────────────────
  console.log("🕐 営業時間設定中...");

  // A院: 月〜土営業（09:00-20:00）、日曜定休
  // B院: 月〜金営業（09:00-18:00）、土日定休
  const businessHoursData = [
    // A院
    { tenantId: IDS.TENANT_A, dayOfWeek: 0, isOpen: false, openTime: "09:00", closeTime: "20:00" }, // 日
    { tenantId: IDS.TENANT_A, dayOfWeek: 1, isOpen: true,  openTime: "09:00", closeTime: "20:00" }, // 月
    { tenantId: IDS.TENANT_A, dayOfWeek: 2, isOpen: true,  openTime: "09:00", closeTime: "20:00" }, // 火
    { tenantId: IDS.TENANT_A, dayOfWeek: 3, isOpen: true,  openTime: "09:00", closeTime: "20:00" }, // 水
    { tenantId: IDS.TENANT_A, dayOfWeek: 4, isOpen: true,  openTime: "09:00", closeTime: "20:00" }, // 木
    { tenantId: IDS.TENANT_A, dayOfWeek: 5, isOpen: true,  openTime: "09:00", closeTime: "20:00" }, // 金
    { tenantId: IDS.TENANT_A, dayOfWeek: 6, isOpen: true,  openTime: "09:00", closeTime: "17:00" }, // 土
    // B院
    { tenantId: IDS.TENANT_B, dayOfWeek: 0, isOpen: false, openTime: "09:00", closeTime: "18:00" }, // 日
    { tenantId: IDS.TENANT_B, dayOfWeek: 1, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 月
    { tenantId: IDS.TENANT_B, dayOfWeek: 2, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 火
    { tenantId: IDS.TENANT_B, dayOfWeek: 3, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 水
    { tenantId: IDS.TENANT_B, dayOfWeek: 4, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 木
    { tenantId: IDS.TENANT_B, dayOfWeek: 5, isOpen: true,  openTime: "09:00", closeTime: "18:00" }, // 金
    { tenantId: IDS.TENANT_B, dayOfWeek: 6, isOpen: false, openTime: "09:00", closeTime: "18:00" }, // 土
  ];

  await prisma.businessHour.createMany({ data: businessHoursData });
  console.log("  ✅ A院: 月〜土営業 (09:00-20:00、土は17:00まで)");
  console.log("  ✅ B院: 月〜金営業 (09:00-18:00)\n");

  // ────────────────────────────────────────────────────────────
  // 7. カルテデータ（A院: professional / B院: simple）
  // ────────────────────────────────────────────────────────────
  console.log("📝 カルテデータ作成中...");

  // A院カルテ: professional モード（部位・施術内容・状態評価あり）
  const karteA = await prisma.karte.create({
    data: {
      tenantId: IDS.TENANT_A,
      appointmentId: apptA3.id,
      patientId: IDS.PATIENT_A3,
      staffId: IDS.PROFILE_A_STAFF,
      karteModeSnapshot: "professional",
      conditionNote: "左膝内側の違和感。階段の昇降時に痛みあり。",
      progressNote: "前回より可動域が10度改善。痛みのVASは7→5に低下。",
      conditionStatus: "fair",
      bodyParts: ["左膝", "左大腿部", "左股関節"],
      treatments: ["アクチベーター", "テーピング", "ストレッチ指導"],
    },
  });

  // A院カルテ: トレーニング種目マスタ（一般的なプリセット）
  await prisma.exercise.createMany({
    data: [
      {
        id: IDS.EX_SQUAT,
        tenantId: IDS.TENANT_A,
        name: "スクワット",
        category: "下半身",
      },
      {
        id: IDS.EX_LUNGE,
        tenantId: IDS.TENANT_A,
        name: "ランジ",
        category: "下半身",
      },
      {
        id: IDS.EX_PLANK,
        tenantId: IDS.TENANT_A,
        name: "プランク",
        category: "体幹",
      },
      {
        id: IDS.EX_BRIDGE,
        tenantId: IDS.TENANT_A,
        name: "グルートブリッジ",
        category: "体幹",
      },
      {
        id: IDS.EX_DEADLIFT,
        tenantId: IDS.TENANT_A,
        name: "ルーマニアンデッドリフト",
        category: "下半身",
      },
    ],
  });

  // A院カルテ: トレーニング実施記録
  await prisma.exerciseRecord.createMany({
    data: [
      {
        tenantId: IDS.TENANT_A,
        karteId: karteA.id,
        exerciseId: IDS.EX_SQUAT,
        sets: 3,
        reps: 15,
        weightKg: 0,
        memo: "膝が内側に入らないよう意識。フォーム指導あり。",
      },
      {
        tenantId: IDS.TENANT_A,
        karteId: karteA.id,
        exerciseId: IDS.EX_BRIDGE,
        sets: 3,
        reps: 20,
        durationSec: null,
        memo: "左殿筋の活性化目的。",
      },
    ],
  });

  // B院カルテ: simple モード（テキストのみ）
  const apptB2Confirmed = await prisma.appointment.findUnique({
    where: { id: IDS.APPT_B2 },
  });

  // B院はcompleted状態の過去予約がないのでログのみ別途作成
  // apptB2はconfirmedなのでカルテなし（施術後に作成する想定）
  // 代わりに履歴的なカルテを直接作成（appointment紐付けなし）
  await prisma.karte.create({
    data: {
      tenantId: IDS.TENANT_B,
      patientId: IDS.PATIENT_B1,
      staffId: IDS.PROFILE_B_ADMIN,
      karteModeSnapshot: "simple",
      conditionNote: "腰部全体の重だるさ。特に夕方に悪化する。",
      progressNote: "施術後、可動域改善。痛みは軽減傾向。次回1週間後。",
    },
  });

  console.log("  ✅ A院: professional カルテ 1件（部位・施術・トレーニング記録あり）");
  console.log("  ✅ A院: トレーニング種目マスタ 5件");
  console.log("  ✅ B院: simple カルテ 1件\n");

  // ────────────────────────────────────────────────────────────
  // 8. 通知キュー（LINE リマインダー）
  // ────────────────────────────────────────────────────────────
  console.log("🔔 通知キュー作成中...");

  // CLAUDE.md 規約: デフォルトは 24時間前 と 2時間前
  const apptA2StartAt = apptA2.startAt;
  const reminder24h = new Date(apptA2StartAt.getTime() - 24 * 60 * 60 * 1000);
  const reminder2h = new Date(apptA2StartAt.getTime() - 2 * 60 * 60 * 1000);

  await prisma.notificationQueue.createMany({
    data: [
      // A院 confirmed 予約のリマインダー
      {
        tenantId: IDS.TENANT_A,
        appointmentId: IDS.APPT_A2,
        patientId: IDS.PATIENT_A2,
        channel: "line",
        notificationType: "confirmation",
        scheduledAt: new Date(),
        status: "sent",
        sentAt: new Date(),
      },
      {
        tenantId: IDS.TENANT_A,
        appointmentId: IDS.APPT_A2,
        patientId: IDS.PATIENT_A2,
        channel: "line",
        notificationType: "reminder_24h",
        scheduledAt: reminder24h,
        status: reminder24h < new Date() ? "sent" : "pending",
        sentAt: reminder24h < new Date() ? reminder24h : null,
      },
      {
        tenantId: IDS.TENANT_A,
        appointmentId: IDS.APPT_A2,
        patientId: IDS.PATIENT_A2,
        channel: "line",
        notificationType: "reminder_2h",
        scheduledAt: reminder2h,
        status: "pending",
      },
    ],
  });

  console.log("  ✅ A院: confirmation 送信済み + reminder_24h + reminder_2h\n");

  // ────────────────────────────────────────────────────────────
  // 9. システム管理者（SuperAdmin）
  // ────────────────────────────────────────────────────────────
  console.log("🔐 システム管理者作成中...");

  const superAdminEmail    = process.env.SUPER_ADMIN_EMAIL    ?? "admin@chiro-saas.example";
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD ?? "superadmin123";
  const superAdminHash     = await bcrypt.hash(superAdminPassword, 12);

  await prisma.superAdmin.upsert({
    where:  { email: superAdminEmail },
    update: { password: superAdminHash },
    create: { email: superAdminEmail, password: superAdminHash },
  });

  console.log(`  ✅ email=${superAdminEmail}\n`);

  // ────────────────────────────────────────────────────────────
  // 完了サマリー
  // ────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.tenant.count(),
    prisma.tenantSetting.count(),
    prisma.user.count(),
    prisma.superAdmin.count(),
    prisma.profile.count(),
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.karte.count(),
    prisma.exercise.count(),
    prisma.exerciseRecord.count(),
    prisma.notificationQueue.count(),
    prisma.businessHour.count(),
  ]);

  console.log("═══════════════════════════════════════");
  console.log("🎉 シードデータ投入完了！");
  console.log("───────────────────────────────────────");
  console.log(`  tenants             : ${counts[0]}件`);
  console.log(`  tenant_settings     : ${counts[1]}件`);
  console.log(`  users (auth)        : ${counts[2]}件`);
  console.log(`  super_admins        : ${counts[3]}件`);
  console.log(`  profiles            : ${counts[4]}件`);
  console.log(`  patients            : ${counts[5]}件`);
  console.log(`  appointments        : ${counts[6]}件`);
  console.log(`  kartes              : ${counts[7]}件`);
  console.log(`  exercises           : ${counts[8]}件`);
  console.log(`  exercise_records    : ${counts[9]}件`);
  console.log(`  notification_queue  : ${counts[10]}件`);
  console.log(`  business_hours      : ${counts[11]}件`);
  console.log("───────────────────────────────────────");
  console.log("🔑 ログイン情報:");
  console.log("   A院: yamada-admin / password123");
  console.log("   B院: sakura-admin / password123");
  console.log(`   管理者: ${superAdminEmail} / ${superAdminPassword}`);
  console.log("═══════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("❌ シード失敗:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
