import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Viator Admin Dashboard",
  robots: { index: false, follow: false },
  icons: {
    icon: "/ADMIN FAVICON AND APP LOGO.png?v=2",
    shortcut: "/ADMIN FAVICON AND APP LOGO.png?v=2",
    apple: "/ADMIN FAVICON AND APP LOGO.png?v=2",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
