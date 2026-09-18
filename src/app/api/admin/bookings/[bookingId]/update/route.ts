export const dynamic = 'force-dynamic';
// src/app/api/admin/bookings/[bookingId]/update/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { doc, updateDoc, getDoc } from 'firebase/firestore/lite';
import { logActivity } from '@/lib/activityLog';

export async function PATCH(request: Request, { params }: { params: { bookingId: string } }) {
  const { bookingId } = params;
  const data = await request.json();
  const { status, driver, adminUid } = data; // adminUid from client auth token or passed explicitly

  if (!adminUid) {
    return NextResponse.json({ error: 'adminUid required' }, { status: 400 });
  }

  try {
    const bookingRef = doc(getDb(), 'bookings', bookingId);
    const snap = await getDoc(bookingRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (driver !== undefined) updates.driver = driver;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    await updateDoc(bookingRef, updates);
    // Log activity
    const action = status ? `Booking status changed to ${status}` : '';
    const driverAction = driver !== undefined ? `Driver assigned: ${driver || 'unassigned'}` : '';
    const combinedAction = [action, driverAction].filter(Boolean).join(' | ');
    await logActivity({ adminUser: adminUid, action: combinedAction || 'Booking Updated', bookingId });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Admin booking update error:', e);
    return NextResponse.json({ error: e.message || 'Update failed' }, { status: 500 });
  }
}
