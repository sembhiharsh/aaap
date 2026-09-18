// src/lib/firebase-server.ts
// Use this file for all backend (Node.js) operations to avoid gRPC RESOURCE_EXHAUSTED errors on Render.
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const getApp = () => {
  if (getApps().length > 0) return getApps()[0];
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
    console.warn("WARNING: Firebase configuration missing in environment variables. Some backend features may fail.");
  }
  return initializeApp(firebaseConfig);
};

export const getDb = () => getFirestore(getApp());
