"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, KeyRound, AlertCircle, ArrowRight } from "lucide-react";
export default function AdminPortalPage() {
  const router = useRouter();
  const [adminPassword, setAdminPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const adminToken = localStorage.getItem("easyride_admin_token");
      if (adminToken === "authenticated") {
        router.replace("/admin-dashboard");
        return;
      }
    }
    setInitializing(false);
  }, [router]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    if (adminPassword === "admin123" || adminPassword === "taxisbarcelona24" || adminPassword === "admin") {
      if (typeof window !== "undefined") {
        localStorage.setItem("easyride_admin_token", "authenticated");
      }
      router.push("/admin-dashboard");
    } else {
      setErrorMsg("Invalid admin password. Please try again.");
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-100">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500 mb-4" />
        <p className="text-slate-400 font-medium text-sm">Verifying Admin Access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
      <div className="bg-slate-900/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-800 max-w-md w-full animate-fade-in text-slate-100">
        {/* Header Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 p-2 shadow-inner">
            <img
              src="/ADMIN FAVICON AND APP LOGO.png"
              alt="Admin Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Viator Admin Portal</h1>
          <p className="text-slate-400 text-xs mt-1.5">Booking Manager & Email Synchronization</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-400 font-semibold animate-shake">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Master Admin Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3 text-slate-500" size={18} />
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter password (e.g. admin123)"
                className="w-full pl-11 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 py-3.5 rounded-xl text-sm font-black shadow-lg shadow-amber-500/20 transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Access Admin Dashboard</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-5 border-t border-slate-800/80 text-center flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} className="text-amber-500/70" />
          <span>Standalone Viator Email Sync Dispatcher • v2.4</span>
        </div>
      </div>
    </div>
  );
}
