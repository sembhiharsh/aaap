import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { config, validateConfig } from './config';
import { getDb } from './src/lib/firebase-server';
import { doc, getDoc, setDoc } from 'firebase/firestore/lite';
import {
  normalizeTime,
  normalizeDate,
  normalizeCustomerName,
  normalizePrice,
  normalizeBookingRef,
  cleanLocation
} from './src/lib/bookingFormatters';
import { reconstructBooking, toFirestoreDoc, RawEmail, compareAndChooseBest } from './viator-parser-v2';

// Initialize Firebase Database via REST
const db = getDb();

// ============================================
// TYPES
// ============================================
interface ViatorBooking {
  bookingRef: string;
  customerName: string;
  phone: string;
  email: string;
  tourName: string;
  travelDate: string;
  pickupTime: string;
  pickupLocation: string;
  dropOff: string;
  travelers: string;
  netRate: string;
  notes: string;
  airline: string;
  flight?: string;
  receivedAt: string;
  flightArrivalTime?: string;
  flightDepartureTime?: string;
  cruiseShip?: string;
  disembarkTime?: string;
  flightArrival: string;
  flightDeparture: string;
  bookingType: string;
  pickupTimeSource: string;
  pickupTimeConfidence: 'high' | 'medium' | 'review_required';
  parserVersion?: string;
  tourGradeCode?: string;
}

const PARSER_VERSION = '2.0.0';

// ============================================
// IMAP CONFIG (Auto-detects Gmail or iCloud)
// ============================================
function getImapConfig() {
  const user = process.env.GMAIL_USER || process.env.EMAIL_USER || '';
  const password = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD || '';
  if (!user || !password) return null;

  const isIcloud = user.toLowerCase().endsWith('@icloud.com') || user.toLowerCase().endsWith('@me.com');
  const host = isIcloud ? 'imap.mail.me.com' : 'imap.gmail.com';

  return {
    user,
    password,
    host,
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  };
}

// Folders to search across
const IMAP_FOLDERS = ['INBOX', '[Gmail]/All Mail', 'All Mail'];

// ============================================
// PARSE VIATOR EMAIL — EXACT FORMAT
// ============================================
export function parseViatorEmail(body: string, subject?: string): ViatorBooking {
  const rawEmail: RawEmail = {
    subject: subject || '',
    body: body || '',
    receivedAt: new Date()
  };
  const state = reconstructBooking([rawEmail]);
  const firestoreDoc = toFirestoreDoc(state);

  return {
    bookingRef: firestoreDoc.bookingId,
    customerName: firestoreDoc.customerName,
    phone: firestoreDoc.phone,
    email: firestoreDoc.email || '',
    tourName: '',
    travelDate: firestoreDoc.date,
    pickupTime: firestoreDoc.pickupTime,
    pickupLocation: firestoreDoc.pickup,
    dropOff: firestoreDoc.dropoff,
    travelers: String(firestoreDoc.passengers),
    netRate: state.netRate?.value || '',
    notes: firestoreDoc.notes,
    airline: firestoreDoc.airline || '',
    flight: firestoreDoc.flight,
    receivedAt: new Date().toISOString(),
    flightArrivalTime: firestoreDoc.flightArrivalTime,
    flightDepartureTime: firestoreDoc.flightDepartureTime,
    cruiseShip: firestoreDoc.cruiseShip,
    disembarkTime: firestoreDoc.disembarkTime,
    flightArrival: firestoreDoc.flightArrivalTime || '',
    flightDeparture: firestoreDoc.flightDepartureTime || '',
    bookingType: firestoreDoc.bookingType || 'standard',
    pickupTimeSource: firestoreDoc.pickupTimeSource || 'default',
    pickupTimeConfidence: state.requiresReview ? 'review_required' : 'high',
    parserVersion: '2.0.0',
    tourGradeCode: firestoreDoc.tourGradeCode
  };
}

