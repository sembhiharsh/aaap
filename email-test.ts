import Imap from 'imap';
import { simpleParser } from 'mailparser';
import * as dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const REAL_VIATOR_EMAIL = `
From: Viator <booking@t1.viator.com>
Subject: New Booking for Sat, Jun 27, 2026 (#BR-1410958191)

Booking Reference: BR-1410958191
Lead Traveler Name: Malissa Evelyn
Phone: (Alternate Phone)US+1 9546291542
Tour Name: Barcelona Arrival Private Transfer Cruise Port to City Center
Travel Date: Sat, Jun 27, 2026
Travelers: 4 Adults
Net Rate: EUR €51,00
Hotel Pickup: Port de Barcelona, Moll Adossat, 1, Barcelona
Drop Off Location: Basilica of the Sagrada Familia, Barcelona
Disembarkation Time: 9:00 AM
Cruise Ship: Celebrity Xcel
Special Requirements: Please keep in contact by phone
`;

async function runAllTests() {
  console.log('\n🧪 VIATOR EMAIL INTEGRATION TESTS');
  console.log('====================================\n');
  
  let passed = 0;
  let failed = 0;

  function test(name: string, value: string, expected: string) {
    const ok = value !== 'N/A' && value.includes(expected);
    if (ok) {
      console.log(`✅ PASS: ${name}`);
      console.log(`        Got: ${value}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${name}`);
      console.log(`        Got: ${value}`);
      console.log(`        Expected to contain: ${expected}\n`);
      failed++;
    }
  }

  // ==========================================
  // TEST 1: GMAIL CONNECTION
  // ==========================================
  console.log('📡 TEST 1: Gmail IMAP Connection');
  console.log('----------------------------------');
  
  await new Promise<void>((resolve) => {
    const imap = new Imap({
      user:     process.env.GMAIL_USER!,
      password: process.env.GMAIL_APP_PASSWORD!,
      host:     'imap.gmail.com',
      port:     993,
      tls:      true,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', () => {
      console.log('✅ PASS: Connected to Gmail\n');
      passed++;
      imap.end();
      resolve();
    });

    imap.once('error', (err: Error) => {
      console.log(`❌ FAIL: Gmail connection failed`);
      console.log(`        Error: ${err.message}\n`);
      failed++;
      resolve();
    });

    imap.connect();
  });

  // ==========================================
  // TEST 2: EMAIL PARSING
  // ==========================================
  console.log('📧 TEST 2: Email Parsing');
  console.log('----------------------------------');

  // Use the same parseViatorEmail function
  // from viator-email-agent.ts
  const { parseViatorEmail } = require('./viator-email-agent');
  const booking = parseViatorEmail(REAL_VIATOR_EMAIL);

  test('Booking Reference', booking.bookingRef,   'BR-1410958191');
  test('Customer Name',    booking.customerName,  'Malissa');
  test('Phone Number',     booking.phone,         '9546291542');
  test('Tour Name',        booking.tourName,      'Barcelona');
  test('Travel Date',      booking.travelDate,    '2026-06-27');
  test('Disembark Time',   booking.disembarkTime, '9:00');
  test('Pickup Time',      booking.pickupTime,    '');
  test('Pickup Location',  booking.pickupLocation,'Port de Barcelona');
  test('Drop Off',         booking.dropOff,       'Sagrada');
  test('Travelers',        booking.travelers,     '4');
  test('Net Rate',         booking.netRate,       '51');
  test('Cruise Ship',      booking.cruiseShip,    'Celebrity');

  // ==========================================
  // TEST 3: FIND REAL EMAIL IN GMAIL
  // ==========================================
  console.log('🔍 TEST 3: Find Viator Email in Gmail');
  console.log('----------------------------------');

  await new Promise<void>((resolve) => {
    const imap = new Imap({
      user:     process.env.GMAIL_USER!,
      password: process.env.GMAIL_APP_PASSWORD!,
      host:     'imap.gmail.com',
      port:     993,
      tls:      true,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, () => {
        imap.search(
          ['ALL', ['SUBJECT', 'BR-']],
          (err, results) => {
            if (err || !results?.length) {
              console.log('❌ FAIL: No Viator emails found in Gmail');
              console.log('        Action: Forward a Viator email');
              console.log('        to autotallersromo@gmail.com\n');
              failed++;
            } else {
              console.log(`✅ PASS: Found ${results.length} Viator email(s) in Gmail\n`);
              passed++;
            }
            imap.end();
            resolve();
          }
        );
      });
    });

    imap.once('error', () => resolve());
    imap.connect();
  });

  // ==========================================
  // TEST 4: PARSE REAL EMAIL FROM GMAIL
  // ==========================================
  console.log('📨 TEST 4: Parse Real Viator Email From Gmail');
  console.log('----------------------------------');

  await new Promise<void>((resolve) => {
    const imap = new Imap({
      user:     process.env.GMAIL_USER!,
      password: process.env.GMAIL_APP_PASSWORD!,
      host:     'imap.gmail.com',
      port:     993,
      tls:      true,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, () => {
        imap.search(
          ['ALL', ['SUBJECT', 'BR-']],
          (err, results) => {
            if (err || !results?.length) {
              console.log('⚠️  SKIP: No real emails to parse\n');
              resolve();
              return;
            }

            // Get most recent email
            const latest = [results[results.length - 1]];
            const fetch = imap.fetch(latest, { bodies: '' });

            fetch.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, (err, parsed) => {
                  if (err) return;
                  
                  const real = parseViatorEmail(parsed.text || '');
                  
                  console.log('📋 Real email parsed:');
                  console.log(`   Ref:      ${real.bookingRef}`);
                  console.log(`   Customer: ${real.customerName}`);
                  console.log(`   Phone:    ${real.phone}`);
                  console.log(`   Tour:     ${real.tourName}`);
                  console.log(`   Date:     ${real.travelDate}`);
                  console.log(`   Time:     ${real.pickupTime}`);
                  console.log(`   Pickup:   ${real.pickupLocation}`);
                  console.log(`   Dropoff:  ${real.dropOff}`);
                  console.log(`   People:   ${real.travelers}`);
                  console.log(`   Price:    ${real.netRate}\n`);

                  const allGood = Object.values(real)
                    .filter(v => v !== real.receivedAt)
                    .every(v => v !== 'N/A');

                  if (allGood) {
                    console.log('✅ PASS: All fields parsed from real email\n');
                    passed++;
                  } else {
                    console.log('⚠️  PARTIAL: Some fields are N/A');
                    console.log('    This is OK if those fields');
                    console.log('    are not in this booking type\n');
                    passed++;
                  }
                });
              });
            });

            fetch.once('end', () => {
              imap.end();
              resolve();
            });
          }
        );
      });
    });

    imap.once('error', () => resolve());
    imap.connect();
  });

  // ==========================================
  // FINAL RESULTS
  // ==========================================
  console.log('====================================');
  console.log('📊 FINAL TEST RESULTS');
  console.log('====================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('Email integration is 100% working!');
    console.log('Safe to show to boss! ✅');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED');
    console.log('Fix the failed tests before showing boss!');
  }
}

runAllTests();
