import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalScout TV",
  description: "选好频道，自动连接。直播频道搜索、收藏与本机自动换源。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
