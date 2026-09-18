import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { config, validateConfig } from './config';
import { getAdminDb } from './src/lib/firebase-admin';
import {
  normalizeTime,
  normalizeDate,
  normalizeCustomerName,
  normalizePrice,
  normalizeBookingRef,
  cleanLocation
} from './src/lib/bookingFormatters';
import { reconstructBooking, toFirestoreDoc, RawEmail, compareAndChooseBest } from './viator-parser-v2';

// Initialize Firebase
const db = getAdminDb();

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
  parserVersion: string;
  tourGradeCode: string;
}

const PARSER_VERSION = '2.0.0';

// ============================================
// IMAP CONFIGS
// Step 2: Primary Gmail + optional direct iCloud
// (set ICLOUD_USER + ICLOUD_APP_PASSWORD in .env.local)
// ============================================
function getIcloudImapConfig() {
  const user = process.env.ICLOUD_USER || 'taxi2bcn@icloud.com';
  const password = process.env.ICLOUD_APP_PASSWORD || process.env.ICLOUD_PASS || '';
  if (!user || !password) return null;
  return {
    user,
    password,
    host: 'imap.mail.me.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  };
}

// Folders to search across iCloud
const ICLOUD_FOLDERS = ['INBOX', 'Archive', 'Junk', 'Deleted Messages'];

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
  const doc = toFirestoreDoc(state);

  return {
    bookingRef: doc.bookingId,
    customerName: doc.customerName,
    phone: doc.phone,
    email: doc.email || '',
    tourName: '',
    travelDate: doc.date,
    pickupTime: doc.pickupTime,
    pickupLocation: doc.pickup,
    dropOff: doc.dropoff,
    travelers: String(doc.passengers),
    netRate: state.netRate?.value || '',
    notes: doc.notes,
    airline: doc.airline || '',
    flight: doc.flight,
    receivedAt: new Date().toLocaleString('es-ES'),
    flightArrivalTime: doc.flightArrivalTime,
    flightDepartureTime: doc.flightDepartureTime,
    cruiseShip: doc.cruiseShip,
    disembarkTime: doc.disembarkTime || '',
    flightArrival: doc.flightArrivalTime,
    flightDeparture: doc.flightDepartureTime,
    bookingType: 'standard',
    pickupTimeSource: state.pickupTime?.source || 'v2-parser',
    pickupTimeConfidence: state.requiresReview ? 'review_required' : 'high',
    parserVersion: '2.0.0',
    tourGradeCode: doc.tourGradeCode
  };
}

// ============================================
// AUDIT LOG HELPER (Step 6)
// Logs every email before parsing — permanent audit trail
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
    await db.collection('emailAuditLog').doc(docId).set({ ...data, fetchedAt: new Date() }, { merge: true });
  } catch (e) { console.error('[AuditLog] write failed:', e); }
}

