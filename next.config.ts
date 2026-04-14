import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // ngrok 等の外部ドメイン経由でアクセスする際に /_next 開発リソースをブロックしない
  // Next.js 16 のクロスオリジンセキュリティ制限への対応
  // 注意: ngrok 使用時は `ngrok http --host-header=rewrite 3000` を推奨
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok.io",
  ],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
