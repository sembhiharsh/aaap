export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchNewBookings, fetchCancellations } from '../../../../viator-email-agent';
import { getAdminDb } from '@/lib/firebase-admin';

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes (Step 7)
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runImport() {
  const db = getAdminDb();
  // Rate-limit: check when we last ran
  const stateRef = db.collection('_system').doc('email-worker');
  const snap = await stateRef.get();
  const lastRun: number = snap.exists ? (snap.data()?.lastRunAt?.toMillis?.() ?? 0) : 0;
  const now = Date.now();

  // Skip if we ran less than 90 seconds ago (Step 7)
  if (now - lastRun < 90 * 1000) {
    console.log('Email worker: skipping, ran recently');
    return;
  }

  await stateRef.set({ lastRunAt: new Date() }, { merge: true });
  await fetchNewBookings();
  await fetchCancellations();
  console.log('Email worker: import complete');
}

export async function GET() {
  // Kick off immediately
  runImport().catch(console.error);

  // Start interval only once per server process
  if (!intervalHandle) {
    intervalHandle = setInterval(() => {
      runImport().catch(console.error);
    }, POLL_INTERVAL_MS);
  }

  return NextResponse.json({ status: 'Email worker running' });
}