// ============================================
// AUDIT LOG HELPER
// ============================================
async function writeAuditLog(data: {
  messageId: string; subject: string; from: string; receivedAt: Date;
  bookingRefExtracted: string | null;
  processingResult: 'pending' | 'success' | 'failed' | 'skipped_exists' | 'skipped_untrusted' | 'no_ref';
  mailbox: string; error?: string;
}) {
  try {
    const docId = data.messageId
      ? data.messageId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200)
      : `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await setDoc(doc(db, 'emailAuditLog', docId), { ...data, fetchedAt: new Date() }, { merge: true });
  } catch (e) { console.error('[AuditLog] write failed:', e); }
}

// ============================================
// FAILURE LOG HELPER
// ============================================
async function writeFailureLog(data: {
  bookingId: string; subject: string; error: string; stack?: string;
  receivedAt: Date;
  importStatus: 'FAILED' | 'CANCELLATION_FOR_UNKNOWN_BOOKING' | 'MANUAL_REVIEW_REQUIRED';
}) {
  try {
    const docId = `${data.bookingId || 'unknown'}_${Date.now()}`;
    await setDoc(doc(db, 'viatorImportLogs', docId), { ...data, loggedAt: new Date() });
  } catch (e) { console.error('[FailureLog] write failed:', e); }
}

// ============================================
// CORE MESSAGE PROCESSOR
// ============================================
async function processMessage(parsed: any, bookingsList: ViatorBooking[], mailbox: string): Promise<void> {
  const fromAddress = parsed.from?.value?.[0]?.address || '';
  const domain = fromAddress.split('@')[1] || '';
  const subject = parsed.subject || '';
  const messageId = parsed.messageId || `no_id_${Date.now()}`;
  const receivedAt: Date = parsed.date instanceof Date ? parsed.date : new Date();

  const body = parsed.text || parsed.html || '';

  // Trust check — sender domain must end with viator.com/tripadvisor.com OR contain BR- reference
  const isViatorDomain = domain.toLowerCase().endsWith('viator.com') || domain.toLowerCase().endsWith('tripadvisor.com');
  const isViatorRef = /BR-\d+/i.test(subject) || /BR-\d+/i.test(body);

  if (!isViatorDomain && !isViatorRef) {
    await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: null, processingResult: 'skipped_untrusted', mailbox });
    return;
  }

  let emailType: 'new' | 'cancel' | 'modify' = 'new';
  if (/cancel/i.test(subject)) emailType = 'cancel';
  else if (/amend|update|change|modify/i.test(subject) || /amend|update|change|modify/i.test(body.slice(0, 300))) emailType = 'modify';

  let bookingRefId = '';
  const subjectRefMatch = subject.match(/BR-\d+/i);
  if (subjectRefMatch) {
    bookingRefId = subjectRefMatch[0].toUpperCase();
  } else {
    const bodyRefMatch = body.match(/BR-\d+/i);
    if (bodyRefMatch) bookingRefId = bodyRefMatch[0].toUpperCase();
  }

  if (!bookingRefId) {
    console.warn(`[Viator Sync] Could not extract BR- ref from email "${subject}".`);
    await writeFailureLog({ bookingId: 'unknown', subject, error: 'Could not extract BR- reference from email', receivedAt, importStatus: 'FAILED' });
    await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: null, processingResult: 'no_ref', mailbox });
    return;
  }

  const bookingRef = doc(db, 'bookings', bookingRefId);

  try {
    if (emailType === 'cancel') {
      const snap = await getDoc(bookingRef);
      if (!snap.exists()) {
        console.warn(`[Viator Sync] Cancellation received for unknown booking ${bookingRefId}.`);
        await writeFailureLog({ bookingId: bookingRefId, subject, error: 'Cancellation received but booking not found in database', receivedAt, importStatus: 'CANCELLATION_FOR_UNKNOWN_BOOKING' });
      }
      await setDoc(bookingRef, {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });
      console.log(`[Viator Sync] Cancelled ${bookingRefId}.`);
      await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'success', mailbox });

    } else if (emailType === 'new') {
      const snap = await getDoc(bookingRef);
      if (snap.exists()) {
        const existingData = snap.data();
        if (existingData?.status === 'confirmed' || existingData?.status === 'cancelled') {
          console.log(`[Viator Sync] Skipping ${bookingRefId} — already exists as ${existingData.status}.`);
          await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'skipped_exists', mailbox });
          return;
        }
      }

      const cleanedText = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
      const booking = parseViatorEmail(cleanedText, subject);
      bookingsList.push(booking);

      const missingCritical = !booking.customerName || !booking.travelDate || !booking.pickupTime || !booking.pickupLocation;
      if (missingCritical) {
        console.warn(`[Viator Sync] Missing critical fields for ${bookingRefId}. Flagging.`);
        booking.pickupTimeConfidence = 'review_required';
        await writeFailureLog({ bookingId: bookingRefId, subject, error: 'Missing critical fields: name, date, time, or pickup', receivedAt, importStatus: 'MANUAL_REVIEW_REQUIRED' });
      }

      const fieldsToSave: any = {
        bookingId: bookingRefId, source: 'viator-email',
        customerName: booking.customerName || 'Lead Traveler',
        email: booking.email || '', phone: booking.phone || '',
        pickup: booking.pickupLocation || 'Not Specified', dropoff: booking.dropOff || 'Not Specified',
        date: normalizeDate(booking.travelDate) || '', time: normalizeTime(booking.pickupTime) || '',
        vehicle: 'economy', airline: booking.airline || '', flight: booking.flight || '',
        cruiseShip: booking.cruiseShip || '', price: normalizePrice(booking.netRate) || 0,
        passengers: parseInt(booking.travelers) || 1,
        status: missingCritical ? 'INCOMPLETE' : 'confirmed',
        paymentStatus: 'PAID', customerNotes: booking.notes || '',
        bookingType: booking.bookingType || 'standard',
        disembarkTime: booking.disembarkTime || '', flightArrivalTime: booking.flightArrivalTime || '',
        flightDepartureTime: booking.flightDepartureTime || '',
        pickupTimeSource: booking.pickupTimeSource, pickupTimeConfidence: booking.pickupTimeConfidence,
        parserVersion: PARSER_VERSION, createdAt: new Date(), updatedAt: new Date(),
      };
      await setDoc(bookingRef, fieldsToSave, { merge: true });
      console.log(`[Viator Sync] Created ${bookingRefId}${missingCritical ? ' (INCOMPLETE)' : ''}.`);
      await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'success', mailbox });

    } else if (emailType === 'modify') {
      const cleanedText = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
      const booking = parseViatorEmail(cleanedText, subject);
      
      const fieldsToUpdate: any = {
        updatedAt: new Date(),
      };

      if (booking.customerName && booking.customerName.toLowerCase() !== 'lead traveler' && booking.customerName.trim() !== '') {
        fieldsToUpdate.customerName = booking.customerName;
      }
      if (booking.phone && booking.phone.trim() !== '') {
        fieldsToUpdate.phone = booking.phone;
      }
      if (booking.email && booking.email.trim() !== '') {
        fieldsToUpdate.email = booking.email;
      }
      if (booking.pickupLocation && booking.pickupLocation !== 'Not Specified' && booking.pickupLocation.trim() !== '') {
        fieldsToUpdate.pickup = booking.pickupLocation;
      }
      if (booking.dropOff && booking.dropOff !== 'Not Specified' && booking.dropOff.trim() !== '') {
        fieldsToUpdate.dropoff = booking.dropOff;
      }
      const normDate = normalizeDate(booking.travelDate);
      if (normDate) fieldsToUpdate.date = normDate;
      const normTime = normalizeTime(booking.pickupTime);
      if (normTime) fieldsToUpdate.time = normTime;
      if (booking.airline) fieldsToUpdate.airline = booking.airline;
      if (booking.flight) fieldsToUpdate.flight = booking.flight;
      if (booking.cruiseShip) fieldsToUpdate.cruiseShip = booking.cruiseShip;
      if (booking.disembarkTime && booking.disembarkTime.length <= 30) fieldsToUpdate.disembarkTime = booking.disembarkTime;
      if (booking.flightArrivalTime) fieldsToUpdate.flightArrivalTime = booking.flightArrivalTime;
      if (booking.flightDepartureTime) fieldsToUpdate.flightDepartureTime = booking.flightDepartureTime;
      if (booking.pickupTimeSource) fieldsToUpdate.pickupTimeSource = booking.pickupTimeSource;
      if (booking.pickupTimeConfidence) fieldsToUpdate.pickupTimeConfidence = booking.pickupTimeConfidence;
      if (booking.notes) fieldsToUpdate.customerNotes = booking.notes;
      if (booking.travelers) fieldsToUpdate.passengers = parseInt(booking.travelers) || 1;
      if (booking.netRate) fieldsToUpdate.price = normalizePrice(booking.netRate);

      const snap = await getDoc(bookingRef);
      if (snap.exists()) {
        const existingData = snap.data();
        if (existingData?.driverId && existingData?.driverId !== 'unassigned') {
          fieldsToUpdate.internalNotes = (existingData.internalNotes ? existingData.internalNotes + '\n' : '') +
            `[VIATOR AMENDMENT ${new Date().toISOString()}] Booking details amended via Viator email.`;
        }
        await setDoc(bookingRef, fieldsToUpdate, { merge: true });
        console.log(`[Viator Sync] Updated ${bookingRefId} from amendment.`);
      } else {
        fieldsToUpdate.bookingId = bookingRefId; fieldsToUpdate.source = 'viator-email';
        fieldsToUpdate.status = 'confirmed'; fieldsToUpdate.paymentStatus = 'PAID';
        fieldsToUpdate.vehicle = 'economy'; fieldsToUpdate.createdAt = new Date();
        fieldsToUpdate.customerName = fieldsToUpdate.customerName || 'Lead Traveler';
        fieldsToUpdate.pickup = fieldsToUpdate.pickup || 'Not Specified';
        fieldsToUpdate.dropoff = fieldsToUpdate.dropoff || 'Not Specified';
        fieldsToUpdate.parserVersion = PARSER_VERSION;
        await setDoc(bookingRef, fieldsToUpdate, { merge: true });
        console.log(`[Viator Sync] Created ${bookingRefId} from amendment (was missing).`);
      }
      await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'success', mailbox });
    }

  } catch (err: any) {
    console.error(`[Viator Sync] Error processing ${bookingRefId}:`, err);
    await writeFailureLog({ bookingId: bookingRefId, subject, error: err?.message || String(err), stack: err?.stack, receivedAt, importStatus: 'FAILED' });
    await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'failed', mailbox, error: err?.message });
  }
}

// ============================================
// FETCH FROM ONE IMAP FOLDER
// ============================================
function fetchFromFolder(imapCfg: any, folder: string, bookingsList: ViatorBooking[], seenIds: Set<string>): Promise<void> {
  return new Promise((resolve) => {
    const imap = new Imap(imapCfg);
    imap.once('error', (err: any) => { console.error(`[Viator Sync] IMAP error (${folder}):`, err.message); resolve(); });
    imap.once('ready', () => {
      imap.openBox(folder, false, (err: any) => {
        if (err) { console.warn(`[Viator Sync] Cannot open "${folder}": ${err.message}`); imap.end(); return resolve(); }
        
        // Search recent emails with Viator or BR- in subject/from
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 30);

        imap.search([['SINCE', sinceDate], ['OR', ['FROM', 'viator'], ['SUBJECT', 'BR-']]], (searchErr: any, results: any) => {
          if (searchErr || !results?.length) { imap.end(); return resolve(); }
          
          const targetUids = results.length > 50 ? results.slice(-50) : results;
          console.log(`📬 [${folder}] ${results.length} Viator email(s) found, syncing latest ${targetUids.length}.`);
          
          const fetch = imap.fetch(targetUids, { bodies: '', markSeen: false });
          const promises: Promise<void>[] = [];
          fetch.on('message', (msg: any) => {
            const p = new Promise<void>((resolveMsg) => {
              msg.on('body', (stream: any) => {
                simpleParser(stream, async (parseErr: any, parsed: any) => {
                  if (parseErr) { resolveMsg(); return; }
                  const mid = parsed.messageId || '';
                  if (mid && seenIds.has(mid)) { resolveMsg(); return; }
                  if (mid) seenIds.add(mid);
                  await processMessage(parsed, bookingsList, folder);
                  resolveMsg();
                });
              });
            });
            promises.push(p);
          });
          fetch.once('error', () => resolve());
          fetch.once('end', () => Promise.all(promises).then(() => { imap.end(); resolve(); }));
        });
      });
    });
    imap.connect();
  });
}

// ============================================
// UNIFIED SYNC FUNCTION
// ============================================
export async function fetchNewBookings(): Promise<ViatorBooking[]> {
  validateConfig();
  const bookingsList: ViatorBooking[] = [];
  const seenIds = new Set<string>();

  const imapConfig = getImapConfig();
  if (imapConfig) {
    for (const folder of IMAP_FOLDERS) {
      try { await fetchFromFolder(imapConfig, folder, bookingsList, seenIds); }
      catch (e: any) { console.error(`[Viator Sync] ${folder} failed:`, e.message); }
    }
  }

  console.log(`[Viator Sync] Complete. ${bookingsList.length} new bookings processed.`);
  return bookingsList;
}

export function fetchCancellations(): Promise<void> {
  return Promise.resolve();
}

export type { ViatorBooking };
