import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;
      
      const firstEquals = trimmedLine.indexOf('=');
      if (firstEquals !== -1) {
        const key = trimmedLine.substring(0, firstEquals).trim();
        const val = trimmedLine.substring(firstEquals + 1).trim();
        process.env[key] = val;
      }
    });
  }
}

loadEnv();
