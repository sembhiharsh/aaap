export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

let selfPingStarted = false;

function startSelfPing() {
  if (selfPingStarted) return;
  selfPingStarted = true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://bcn-app.onrender.com';

  console.log(`[Keep-Alive] Initializing 24/7 self-ping loop for: ${appUrl}`);

  // Ping every 2.5 minutes (150s) so Render free tier never reaches the 15-min idle timeout
  setInterval(async () => {
    try {
      const pingUrl = `${appUrl.replace(/\/$/, '')}/api/health`;
      const res = await fetch(pingUrl, { cache: 'no-store' });
      console.log(`[Keep-Alive] Heartbeat ping status: ${res.status} at ${new Date().toISOString()}`);
    } catch (err: any) {
      console.warn('[Keep-Alive] Heartbeat ping error:', err?.message || err);
    }
  }, 150 * 1000);
}

export async function GET() {
  startSelfPing();

  return NextResponse.json({
    status: 'online',
    healthy: true,
    service: 'Viator Admin Portal',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: new Date().toLocaleString(),
  });
}

