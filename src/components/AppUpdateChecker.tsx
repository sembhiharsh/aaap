'use client';
import { useEffect, useState } from 'react';

export default function AppUpdateChecker({ trigger }: { trigger?: number }) {
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);
  const currentVersion = "1.0.1"; // Local app version

  useEffect(() => {
    // Only run this inside a capacitor/mobile context if preferred, 
    // but here we just check for demo purposes.
    const checkVersion = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();
          if (data.version && data.version !== currentVersion) {
            // Very simple semantic version comparison could be added,
            // but strict inequality works for a basic check
            setUpdateUrl(data.apkUrl);
          }
        }
      } catch (err) {
        console.error("Failed to check app version", err);
      }
    };
    checkVersion();
  }, []);

  if (!updateUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center animate-fade-in-up">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
        <h2 className="text-xl font-black text-gray-800 mb-2">Update Available</h2>
        <p className="text-gray-500 text-sm mb-6">A new version of the app is available. Please update to get the latest features and bug fixes.</p>
        <div className="flex flex-col gap-3">
          <a
            href={updateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#1A56DB] hover:bg-[#1546b3] text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95"
          >
            Update Now
          </a>
          <button
            onClick={() => setUpdateUrl(null)}
            className="w-full text-gray-500 hover:text-gray-700 font-bold py-3 rounded-xl transition-all active:scale-95"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
