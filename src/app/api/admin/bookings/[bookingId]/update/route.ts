export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { toSnakeBooking } from '@/lib/db';

export async function PATCH(request: Request, { params }: { params: { bookingId: string } }) {
  const { bookingId } = params;
  const data = await request.json();

  try {
    const updates = toSnakeBooking(data);
    delete updates.id;
    delete updates.booking_id;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('bookings')
      .update(updates)
      .or(`id.eq.${bookingId},booking_id.eq.${bookingId}`);

    if (error) {
      console.error('Supabase booking update error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Admin booking update error:', e);
    return NextResponse.json({ error: e.message || 'Update failed' }, { status: 500 });
  }
}
