import './env'; // Must be imported first to load environment variables
import * as crypto from 'crypto';
import { db } from './src/lib/firebase';
import { 
  doc, 
  runTransaction, 
  setDoc, 
  Timestamp, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';

// ============================================
// CONFIG
// ============================================
const BOKUN_ACCESS_KEY = process.env.BOKUN_ACCESS_KEY!;
const BOKUN_SECRET_KEY = process.env.BOKUN_SECRET_KEY!;
const BOKUN_API_URL    = process.env.BOKUN_API_URL || 'https://api.bokun.io';

if (!BOKUN_ACCESS_KEY || !BOKUN_SECRET_KEY) {
  console.warn("⚠️ Warning: BOKUN_ACCESS_KEY or BOKUN_SECRET_KEY is not set in environment variables.");
}

// ============================================
// TYPES
// ============================================
interface Customer {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
}

interface Booking {
  id:           number;
  status:       string;
  startDate:    string;
  startTime:    string;
  productTitle: string;
  totalPaid:    number;
  currency:     string;
  participants: number;
  customer:     Customer;
  channel:      string;
  createdDate:  string;
}

// ============================================
// BOKUN AUTH SIGNATURE & HEADERS
// ============================================
function generateSignature(
  date: string,
  accessKey: string,
  secretKey: string,
  method: string,
  path: string
): string {
  const message = date + accessKey + method.toUpperCase() + path;
  return crypto
    .createHmac('sha1', secretKey) // Bokun API uses HMAC-SHA1
    .update(message)
    .digest('base64');
}

function getBokunDateFormat(date: Date): string {
  const pad = (num: number) => String(num).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const MM = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const HH = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`; // Format: yyyy-MM-dd HH:mm:ss
}

function getHeaders(method: string, path: string) {
  const date = getBokunDateFormat(new Date());
  const signature = generateSignature(
    date,
    BOKUN_ACCESS_KEY,
    BOKUN_SECRET_KEY,
    method,
    path
  );

  return {
    'X-Bokun-Date':      date,
    'X-Bokun-AccessKey': BOKUN_ACCESS_KEY,
    'X-Bokun-Signature': signature,
    'Content-Type':      'application/json;charset=UTF-8',
  };
}

// ============================================
// FIREBASE FIRESTORE INTEGRATION HELPERS
// ============================================

// Check if a Bokun booking has already been saved to avoid duplicates
async function isBokunBookingAlreadySaved(bokunId: number): Promise<boolean> {
  const bookingsRef = collection(db, 'bookings');
  const q = query(bookingsRef, where('bokunBookingId', '==', bokunId));
  const querySnapshot = await getDocs(q);
  return !querySnapshot.empty;
}

// Generate sequential booking ID like ER-000001
async function generateBookingId(): Promise<string> {
  const counterRef = doc(db, 'counters', 'bookings');
  const newId = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const current = snap.exists() ? snap.get('next') ?? 1 : 1;
    transaction.set(counterRef, { next: current + 1 }, { merge: true });
    const padded = String(current).padStart(6, '0');
    return `ER-${padded}`;
  });
  return newId;
}

// Save Bokun booking details directly to Firestore
async function saveBookingToFirestore(booking: Booking): Promise<string | null> {
  const alreadySaved = await isBokunBookingAlreadySaved(booking.id);
  if (alreadySaved) {
    return null;
  }

  const bookingId = await generateBookingId();
  const bookingRef = doc(db, 'bookings', bookingId);
  const now = Timestamp.now();

  const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`.trim() || 'N/A';
  const timeVal = booking.startTime || '00:00';

  const bookingData = {
    bookingId,
    source: 'bokun',
    bokunBookingId: booking.id,
    customerName,
    email: booking.customer.email,
    phone: booking.customer.phone,
    pickup: booking.productTitle,
    dropoff: 'Bokun Import',
    date: booking.startDate,
    time: timeVal,
    price: booking.totalPaid,
    passengers: booking.participants,
    luggage: 0,
    paymentStatus: booking.status === 'CONFIRMED' ? 'PAID' : 'UNPAID',
    status: 'NEW',
    customerNotes: `Bokun Booking ID: ${booking.id}. Channel: ${booking.channel}`,
    internalNotes: `Automatically imported from Bokun API. Channel: ${booking.channel}. Created: ${booking.createdDate}`,
    createdAt: now,
  };

  await setDoc(bookingRef, bookingData);

  // Log activity
  const activityRef = doc(db, 'activityLogs', `${bookingId}_created_${Date.now()}`);
  await setDoc(activityRef, {
    timestamp: now,
    adminUser: null, // system action
    action: 'Booking Created (Bokun Import)',
    bookingId,
  });

  return bookingId;
}

// ============================================
// FETCH ALL BOOKINGS FROM BOKUN
// ============================================
async function getBookings(): Promise<Booking[]> {
  const path = '/booking.json/booking-search';
  const headers = getHeaders('POST', path);

  const response = await fetch(`${BOKUN_API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      page: 1,
      pageSize: 50
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Bokun API error: ${response.status} ${response.statusText}. Response: ${errorText}`);
  }

  const data = await response.json() as any;
  const rawBookings = data.items || [];

  return rawBookings.map((b: any): Booking => {
    // Standardize customer variables
    const customerFirstName = b.customer?.firstName || 'N/A';
    const customerLastName = b.customer?.lastName || 'N/A';
    const customerEmail = b.customer?.email || 'N/A';
    const customerPhone = b.customer?.phoneNumber || 'N/A';

    return {
      id:           b.id,
      status:       b.status || 'CONFIRMED',
      startDate:    b.startDate ? b.startDate.substring(0, 10) : 'N/A', // Get date YYYY-MM-DD
      startTime:    b.startTime || '00:00',
      productTitle: b.product?.title || 'N/A',
      totalPaid:    b.paidAmount || b.totalPrice || 0,
      currency:     b.currency || 'EUR',
      participants: b.totalParticipants || 0,
      channel:      b.channel?.title || b.salesChannel || 'N/A',
      createdDate:  b.creationDate ? b.creationDate.substring(0, 10) : 'N/A',
      customer: {
        firstName: customerFirstName,
        lastName:  customerLastName,
        email:     customerEmail,
        phone:     customerPhone,
      },
    };
  });
}

