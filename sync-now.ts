import './env';
import { fetchNewBookings } from './viator-email-agent';

async function main() {
  console.log('🔄 Starting Viator bookings synchronization for alisoban1990@gmail.com...');
  try {
    const bookings = await fetchNewBookings();
    console.log(`✅ Sync completed successfully! Found and processed ${bookings.length} new bookings.`);
  } catch (error: any) {
    console.error('❌ Sync error:', error.message);
  }
  process.exit(0);
}

main();
