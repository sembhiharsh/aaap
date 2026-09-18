import { initializeApp, getApps } from 'firebase/app';

import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  console.warn("WARNING: Firebase configuration missing in environment variables. Some frontend features may fail.");
}

console.log("[Firebase Config] Project ID:", firebaseConfig.projectId);

import { getFirestore, initializeFirestore } from 'firebase/firestore';

const app = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApps()[0];

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true
  });
} catch (error) {
  firestoreDb = getFirestore(app);
}

let firebaseAuth;
try {
  firebaseAuth = getAuth(app);
} catch (error: any) {
  console.warn("WARNING: Firebase Auth initialization failed (expected during build if config is missing):", error.message);
}

export const db = firestoreDb;
export const auth = firebaseAuth as import('firebase/auth').Auth;
export default app;