// ============================================
// FAILURE LOG HELPER (Step 4)
// ============================================
async function writeFailureLog(data: {
  bookingId: string; subject: string; error: string; stack?: string;
  receivedAt: Date;
  importStatus: 'FAILED' | 'CANCELLATION_FOR_UNKNOWN_BOOKING' | 'MANUAL_REVIEW_REQUIRED';
}) {
  try {
    const docId = `${data.bookingId || 'unknown'}_${Date.now()}`;
    await db.collection('viatorImportLogs').doc(docId).set({ ...data, loggedAt: new Date() });
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

  // Step 6: Audit log BEFORE any processing
  await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId || null, processingResult: 'pending', mailbox });

  if (!bookingRefId) {
    console.warn(`[Viator Sync] No booking ref in: "${subject}"`);
    await writeFailureLog({ bookingId: 'UNKNOWN', subject, error: 'Booking ref not found in subject or body', receivedAt, importStatus: 'MANUAL_REVIEW_REQUIRED' });
    await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: null, processingResult: 'no_ref', mailbox });
    return;
  }

  try {
    const bookingRef = db.collection('bookings').doc(bookingRefId);
    const bookingSnap = await bookingRef.get();
    const exists = bookingSnap.exists;
    const existingData = exists ? (bookingSnap.data() || {}) : {};

    if (emailType === 'cancel') {
      if (exists) {
        const alreadyCancelled = existingData.status === 'CANCELLED' || existingData.status === 'cancelled';
        const notes = existingData.internalNotes || '';
        const alreadyHasNote = notes.includes('[CANCELLATION]');

        if (!alreadyCancelled || !alreadyHasNote) {
          const prefix = notes ? `${notes}\n` : '';
          await bookingRef.set({
            status: 'CANCELLED', paymentStatus: 'REFUNDED', updatedAt: new Date(),
            internalNotes: `${prefix}[CANCELLATION] via Viator email ${new Date().toLocaleString()}`
          }, { merge: true });
          console.log(`[Viator Sync] Cancelled ${bookingRefId}`);
        } else {
          console.log(`[Viator Sync] ${bookingRefId} already marked cancelled. Skipping duplicate note.`);
        }
      } else {
        // Step 5: cancellation for unknown booking — create shell
        console.warn(`[Viator Sync] Cancellation for unknown booking ${bookingRefId}. Creating shell.`);
        let shellName = 'Unknown Customer';
        try { shellName = parseViatorEmail(body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' '), subject).customerName || shellName; } catch {}
        await bookingRef.set({
          bookingId: bookingRefId, source: 'viator-email', status: 'CANCELLED', paymentStatus: 'REFUNDED',
          customerName: shellName, pickup: 'Not Specified', dropoff: 'Not Specified',
          date: '', time: '', vehicle: 'economy', price: 0, passengers: 1,
          internalNotes: `[SHELL] Created from cancellation email — no prior booking existed. ${new Date().toLocaleString()}`,
          parserVersion: PARSER_VERSION, createdAt: new Date(), updatedAt: new Date(),
        });
        await writeFailureLog({ bookingId: bookingRefId, subject, error: 'Cancellation for unknown booking — shell created', receivedAt, importStatus: 'CANCELLATION_FOR_UNKNOWN_BOOKING' });
      }
      await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'success', mailbox });

    } else if (emailType === 'new') {
      if (exists) {
        console.log(`[Viator Sync] ${bookingRefId} already exists. Skipping.`);
        await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'skipped_exists', mailbox });
        return;
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
      await bookingRef.set(fieldsToSave);
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
      if (booking.notes) fieldsToUpdate.customerNotes = booking.notes;
      if (booking.netRate) {
        fieldsToUpdate.netRate = booking.netRate;
        const p = normalizePrice(booking.netRate);
        if (p > 0) fieldsToUpdate.price = p;
      }
      if (booking.pickupTimeSource) fieldsToUpdate.pickupTimeSource = booking.pickupTimeSource;
      if (booking.pickupTimeConfidence) fieldsToUpdate.pickupTimeConfidence = booking.pickupTimeConfidence;

      if (exists) {
        if (existingData.status === 'INCOMPLETE') {
          const finalTime = fieldsToUpdate.time || existingData.time;
          const finalPickup = fieldsToUpdate.pickup || existingData.pickup;
          const finalDate = fieldsToUpdate.date || existingData.date;
          if (finalTime && finalTime !== '00:00' && finalPickup && finalPickup !== 'Not Specified' && finalDate) {
            fieldsToUpdate.status = 'confirmed';
            fieldsToUpdate.pickupTimeConfidence = 'high';
          }
        }
        await bookingRef.set(fieldsToUpdate, { merge: true });
        console.log(`[Viator Sync] Updated ${bookingRefId} from amendment.`);
      } else {
        fieldsToUpdate.bookingId = bookingRefId; fieldsToUpdate.source = 'viator-email';
        fieldsToUpdate.status = 'confirmed'; fieldsToUpdate.paymentStatus = 'PAID';
        fieldsToUpdate.vehicle = 'economy'; fieldsToUpdate.createdAt = new Date();
        fieldsToUpdate.customerName = fieldsToUpdate.customerName || 'Lead Traveler';
        fieldsToUpdate.pickup = fieldsToUpdate.pickup || 'Not Specified';
        fieldsToUpdate.dropoff = fieldsToUpdate.dropoff || 'Not Specified';
        fieldsToUpdate.parserVersion = PARSER_VERSION;
        await bookingRef.set(fieldsToUpdate);
        console.log(`[Viator Sync] Created ${bookingRefId} from amendment (was missing).`);
      }
      await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'success', mailbox });
    }

  } catch (err: any) {
    // Step 4: NEVER silently drop — always persist the failure
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
        
        // Only fetch emails from the last 14 days to prevent massive RAM exhaustion
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 14);

        imap.search([['SINCE', sinceDate], ['OR', ['FROM', 'viator'], ['SUBJECT', 'BR-']]], (searchErr: any, results: any) => {
          if (searchErr || !results?.length) { imap.end(); return resolve(); }
          
          // Process most recent 30 emails per folder
          const targetUids = results.length > 30 ? results.slice(-30) : results;
          console.log(`📬 [${folder}] ${results.length} recent Viator email(s), syncing latest ${targetUids.length}.`);
          
          const fetch = imap.fetch(targetUids, { bodies: '', markSeen: false });
          const promises: Promise<void>[] = [];
          fetch.on('message', (msg: any) => {
            const p = new Promise<void>((resolveMsg) => {
              msg.on('body', (stream: any) => {
                simpleParser(stream, async (parseErr: any, parsed: any) => {
                  if (parseErr) { resolveMsg(); return; }
                  const mid = parsed.messageId || '';
                  if (mid && seenIds.has(mid)) { resolveMsg(); return; } // dedup across folders
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
// UNIFIED SYNC FUNCTION (Steps 2+3)
// ============================================
export async function fetchNewBookings(): Promise<ViatorBooking[]> {
  validateConfig();
  const bookingsList: ViatorBooking[] = [];
  const seenIds = new Set<string>(); // dedup across folders

  // iCloud direct sync (all folders: INBOX, Archive, Junk, Deleted Messages)
  const icloudConfig = getIcloudImapConfig();
  if (icloudConfig) {
    for (const folder of ICLOUD_FOLDERS) {
      try { await fetchFromFolder(icloudConfig, folder, bookingsList, seenIds); }
      catch (e: any) { console.error(`[Viator Sync] iCloud ${folder} failed:`, e.message); }
    }
  }

  console.log(`[Viator Sync] Complete. ${bookingsList.length} new bookings processed.`);
  return bookingsList;
}

export function fetchCancellations(): Promise<void> {
  return Promise.resolve(); // merged into fetchNewBookings
}

export type { ViatorBooking };