// ============================================
// GET SINGLE BOOKING DETAILS FROM BOKUN
// ============================================
async function getBookingById(bookingId: number): Promise<Booking> {
  const path = `/booking.json/booking/${bookingId}`;
  const headers = getHeaders('GET', path);

  const response = await fetch(`${BOKUN_API_URL}${path}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Booking not found: ${response.status}`);
  }

  const b = await response.json() as any;

  return {
    id:           b.id,
    status:       b.status || 'CONFIRMED',
    startDate:    b.startDate ? b.startDate.substring(0, 10) : 'N/A',
    startTime:    b.startTime || '00:00',
    productTitle: b.product?.title || 'N/A',
    totalPaid:    b.paidAmount || b.totalPrice || 0,
    currency:     b.currency || 'EUR',
    participants: b.totalParticipants || 0,
    channel:      b.channel?.title || b.salesChannel || 'N/A',
    createdDate:  b.creationDate ? b.creationDate.substring(0, 10) : 'N/A',
    customer: {
      firstName:  b.customer?.firstName    || 'N/A',
      lastName:   b.customer?.lastName     || 'N/A',
      email:      b.customer?.email        || 'N/A',
      phone:      b.customer?.phoneNumber  || 'N/A',
    },
  };
}

// ============================================
// CONFIRM A BOOKING
// ============================================
async function confirmBooking(bookingId: number): Promise<void> {
  const path = `/booking.json/${bookingId}/confirm`;
  const headers = getHeaders('POST', path);

  const response = await fetch(`${BOKUN_API_URL}${path}`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Could not confirm booking: ${response.status}`);
  }

  console.log(`✅ Booking ${bookingId} confirmed on Bokun!`);
}

// ============================================
// CANCEL A BOOKING
// ============================================
async function cancelBooking(bookingId: number): Promise<void> {
  const path = `/booking.json/cancel-booking/${bookingId}`;
  const headers = getHeaders('POST', path);

  const response = await fetch(`${BOKUN_API_URL}${path}`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Could not cancel booking: ${response.status}`);
  }

  console.log(`❌ Booking ${bookingId} cancelled on Bokun!`);
}

// ============================================
// DISPLAY & PROCESS BOKUN BOOKINGS
// ============================================
async function syncBokunBookings(): Promise<void> {
  console.log('\n🟠 BOKUN SYNC CYCLE STARTING...');
  console.log('==================================\n');

  try {
    const bookings = await getBookings();

    if (bookings.length === 0) {
      console.log('No bookings found in Bokun. Waiting for next cycle...');
      return;
    }

    let processedCount = 0;

    for (const booking of bookings) {
      try {
        const dbId = await saveBookingToFirestore(booking);
        
        if (dbId) {
          console.log(`📋 IMPORTED NEW BOOKING:`);
          console.log(`   Bokun ID:  ${booking.id}`);
          console.log(`   DB ID:     ${dbId} (Firestore)`);
          console.log(`   Product:   ${booking.productTitle}`);
          console.log(`   Customer:  ${booking.customer.firstName} ${booking.customer.lastName}`);
          console.log(`   People:    ${booking.participants}`);
          console.log(`   Total:     ${booking.totalPaid} ${booking.currency}`);
          console.log(`   Channel:   ${booking.channel}`);
          console.log('----------------------------------\n');
          processedCount++;
        }
      } catch (saveError) {
        console.error(`🚨 Error processing Bokun ID ${booking.id}:`, saveError);
      }
    }

    if (processedCount === 0) {
      console.log('No new Bokun bookings to save (all checked bookings already existed in database).');
    } else {
      console.log(`✅ Completed sync cycle. Saved ${processedCount} new bookings.`);
    }

  } catch (error) {
    console.error('🚨 CRITICAL ERROR in Bokun sync cycle:', error);
  }
}

// ============================================
// RUN — AUTO REFRESH EVERY 5 MINUTES
// ============================================
syncBokunBookings();
setInterval(syncBokunBookings, 5 * 60 * 1000);

export { getBookings, getBookingById, confirmBooking, cancelBooking, syncBokunBookings };
