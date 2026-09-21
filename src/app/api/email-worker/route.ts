export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { fetchNewBookings, fetchCancellations } from '../../../../viator-email-agent';

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastRunTime = 0;

async function runImport() {
  const now = Date.now();
  // Skip if we ran less than 90 seconds ago
  if (now - lastRunTime < 90 * 1000) {
    console.log('Email worker: skipping, ran recently');
    return;
  }
  lastRunTime = now;

  try {
    await fetchNewBookings();
    await fetchCancellations();
    console.log('Email worker: import complete');
  } catch (err) {
    console.error('Email worker run error:', err);
  }
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
