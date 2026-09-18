import './env'; // Must be imported first to set up environment variables
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { getDb } from './src/lib/firebase-server';
import { 
  doc, 
  getDoc, 
  setDoc, 
  Timestamp, 
} from 'firebase/firestore/lite';

// ============================================
// TYPES
// ============================================
interface BookingDetails {
  bookingRef: string;
  customerName: string;
  phone: string;
  email: string;
  experience: string;
  date: string;
  time: string;
  people: string;
  total: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  receivedAt: string;
}

// ============================================
// AUTH CONFIG (IMAP)
// ============================================
const imapConfig = {
  user:     process.env.GMAIL_USER || 'SEMbhiharsh@gmail.com',
  password: process.env.GMAIL_APP_PASSWORD || 'xovg pknz gxyk qpcc',
  host:     'imap.gmail.com',
  port:     993,
  tls:      true,
  tlsOptions: { rejectUnauthorized: false }
};

// ============================================
// EXTRACT BOOKING DETAILS FROM EMAIL (PARSING)
// ============================================
export function parseBookingEmailContent(emailBody: string, receivedAt: string): BookingDetails {
  if (!emailBody || emailBody.trim().length === 0) {
    throw new Error('Email body is empty or invalid.');
  }

  const extractData = (patterns: RegExp[]): string => {
    for (const pattern of patterns) {
      const match = emailBody.match(pattern);
      if (match) return match[1].trim();
    }
    return 'N/A';
  };

  return {
    bookingRef: extractData([
      /Booking (?:reference|ID|#|Ref)[:\s]+([A-Z0-9\-]+)/i,
      /Reference[:\s]+([A-Z0-9\-]+)/i,
    ]),
    customerName: extractData([
      /Lead Traveler Name[:\s]+([A-Za-z \t\u00C0-\u017F\.\-]+)/i,
      /(?:Customer|Guest|Traveler|Lead traveler)(?:\s+Name)?[:\s]+([A-Za-z \t\u00C0-\u017F\.\-]+)/i,
      /Name[:\s]+([A-Za-z \t\u00C0-\u017F\.\-]+)/i,
    ]),
    phone: extractData([
      /Phone[:\s]+.*?(\+?[\d \t\-\(\)]{7,})/i,
      /(?:Phone|Mobile|Tel|Contact number)[:\s]+([\+\d \t\-\(\)]+)/i,
    ]),
    email: extractData([
      /(?:Email|Contact email)[:\s]+([\w\.\-]+@[\w\.\-]+\.\w+)/i,
    ]),
    experience: extractData([
      /Tour Name[:\s]+(.+)/i,
      /(?:Tour|Experience|Activity|Product)(?:\s+Name)?[:\s]+(.+)/i,
    ]),
    date: extractData([
      /Travel Date[:\s]+([\d\/\-\w \t,]+)/i,
      /(?:Tour date|Travel date|Date)[:\s]+([\d\/\-\w \t,]+)/i,
    ]),
    time: extractData([
      /Disembarkation Time[:\s]+([\d\:\sapmAPM]+)/i,
      /Tour Grade Code[:\s]+.+?~(\d{1,2}:\d{2})/i,
      /Tour Grade[:\s]+.+?(\d{1,2}:\d{2})/i,
      /(?:Start time|Departure time|Time)[:\s]+([\d\:\sapmAPM]+)/i,
    ]),
    people: extractData([
      /(?:Guests|Travelers|Participants|Pax|Adults)[:\s]+(\d+)/i,
    ]),
    total: extractData([
      /Net Rate[:\s]+(?:[A-Z]{3}\s+)?([\$€£\d\.,]+)/i,
      /(?:Total|Amount charged|Price)[:\s]+([\$€£\d\.,]+)/i,
    ]),
    pickupLocation: extractData([
      /Hotel Pickup[:\s]+(.+)/i,
      /Pickup Location[:\s]+(.+)/i,
    ]),
    dropoffLocation: extractData([
      /Drop Off Location[:\s]+(.+)/i,
      /Drop-off Location[:\s]+(.+)/i,
    ]),
    receivedAt,
  };
}

// ============================================
// FIREBASE FIRESTORE INTEGRATION
// ============================================

// Clean price string and extract numeric value
function cleanPrice(priceStr: string): number {
  let cleaned = priceStr.replace(/,(\d{2})$/, '.$1');
  cleaned = cleaned.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Clean passengers/people string and extract numeric value
function cleanPassengers(peopleStr: string): number {
  const num = parseInt(peopleStr, 10);
  return isNaN(num) ? 1 : num;
}

async function isViatorBookingAlreadySaved(viatorRef: string): Promise<boolean> {
  const bookingRef = doc(getDb(), 'bookings', viatorRef);
  const docSnap = await getDoc(bookingRef);
  return docSnap.exists();
}

export async function saveBookingToFirestore(booking: BookingDetails): Promise<string | null> {
  if (booking.bookingRef === 'N/A') {
    throw new Error('Cannot save booking with invalid/missing reference ID.');
  }

  const alreadySaved = await isViatorBookingAlreadySaved(booking.bookingRef);
  if (alreadySaved) {
    console.log(`ℹ️ Viator booking ${booking.bookingRef} is already in the database. Skipping save.`);
    return null;
  }

  const bookingId = booking.bookingRef;
  const bookingRef = doc(getDb(), 'bookings', bookingId);
  const now = Timestamp.now();

  const priceNum = cleanPrice(booking.total);
  const passengersNum = cleanPassengers(booking.people);
  const timeVal = booking.time === 'N/A' ? '00:00' : booking.time;

  const bookingData = {
    bookingId,
    source: 'viator',
    viatorBookingRef: booking.bookingRef,
    customerName: booking.customerName,
    email: booking.email,
    phone: booking.phone,
    pickup: booking.pickupLocation && booking.pickupLocation !== 'N/A' ? booking.pickupLocation : booking.experience,
    dropoff: booking.dropoffLocation && booking.dropoffLocation !== 'N/A' ? booking.dropoffLocation : (booking.pickupLocation && booking.pickupLocation !== 'N/A' ? 'Not Specified' : booking.experience),
    date: booking.date,
    time: timeVal,
    price: priceNum,
    passengers: passengersNum,
    luggage: 0,
    paymentStatus: 'PAID', // Viator bookings are pre-paid
    status: 'NEW',
    customerNotes: `Viator Booking Reference: ${booking.bookingRef}`,
    internalNotes: `Automatically imported from Gmail. Viator Ref: ${booking.bookingRef}. Received at: ${booking.receivedAt}`,
    createdAt: now,
  };

  await setDoc(bookingRef, bookingData);

  const activityRef = doc(getDb(), 'activityLogs', `${bookingId}_created_${Date.now()}`);
  await setDoc(activityRef, {
    timestamp: now,
    adminUser: null,
    action: 'Booking Created (Viator Import)',
    bookingId,
  });

  return bookingId;
}

// ============================================
// IMAP EMAIL FETCHING
// ============================================
async function fetchUnprocessedBookingEmails(): Promise<(BookingDetails & { dbId?: string })[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    const successfullyProcessedBookings: (BookingDetails & { dbId?: string })[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err: any, box: any) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        // Fetch ALL emails from Viator (both read and unread)
        imap.search([['FROM', 'booking@t1.viator.com']], (searchErr: any, results: number[]) => {
          if (searchErr) {
            imap.end();
            return reject(searchErr);
          }
          if (!results || results.length === 0) {
            imap.end();
            return resolve([]);
          }

          const f = imap.fetch(results, { bodies: '', markSeen: true });
          const emailPromises: Promise<void>[] = [];

          f.on('message', (msg: any, seqno: number) => {
            emailPromises.push(new Promise((resolveMsg) => {
              msg.on('body', (stream: any) => {
                simpleParser(stream, async (err: any, parsed: any) => {
                  if (err) return resolveMsg();
                  try {
                    const emailBody = parsed.text || '';
                    const receivedAt = parsed.date ? parsed.date.toLocaleString() : new Date().toLocaleString();
                    const extractedBooking = parseBookingEmailContent(emailBody, receivedAt);
                    
                    if (extractedBooking.bookingRef !== 'N/A') {
                      const dbId = await saveBookingToFirestore(extractedBooking);
                      successfullyProcessedBookings.push({
                        ...extractedBooking,
                        dbId: dbId || undefined
                      });
                    }
                  } catch (e) {
                    console.error("Error processing an email", e);
                  }
                  resolveMsg();
                });
              });
            }));
          });

          f.once('error', (err: any) => {
            imap.end();
            reject(err);
          });
          f.once('end', async () => {
            await Promise.all(emailPromises);
            imap.end();
            resolve(successfullyProcessedBookings);
          });
        });
      });
    });

    imap.once('error', (err: any) => reject(err));
    imap.connect();
  });
}

