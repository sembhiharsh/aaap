import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { EmailWorkerStarter } from "@/components/EmailWorkerStarter";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Admin Portal | Dispatch Management",
  description: "Management portal and dispatch system",
  robots: { index: false, follow: false },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  themeColor: "#0f172a",
  icons: {
    icon: "/ADMIN FAVICON AND APP LOGO.png",
    shortcut: "/ADMIN FAVICON AND APP LOGO.png",
    apple: "/ADMIN FAVICON AND APP LOGO.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased font-sans">
        <EmailWorkerStarter />
        {children}
      </body>
    </html>
  );
}
