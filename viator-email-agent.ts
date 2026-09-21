import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { config, validateConfig } from './config';
import { supabaseAdmin } from './src/lib/supabase-admin';
import {
  normalizeTime,
  normalizeDate,
  normalizeCustomerName,
  normalizePrice,
  normalizeBookingRef,
  cleanLocation
} from './src/lib/bookingFormatters';
import { reconstructBooking, toFirestoreDoc, RawEmail, compareAndChooseBest } from './viator-parser-v2';

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
const IMAP_FOLDERS = ['INBOX', '[Gmail]/All Mail'];

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
    receivedAt: new Date().toISOString(),
    flightArrivalTime: doc.flightArrivalTime,
    flightDepartureTime: doc.flightDepartureTime,
    cruiseShip: doc.cruiseShip,
    disembarkTime: doc.disembarkTime,
    flightArrival: doc.flightArrivalTime || '',
    flightDeparture: doc.flightDepartureTime || '',
    bookingType: doc.bookingType || 'standard',
    pickupTimeSource: doc.pickupTimeSource || 'default',
    pickupTimeConfidence: state.requiresReview ? 'review_required' : 'high',
    parserVersion: '2.0.0',
    tourGradeCode: doc.tourGradeCode
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
    await supabaseAdmin.from('email_audit_logs').insert({
      message_id: data.messageId,
      subject: data.subject,
      from_address: data.from,
      received_at: data.receivedAt.toISOString(),
      booking_ref_extracted: data.bookingRefExtracted,
      processing_result: data.processingResult,
      mailbox: data.mailbox,
      error: data.error,
      fetched_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[AuditLog] write failed:', e?.message || e);
  }
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
    await supabaseAdmin.from('viator_import_logs').insert({
      booking_id: data.bookingId,
      subject: data.subject,
      error: data.error,
      stack: data.stack,
      received_at: data.receivedAt.toISOString(),
      import_status: data.importStatus,
      logged_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[FailureLog] write failed:', e?.message || e);
  }
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

  try {
    if (emailType === 'cancel') {
      const { data: existing } = await supabaseAdmin.from('bookings').select('id, status').eq('booking_id', bookingRefId).single();
      if (!existing) {
        console.warn(`[Viator Sync] Cancellation received for unknown booking ${bookingRefId}.`);
        await writeFailureLog({ bookingId: bookingRefId, subject, error: 'Cancellation received but booking not found in database', receivedAt, importStatus: 'CANCELLATION_FOR_UNKNOWN_BOOKING' });
      }
      await supabaseAdmin.from('bookings').upsert({
        id: bookingRefId,
        booking_id: bookingRefId,
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      });
      console.log(`[Viator Sync] Cancelled ${bookingRefId}.`);
      await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'success', mailbox });

    } else if (emailType === 'new') {
      const { data: existing } = await supabaseAdmin.from('bookings').select('id, status').eq('booking_id', bookingRefId).single();
      if (existing && (existing.status === 'confirmed' || existing.status === 'cancelled')) {
        console.log(`[Viator Sync] Skipping ${bookingRefId} — already exists as ${existing.status}.`);
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

      const record: any = {
        id: bookingRefId,
        booking_id: bookingRefId,
        source: 'viator-email',
        customer_name: booking.customerName || 'Lead Traveler',
        email: booking.email || '',
        phone: booking.phone || '',
        pickup: booking.pickupLocation || 'Not Specified',
        dropoff: booking.dropOff || 'Not Specified',
        date: normalizeDate(booking.travelDate) || '',
        time: normalizeTime(booking.pickupTime) || '',
        vehicle: 'economy',
        airline: booking.airline || '',
        flight: booking.flight || '',
        cruise_ship: booking.cruiseShip || '',
        price: normalizePrice(booking.netRate) || 0,
        passengers: parseInt(booking.travelers) || 1,
        status: missingCritical ? 'INCOMPLETE' : 'confirmed',
        payment_status: 'PAID',
        customer_notes: booking.notes || '',
        disembark_time: booking.disembarkTime || '',
        flight_arrival_time: booking.flightArrivalTime || '',
        flight_departure_time: booking.flightDepartureTime || '',
        pickup_time_source: booking.pickupTimeSource || 'email',
        pickup_time_confidence: booking.pickupTimeConfidence || 'high',
        parser_version: PARSER_VERSION,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabaseAdmin.from('bookings').upsert(record);
      if (upsertErr) {
        console.error(`[Viator Sync] Supabase write error for ${bookingRefId}:`, upsertErr.message);
      } else {
        console.log(`[Viator Sync] Created ${bookingRefId}${missingCritical ? ' (INCOMPLETE)' : ''} in Supabase.`);
      }
      await writeAuditLog({ messageId, subject, from: fromAddress, receivedAt, bookingRefExtracted: bookingRefId, processingResult: 'success', mailbox });

    } else if (emailType === 'modify') {
      const cleanedText = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
      const booking = parseViatorEmail(cleanedText, subject);

      const fieldsToUpdate: any = {
        id: bookingRefId,
        booking_id: bookingRefId,
        updated_at: new Date().toISOString(),
      };

      if (booking.customerName && booking.customerName.toLowerCase() !== 'lead traveler') {
        fieldsToUpdate.customer_name = booking.customerName;
      }
      if (booking.phone) fieldsToUpdate.phone = booking.phone;
      if (booking.email) fieldsToUpdate.email = booking.email;
      if (booking.pickupLocation && booking.pickupLocation !== 'Not Specified') {
        fieldsToUpdate.pickup = booking.pickupLocation;
      }
      if (booking.dropOff && booking.dropOff !== 'Not Specified') {
        fieldsToUpdate.dropoff = booking.dropOff;
      }
      const normDate = normalizeDate(booking.travelDate);
      if (normDate) fieldsToUpdate.date = normDate;
      const normTime = normalizeTime(booking.pickupTime);
      if (normTime) fieldsToUpdate.time = normTime;
      if (booking.airline) fieldsToUpdate.airline = booking.airline;
      if (booking.flight) fieldsToUpdate.flight = booking.flight;
      if (booking.cruiseShip) fieldsToUpdate.cruise_ship = booking.cruiseShip;
      if (booking.disembarkTime) fieldsToUpdate.disembark_time = booking.disembarkTime;
      if (booking.flightArrivalTime) fieldsToUpdate.flight_arrival_time = booking.flightArrivalTime;
      if (booking.flightDepartureTime) fieldsToUpdate.flight_departure_time = booking.flightDepartureTime;
      if (booking.notes) fieldsToUpdate.customer_notes = booking.notes;
      if (booking.travelers) fieldsToUpdate.passengers = parseInt(booking.travelers) || 1;
      if (booking.netRate) fieldsToUpdate.price = normalizePrice(booking.netRate);

      const { data: existing } = await supabaseAdmin.from('bookings').select('id, driver_id, internal_notes').eq('booking_id', bookingRefId).single();
      if (existing) {
        if (existing.driver_id && existing.driver_id !== 'unassigned') {
          fieldsToUpdate.internal_notes = (existing.internal_notes ? existing.internal_notes + '\n' : '') +
            `[VIATOR AMENDMENT ${new Date().toISOString()}] Details amended via Viator email.`;
        }
        await supabaseAdmin.from('bookings').update(fieldsToUpdate).eq('booking_id', bookingRefId);
        console.log(`[Viator Sync] Updated ${bookingRefId} in Supabase.`);
      } else {
        fieldsToUpdate.source = 'viator-email';
        fieldsToUpdate.status = 'confirmed';
        fieldsToUpdate.payment_status = 'PAID';
        fieldsToUpdate.vehicle = 'economy';
        fieldsToUpdate.created_at = new Date().toISOString();
        fieldsToUpdate.parser_version = PARSER_VERSION;
        await supabaseAdmin.from('bookings').upsert(fieldsToUpdate);
        console.log(`[Viator Sync] Created ${bookingRefId} from amendment in Supabase.`);
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
        
        // Search all emails with Viator or BR- in subject/from across all time
        imap.search([['OR', ['FROM', 'viator'], ['SUBJECT', 'BR-']]], (searchErr: any, results: any) => {
          if (searchErr || !results?.length) { imap.end(); return resolve(); }
          
          console.log(`📬 [${folder}] ${results.length} total Viator email(s) found, syncing all.`);
          
          const fetch = imap.fetch(results, { bodies: '', markSeen: false });
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
