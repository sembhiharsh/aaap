import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function DELETE(
  request: Request,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { bookingId } = params;
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing booking ID' }, { status: 400 });
    }

    const db = getAdminDb();
    const bookingRef = db.collection('bookings').doc(bookingId);
    
    // Check if the booking exists
    const snap = await bookingRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Permanently delete
    await bookingRef.delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error permanently deleting booking:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
