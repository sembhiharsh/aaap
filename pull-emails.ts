require('dotenv').config({ path: '.env.local' });
import { fetchNewBookings } from './viator-email-agent';

fetchNewBookings()
  .then((bookings: any) => {
    console.log("Worker finished successfully! Processed bookings:", bookings.length);
    process.exit(0);
  })
  .catch((err: any) => {
    console.error("Worker failed with error:", err);
    process.exit(1);
  });
