"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Car, KeyRound, AlertCircle, ArrowRight } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { signInAnonymously, setPersistence, browserLocalPersistence } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

type Driver = {
  id: string;
  driverId: string;
  name: string;
  pin: string;
  status: 'Active' | 'Disabled' | 'Deleted';
};

export default function UnifiedPortalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"driver" | "admin">("admin");
  const [driverIdInput, setDriverIdInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const adminToken = localStorage.getItem("easyride_admin_token");
      const driverToken = localStorage.getItem("easyride_driver_token");

      if (adminToken === "authenticated") {
        router.replace("/admin-dashboard");
        return;
      }
      if (driverToken === "authenticated") {
        router.replace("/driver-dashboard");
        return;
      }
    }
    setInitializing(false);
  }, [router]);

  const handleDriverLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const trimmedId = driverIdInput.trim().toUpperCase();
    const trimmedPin = pinInput.trim();

    // Special Master Admin fallback
    if (trimmedId === "ADMIN" && trimmedPin === "ADMIN123") {
      if (typeof window !== "undefined") {
        localStorage.setItem("easyride_driver_token", "authenticated");
      }
      router.push("/driver-dashboard");
      return;
    }

    try {
      const snap = await getDocs(collection(db, "drivers"));
      const searchId = driverIdInput.trim().toLowerCase();
      
      const driverDoc = snap.docs.find(d => {
        const data = d.data();
        return (data.driverId || "").trim().toLowerCase() === searchId || (data.name || "").trim().toLowerCase() === searchId;
      });

      if (!driverDoc) {
        setErrorMsg("Invalid Driver Name/ID or PIN");
        setLoading(false);
        return;
      }

      const driverData = { id: driverDoc.id, ...driverDoc.data() } as Driver;

      if (driverData.status === "Disabled" || driverData.status === "Deleted") {
        setErrorMsg("Driver account is disabled or deleted");
        setLoading(false);
        return;
      }

      if (driverData.pin !== trimmedPin) {
        setErrorMsg("Invalid Driver ID or PIN");
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("easyride_driver_token", "authenticated");
        localStorage.setItem("easyride_driver_info", JSON.stringify(driverData));
      }
      router.push("/driver-dashboard");
    } catch (err: any) {
      console.error("Driver login error:", err);
      setErrorMsg(err.message || "Failed to log in. Check your network connection.");
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    if (adminPassword === "admin123" || adminPassword === "taxisbarcelona24") {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
      } catch (err) {
        console.warn("Firebase auth warning:", err);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("easyride_admin_token", "authenticated");
      }
      router.push("/admin-dashboard");
    } else {
      setErrorMsg("Invalid admin password");
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-[#8B4513] mb-4" />
        <p className="text-gray-500 font-medium">Verifying portal access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-md w-full animate-fade-in">
        {/* Header Logo & Title */}
        <div className="text-center mb-6">
          <img src="/logo.webp?v=easyride" alt="BarcelonasTaxis Logo" className="h-20 object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Admin Dispatch Portal</h1>
          <p className="text-xs text-gray-500 mt-1">Management & Driver System</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#F8F9FA] p-1.5 rounded-xl mb-6 border border-gray-200">
          <button
            type="button"
            onClick={() => { setActiveTab("driver"); setErrorMsg(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === "driver" ? "bg-white text-[#8B4513] shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Car size={18} />
            <span>Driver Portal</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("admin"); setErrorMsg(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === "admin" ? "bg-white text-[#8B4513] shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <ShieldCheck size={18} />
            <span>Admin Access</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold p-3 rounded-lg mb-5 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* DRIVER LOGIN FORM */}
        {activeTab === "driver" && (
          <form onSubmit={handleDriverLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Driver ID</label>
              <input
                type="text"
                placeholder="e.g. DRV001"
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all uppercase"
                value={driverIdInput}
                onChange={e => setDriverIdInput(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">4-Digit PIN</label>
              <input
                type="password"
                placeholder="****"
                maxLength={4}
                pattern="\d{4}"
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all tracking-[0.4em]"
                value={pinInput}
                onChange={e => setPinInput(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#8B4513] text-white rounded-xl font-bold text-[15px] hover:bg-[#8B4513]/90 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>Driver Login</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* ADMIN LOGIN FORM */}
        {activeTab === "admin" && (
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Admin Password</label>
              <input
                type="password"
                placeholder="Enter password"
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#111111] text-white rounded-xl font-bold text-[15px] hover:bg-black transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>Admin Dashboard</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-8 pt-4 border-t border-gray-100 text-center text-xs text-gray-400 font-medium">
          Admin Management System • v2.4
        </div>
      </div>
    </div>
  );
}
