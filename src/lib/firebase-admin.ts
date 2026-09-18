import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import * as fs from 'fs';
import * as path from 'path';

let initialized = false;

export function initializeFirebaseAdmin() {
  if (initialized || getApps().length > 0) {
    return;
  }
  initialized = true;
  try {
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    const individualProjectId = process.env.FIREBASE_PROJECT_ID;
    const individualClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const individualPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    if (serviceAccountBase64) {
      const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'));
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('[Firebase Admin] Initialized with Service Account from Base64 env');
    } else if (individualProjectId && individualClientEmail && individualPrivateKey) {
      initializeApp({
        credential: cert({
          projectId: individualProjectId,
          clientEmail: individualClientEmail,
          privateKey: individualPrivateKey.replace(/\\n/g, '\n'),
        })
      });
      console.log('[Firebase Admin] Initialized with individual Service Account env variables');
    } else {
      // Look for the local JSON service account key
      const possiblePaths = [
        path.resolve(process.cwd(), '../easyride-8978d-firebase-adminsdk-fbsvc-420a1db277.json'),
        path.resolve(process.cwd(), 'easyride-8978d-firebase-adminsdk-fbsvc-420a1db277.json'),
        path.resolve(__dirname, '../../easyride-8978d-firebase-adminsdk-fbsvc-420a1db277.json'),
        path.resolve(__dirname, '../../../easyride-8978d-firebase-adminsdk-fbsvc-420a1db277.json'),
      ];
      
      let initialized = false;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          try {
            const serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
            initializeApp({
              credential: cert(serviceAccount)
            });
            console.log(`[Firebase Admin] Initialized using key file: ${p}`);
            initialized = true;
            break;
          } catch (e) {
            console.warn(`[Firebase Admin] Failed to parse key file at ${p}:`, e);
          }
        }
      }

      if (!initialized) {
        console.warn('[Firebase Admin] Missing service account env variables and local key files! Falling back to application default credentials.');
        initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        });
      }
    }
    // CRITICAL FIX: Bypass gRPC and force REST to prevent RESOURCE_EXHAUSTED / HTML parsing errors
    try {
      getFirestore().settings({ preferRest: true });
      console.log('[Firebase Admin] Firestore settings applied: preferRest=true');
    } catch (settingsError) {
      console.warn('[Firebase Admin] Failed to apply Firestore settings (already initialized):', settingsError);
    }
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization error:', error.stack);
  }
}

export const getAdminDb = () => {
  initializeFirebaseAdmin();
  return getFirestore();
};