// ============================================
// DISPLAY BOOKINGS
// ============================================
async function showDashboard() {
  console.log('\n🟠 VIATOR BOOKINGS DASHBOARD (PRODUCTION + FIRESTORE)');
  console.log('========================================================\n');

  try {
    const newBookings = await fetchUnprocessedBookingEmails();

    if (newBookings.length === 0) {
      console.log('No new unprocessed bookings found. Waiting for next cycle...');
      return;
    }

    newBookings.forEach((booking, index) => {
      console.log(`📋 NEW BOOKING #${index + 1} (Processed & Saved to Firestore)`);
      console.log(`   Ref:       ${booking.bookingRef}`);
      if (booking.dbId) {
        console.log(`   DB ID:     ${booking.dbId} (Firestore)`);
      } else {
        console.log(`   DB ID:     Already existed / Skipped save`);
      }
      console.log(`   Customer:  ${booking.customerName}`);
      console.log(`   Phone:     ${booking.phone}`);
      console.log(`   Email:     ${booking.email}`);
      console.log(`   Tour:      ${booking.experience}`);
      console.log(`   Date:      ${booking.date}`);
      console.log(`   Time:      ${booking.time}`);
      console.log(`   People:    ${booking.people}`);
      console.log(`   Total:     ${booking.total}`);
      console.log(`   Received:  ${booking.receivedAt}`);
      console.log('--------------------------------------------------------\n');
    });
  } catch (criticalError) {
    console.error('🚨 CRITICAL ERROR in Dashboard cycle:', criticalError);
  }
}

// ============================================
// AUTO REFRESH EVERY 15 SECONDS
// ============================================
async function start() {
  await showDashboard();
  setInterval(showDashboard, 15 * 1000);
}
start().catch((err) => {
  console.error("🚨 Fatal error in startup:", err);
});
