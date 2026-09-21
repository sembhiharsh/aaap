"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AdminPortalPage() {
  const router = useRouter();

  useEffect(() => {
    // Directly go to admin dashboard with zero passcode required
    if (typeof window !== "undefined") {
      localStorage.setItem("easyride_admin_token", "authenticated");
    }
    router.replace("/admin-dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-100">
      <Loader2 className="w-10 h-10 animate-spin text-amber-500 mb-4" />
      <p className="text-slate-400 font-medium text-sm">Opening Viator Admin Dashboard...</p>
    </div>
  );
}
