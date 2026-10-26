import type { Metadata } from "next";
import "./typography.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIPPT · 把零散想法变成能讲清楚的演示稿",
  description: "从需求、结构和页面，到修改、检查与交付的 AI 演示工作台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preload" href="/fonts/aippt-misans-regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
