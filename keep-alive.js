// 24/7 Keep-Alive & Auto-Sync Runner for Viator Admin on Render
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

const PORT = process.env.PORT || '10000';
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://bcn-app.onrender.com').replace(/\/$/, '');

console.log('====================================================');
console.log('🚀 Starting Viator Admin Server with Keep-Alive Daemon');
console.log(`🌐 Target Public URL: ${APP_URL}`);
console.log(`🔌 Internal Port: ${PORT}`);
console.log('====================================================');

// Start Next.js server child process
let nextProcess = null;

function startNextServer() {
  console.log('[Server Manager] Spawning Next.js production server...');
  
  nextProcess = spawn('npx', ['next', 'start', '-p', PORT], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT }
  });

  nextProcess.on('error', (err) => {
    console.error('[Server Manager] Failed to start Next.js process:', err);
  });

  nextProcess.on('exit', (code, signal) => {
    console.warn(`[Server Manager] Next.js process exited with code ${code}, signal ${signal}. Restarting in 3s...`);
    setTimeout(startNextServer, 3000);
  });
}

function pingEndpoint(url) {
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    });
  });
}

async function keepAliveCycle() {
  const timestamp = new Date().toISOString();
  
  // 1. External HTTP ping through Render's public router (resets 15-min idle timer)
  const healthRes = await pingEndpoint(`${APP_URL}/api/health`);
  if (healthRes.ok) {
    console.log(`[Keep-Alive ✅ ${timestamp}] External public ping OK (${healthRes.status})`);
  } else {
    console.warn(`[Keep-Alive ⚠️ ${timestamp}] External ping warning:`, healthRes.error || healthRes.status);
  }

  // 2. Email worker sync trigger
  const workerRes = await pingEndpoint(`http://127.0.0.1:${PORT}/api/email-worker`);
  if (workerRes.ok) {
    console.log(`[Keep-Alive 📩 ${timestamp}] Local email worker ping OK`);
  }
}

// Start Next.js
startNextServer();

// Start ping loop after 6 seconds warmup
setTimeout(() => {
  keepAliveCycle();
  // Run every 2 minutes (120,000 ms) so Render never sleeps and emails sync continuously
  setInterval(keepAliveCycle, 2 * 60 * 1000);
}, 6000);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[Keep-Alive] Received SIGTERM. Shutting down gracefully...');
  if (nextProcess) nextProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Keep-Alive] Received SIGINT. Shutting down gracefully...');
  if (nextProcess) nextProcess.kill('SIGINT');
  process.exit(0);
});
