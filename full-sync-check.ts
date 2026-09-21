import 'dotenv/config';
import { fetchNewBookings } from './viator-email-agent';
import { supabaseAdmin } from './src/lib/supabase-admin';

async function main() {
  console.log('🔄 Triggering full Viator sync from alisoban1990@gmail.com...');
  const newBookings = await fetchNewBookings();
  console.log(`✅ Sync finished. ${newBookings.length} new/processed in this pass.`);

  // Query ALL bookings from Supabase
  const { data: bookings, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching bookings from Supabase:', error.message);
    return;
  }

  console.log('\n======================================================');
  console.log(`📊 TOTAL BOOKINGS IN DATABASE: ${bookings.length}`);
  console.log('======================================================\n');

  bookings.forEach((b, index) => {
    console.log(`[#${index + 1}] ID: ${b.booking_id}`);
    console.log(`     Customer: ${b.customer_name} | Phone: ${b.phone || 'N/A'} | Email: ${b.email || 'N/A'}`);
    console.log(`     Date & Time: ${b.date} at ${b.time}`);
    console.log(`     Route: ${b.pickup}  -->  ${b.dropoff}`);
    console.log(`     Vehicle: ${b.vehicle} | Pax: ${b.passengers} | Luggage: ${b.luggage} | Price: €${b.price}`);
    console.log(`     Status: ${b.status} | Payment: ${b.payment_status} | Source: ${b.source}`);
    if (b.flight || b.flight_number || b.airline) {
      console.log(`     Flight: ${b.airline || ''} ${b.flight || b.flight_number || ''} (Arrival: ${b.flight_arrival_time || 'N/A'}, Departure: ${b.flight_departure_time || 'N/A'})`);
    }
    if (b.cruise_ship) {
      console.log(`     Cruise: ${b.cruise_ship} (Disembark: ${b.disembark_time || 'N/A'})`);
    }
    if (b.customer_notes) {
      console.log(`     Notes: ${b.customer_notes}`);
    }
    console.log('------------------------------------------------------');
  });
}

main().catch(console.error);
