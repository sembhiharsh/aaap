export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchNewBookings, fetchCancellations } from '../../../../viator-email-agent';
import { getDb } from '@/lib/firebase-server';
import { doc, getDoc, setDoc } from 'firebase/firestore/lite';

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runImport() {
  const db = getDb();
  // Rate-limit: check when we last ran
  const stateRef = doc(db, '_system', 'email-worker');
  try {
    const snap = await getDoc(stateRef);
    const lastRun: number = snap.exists() ? (snap.data()?.lastRunAt?.toMillis?.() ?? 0) : 0;
    const now = Date.now();

    // Skip if we ran less than 90 seconds ago
    if (now - lastRun < 90 * 1000) {
      console.log('Email worker: skipping, ran recently');
      return;
    }

    await setDoc(stateRef, { lastRunAt: new Date() }, { merge: true });
  } catch (err) {
    console.warn('Email worker state check note:', err);
  }
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
