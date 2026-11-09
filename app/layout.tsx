import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/lib/data";
import BottomNav from "@/components/BottomNav";
import SwRegister from "@/components/SwRegister";

const thai = Noto_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-thai", display: "swap" });

export const metadata: Metadata = {
  title: "Skiinx",
  description: "ตารางสกินแคร์ส่วนตัว — วันนี้ต้องทาอะไร ทาตามลำดับไหน",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Skiinx", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#fdf7f9", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body className="min-h-dvh antialiased">
        <DataProvider>
          <main className="mx-auto max-w-md px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-32">{children}</main>
          <BottomNav />
        </DataProvider>
        <SwRegister />
      </body>
    </html>
  );
}
