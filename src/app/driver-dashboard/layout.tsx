import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BCN Drivers Portal",
  description: "BCN Drivers Mobile Portal",
  manifest: "/driver-manifest.json?v=28",
  appleWebApp: {
    capable: true,
    title: "BCN Drivers",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/driver-icon.png?v=28",
    shortcut: "/driver-icon.png?v=28",
    apple: "/driver-icon.png?v=28",
  },
};

export default function DriverDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
