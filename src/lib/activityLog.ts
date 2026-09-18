// src/lib/activityLog.ts
import { getDb } from './firebase-server';
import { doc, setDoc, Timestamp } from 'firebase/firestore/lite';

/**
 * Log an admin or system action related to a booking.
 * adminUser is the UID of the admin performing the action, or null for system actions.
 */
export async function logActivity({ adminUser, action, bookingId }: { adminUser: string | null; action: string; bookingId: string }) {
  const activityId = `${bookingId}_${action.replace(/\s+/g, '_')}_${Date.now()}`;
  const activityRef = doc(getDb(), 'activityLogs', activityId);
  await setDoc(activityRef, {
    timestamp: Timestamp.now(),
    adminUser,
    action,
    bookingId,
  });
}
