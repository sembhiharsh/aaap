import 'dotenv/config';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { parseViatorBookingEmail, ViatorBooking } from './viator-parser-v2';
import { supabaseAdmin } from './src/lib/supabase-admin';

async function auditBookings() {
  console.log('--- STARTING COMPREHENSIVE BOOKINGS AUDIT ---');
  
  // 1. Fetch all bookings currently in Supabase
  const { data: dbBookings, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('Error querying Supabase:', error.message);
    return;
  }

  console.log(`Current bookings in Supabase database: ${dbBookings.length}`);

  // 2. Connect to Gmail IMAP and scan ALL messages
  const user = process.env.GMAIL_USER || 'alisoban1990@gmail.com';
  const password = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  console.log(`Connecting to IMAP for ${user}...`);

  const imap = new Imap({
    user,
    password,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 30000,
  });

  const parsedFromEmail: ViatorBooking[] = [];

  await new Promise<void>((resolve, reject) => {
    imap.once('ready', () => {
      console.log('IMAP connected. Opening INBOX...');
      imap.openBox('INBOX', false, (err, box) => {
        if (err) return reject(err);

        console.log(`Total messages in mailbox: ${box.messages.total}`);
        if (box.messages.total === 0) {
          imap.end();
          return resolve();
        }

        // Search for ALL messages
        imap.search(['ALL'], (searchErr, results) => {
          if (searchErr) return reject(searchErr);
          console.log(`Found ${results.length} total messages in mailbox.`);
          if (!results.length) {
            imap.end();
            return resolve();
          }

          const fetcher = imap.fetch(results, { bodies: '' });
          let pending = results.length;

          fetcher.on('message', (msg, seqno) => {
            let buffer = '';
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
            });
            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                const subject = parsed.subject || '';
                const body = (parsed.text || '') + '\n' + (parsed.html || '');

                if (
                  subject.includes('BR-') ||
                  subject.includes('Viator') ||
                  subject.includes('Booking') ||
                  body.includes('BR-') ||
                  body.includes('viator')
                ) {
                  const booking = parseViatorBookingEmail({
                    subject,
                    text: parsed.text || '',
                    html: parsed.html || '',
                    date: parsed.date,
                  });

                  if (booking && booking.bookingId) {
                    parsedFromEmail.push(booking);
                  }
                }
              } catch (e) {
                console.error(`Error parsing message #${seqno}:`, e);
              } finally {
                pending--;
                if (pending === 0) {
                  imap.end();
                  resolve();
                }
              }
            });
          });

          fetcher.once('error', (fErr) => {
            console.error('Fetch error:', fErr);
            reject(fErr);
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error('IMAP error:', err);
      reject(err);
    });

    imap.connect();
  });

  console.log(`\nParsed ${parsedFromEmail.length} total Viator bookings from mailbox.`);

  // 3. Compare and upsert missing bookings
  const existingIds = new Set(dbBookings.map(b => b.booking_id));
  let insertedCount = 0;
  let updatedCount = 0;

  for (const b of parsedFromEmail) {
    const bookingRefId = b.bookingId;
    const isNew = !existingIds.has(bookingRefId);

    const record = {
      booking_id: bookingRefId,
      customer_name: b.customerName || 'Lead Traveler',
      email: b.customerEmail || '',
      phone: b.customerPhone || '',
      pickup: b.pickupLocation || 'Not Specified',
      dropoff: b.dropoffLocation || 'Not Specified',
      date: b.date || '',
      time: b.time || '',
      vehicle: b.vehicle || 'economy',
      passengers: b.passengers || 1,
      luggage: b.luggage || 0,
      price: b.price != null ? Number(b.price) : 0,
      payment_status: 'PAID',
      status: b.isCancelled ? 'cancelled' : 'confirmed',
      customer_notes: b.notes || '',
      airline: b.airline || '',
      flight: b.flightNumber || '',
      flight_number: b.flightNumber || '',
      flight_arrival_time: b.flightArrivalTime || '',
      flight_departure_time: b.flightDepartureTime || '',
      cruise_ship: b.cruiseShip || '',
      disembark_time: b.disembarkTime || '',
      pickup_time_source: b.pickupTimeSource || 'default',
      pickup_time_confidence: b.pickupTimeConfidence || 'high',
      source: 'viator-email',
      parser_version: '2.0.0',
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabaseAdmin
      .from('bookings')
      .upsert(record, { onConflict: 'booking_id' });

    if (upsertErr) {
      console.error(`Error saving ${bookingRefId}:`, upsertErr.message);
    } else {
      if (isNew) {
        insertedCount++;
        console.log(`[NEW INSERT] ${bookingRefId} - ${b.customerName} - ${b.date} ${b.time}`);
      } else {
        updatedCount++;
      }
    }
  }

  // 4. Final verify count from database
  const { data: finalBookings } = await supabaseAdmin
    .from('bookings')
    .select('booking_id, customer_name, date, time, pickup, dropoff, price, status, source')
    .order('date', { ascending: false });

  console.log('\n================ AUDIT SUMMARY ================');
  console.log(`Total Bookings in Supabase Database: ${(finalBookings || []).length}`);
  console.log(`New Inserted: ${insertedCount}`);
  console.log(`Updated / Verified: ${updatedCount}`);
  console.log('================================================\n');

  console.log('--- ALL BOOKINGS IN DATABASE ---');
  (finalBookings || []).forEach((b, idx) => {
    console.log(`${idx + 1}. [${b.booking_id}] | ${b.date} ${b.time} | ${b.customer_name} | €${b.price} | Status: ${b.status} | From: ${b.pickup} -> To: ${b.dropoff}`);
  });
}

auditBookings().catch(console.error);
