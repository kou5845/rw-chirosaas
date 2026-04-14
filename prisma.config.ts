import { defineConfig } from "prisma/config";
import path from "path";
import * as dotenv from "dotenv";

// Prisma CLI は Next.js の .env.local を自動で読まないため、明示的にロードする
dotenv.config({ path: path.join(__dirname, ".env.local") });

// .env.local の DIRECT_URL がプール経由 (pooler.supabase.com) の場合でも、
// NEXT_PUBLIC_SUPABASE_URL からプロジェクトrefを抽出してダイレクト接続URLを構築する。
// prisma db push / migrate にはダイレクト接続 (db.*.supabase.co:5432) が必要。
function buildDirectUrl(): string {
  const directUrl = process.env.DIRECT_URL ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  // すでにダイレクト接続形式 (db.*.supabase.co) ならそのまま使う
  if (directUrl.includes("db.") && directUrl.includes(".supabase.co")) {
    return directUrl;
  }

  // プール形式の場合: project ref と password を抽出してダイレクトURLを再構築する
  const ref = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = directUrl.match(/:\/\/[^:]+:([^@]+)@/)?.[1];

  if (!ref || !password) {
    throw new Error(
      "DIRECT_URL または NEXT_PUBLIC_SUPABASE_URL が正しく設定されていません。"
    );
  }

  return `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`;
}

const directUrl = buildDirectUrl();

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore earlyAccess は Prisma 7 のランタイムに必要だが型定義未反映
  earlyAccess: true,
  schema: path.join(__dirname, "prisma/schema.prisma"),
  datasource: {
    url: directUrl,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import("@prisma/adapter-pg");
      return new PrismaPg({ connectionString: directUrl });
    },
  },
});
