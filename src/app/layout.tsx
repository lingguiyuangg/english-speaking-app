import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WordBankProvider } from '@/context/WordBankContext';
import { NavBar } from '@/components/layout/NavBar';

export const metadata: Metadata = {
  title: "英语口语练习",
  description: "AI 剧本角色扮演 + 生词复习",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50">
        <WordBankProvider>
          <main className="max-w-lg mx-auto px-4 pb-20 pt-4 min-h-screen">
            {children}
          </main>
          <NavBar />
        </WordBankProvider>
      </body>
    </html>
  );
}
