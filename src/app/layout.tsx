import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default:  "SyncotBase",
    template: "%s | SyncotBase",
  },
  description: "LINE連携・予約管理システム SyncotBase — 整骨院向けマルチテナント型予約・顧客管理SaaS",
  applicationName: "SyncotBase",
  keywords: ["整骨院", "予約管理", "LINE連携", "カルテ", "SyncotBase"],
  authors: [{ name: "SyncotBase" }],
  robots: { index: false, follow: false }, // 管理システムなので検索エンジンには非公開
  icons: {
    icon:  [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
