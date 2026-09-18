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
// IMAP CONFIG — credentials from config
// ============================================
const imapConfig = {
  user: process.env.ICLOUD_USER || 'taxi2bcn@icloud.com',
  password: process.env.ICLOUD_APP_PASSWORD || process.env.ICLOUD_PASS || '',
  host: 'imap.mail.me.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

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
    netRate: '',
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
// UNIFIED SYNC FUNCTION
// ============================================
export function fetchNewBookings(): Promise<ViatorBooking[]> {
  validateConfig();
  const bookingsList: ViatorBooking[] = [];

  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) return reject(err);

        // Search ALL emails from viator.com (both read and unread)
        imap.search([
          ['FROM', 'viator.com']
        ], (searchErr, results) => {
          if (searchErr) return reject(searchErr);

          if (!results || results.length === 0) {
            imap.end();
            return resolve([]);
          }

          console.log(`📬 Found ${results.length} Viator email(s) in inbox. Processing...`);
          const fetch = imap.fetch(results, { bodies: '', markSeen: true });
          const messagePromises: Promise<void>[] = [];

          fetch.on('message', (msg) => {
            const msgPromise = new Promise<void>((resolveMsg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, async (parseErr, parsed) => {
                  if (parseErr) {
                    resolveMsg();
                    return;
                  }

                  // 0. Trust check: Sender domain must end with viator.com
                  const fromAddress = parsed.from?.value?.[0]?.address || '';
                  const domain = fromAddress.split('@')[1] || '';
                  if (!domain.toLowerCase().endsWith('viator.com')) {
                    console.log(`Skipping untrusted email from: ${fromAddress}`);
                    resolveMsg();
                    return;
                  }

                  const subject = parsed.subject || '';
                  const body = parsed.text || parsed.html || '';

                  // 2. Classify type by subject pattern
                  let emailType: 'new' | 'cancel' | 'modify' = 'new';
                  if (/cancel/i.test(subject)) {
                    emailType = 'cancel';
                  } else if (/amend|update|change|modify/i.test(subject)) {
                    emailType = 'modify';
                  }

                  // 3. Extract Booking Reference
                  let bookingRefId = '';
                  const subjectRefMatch = subject.match(/BR-\d+/i);
                  if (subjectRefMatch) {
                    bookingRefId = subjectRefMatch[0].toUpperCase();
                  } else {
                    const bodyRefMatch = body.match(/BR-\d+/i);
                    if (bodyRefMatch) {
                      bookingRefId = bodyRefMatch[0].toUpperCase();
                    }
                  }

                  if (!bookingRefId) {
                    console.warn(`[Viator Sync] Reference number not found in email: "${subject}"`);
                    // Flag for manual review
                    try {
                      await db.collection('viatorImportLogs').doc(`error_${Date.now()}`).set({
                        subject,
                        error: 'Booking reference not found or invalid format',
                        receivedAt: parsed.date || new Date(),
                        importStatus: 'MANUAL_REVIEW_REQUIRED'
                      });
                    } catch (e) {
                      console.error('Failed to log sync error:', e);
                    }
                    resolveMsg();
                    return;
                  }

                  try {
                    const bookingRef = db.collection('bookings').doc(bookingRefId);
                    const bookingSnap = await bookingRef.get();
                    const exists = bookingSnap.exists;
                    const existingData = exists ? (bookingSnap.data() || {}) : {};

                    if (emailType === 'cancel') {
                      // 5. Cancellation logic
                      if (exists) {
                        await bookingRef.set({
                          status: 'CANCELLED',
                          paymentStatus: 'REFUNDED',
                          updatedAt: new Date(),
                          internalNotes: `${existingData.internalNotes || ''}\n[CANCELLATION] Cancelled via Viator email at ${new Date().toLocaleString()}`
                        }, { merge: true });
                        console.log(`[Viator Sync] Marked booking ${bookingRefId} as cancelled.`);
                      } else {
                        console.log(`[Viator Sync] Cancellation email received for non-existent booking ${bookingRefId}. Skipping creation.`);
                      }
                    } else if (emailType === 'new') {
                      // New booking confirmation
                      if (exists) {
                        console.log(`[Viator Sync] Booking ${bookingRefId} already exists. Skipping.`);
                      } else {
                        const cleanedText = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
                        const booking = parseViatorEmail(cleanedText, subject);

                        bookingsList.push(booking);

                        if (!booking.customerName || !booking.travelDate || !booking.pickupTime || !booking.pickupLocation) {
                          console.warn(`[Viator Sync] Missing critical fields for booking ${bookingRefId}. Flagging for review.`);
                          await db.collection('viatorImportLogs').doc(`${bookingRefId}_review`).set({
                            bookingId: bookingRefId,
                            error: 'Missing critical fields: name, date, time, or pickup',
                            subject,
                            receivedAt: parsed.date || new Date(),
                            importStatus: 'MANUAL_REVIEW_REQUIRED'
                          });
                          booking.pickupTimeConfidence = 'review_required';
                        }

                        const fieldsToSave = {
                          bookingId: bookingRefId,
                          source: 'viator-email',
                          customerName: booking.customerName || 'Lead Traveler',
                          email: booking.email || '',
                          phone: booking.phone || '',
                          pickup: booking.pickupLocation || 'Not Specified',
                          dropoff: booking.dropOff || 'Not Specified',
                          date: normalizeDate(booking.travelDate) || '',
                          time: normalizeTime(booking.pickupTime) || '',
                          vehicle: 'economy',
                          airline: booking.airline || '',
                          flight: booking.flight || '',
                          cruiseShip: booking.cruiseShip || '',
                          price: normalizePrice(booking.netRate) || 0,
                          passengers: parseInt(booking.travelers) || 1,
                          status: 'confirmed',
                          paymentStatus: 'PAID', // Rule 6: Pre-paid
                          customerNotes: booking.notes || '',
                          bookingType: booking.bookingType || 'standard',
                          disembarkTime: booking.disembarkTime || '',
                          flightArrivalTime: booking.flightArrivalTime || '',
                          flightDepartureTime: booking.flightDepartureTime || '',
                          pickupTimeSource: booking.pickupTimeSource,
                          pickupTimeConfidence: booking.pickupTimeConfidence,
                          createdAt: new Date(),
                          updatedAt: new Date()
                        };

                        await bookingRef.set(fieldsToSave);
                        console.log(`[Viator Sync] Created new Viator booking ${bookingRefId}.`);
                      }
                    } else if (emailType === 'modify') {
                      // Modification email
                      const cleanedText = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
                      const booking = parseViatorEmail(cleanedText, subject);

                      const fieldsToUpdate: any = {
                        customerName: booking.customerName || 'Lead Traveler',
                        email: booking.email || '',
                        phone: booking.phone || '',
                        pickup: booking.pickupLocation || 'Not Specified',
                        dropoff: booking.dropOff || 'Not Specified',
                        date: normalizeDate(booking.travelDate) || '',
                        time: normalizeTime(booking.pickupTime) || '',
                        price: normalizePrice(booking.netRate) || 0,
                        passengers: parseInt(booking.travelers) || 1,
                        airline: booking.airline || '',
                        flight: booking.flight || '',
                        cruiseShip: booking.cruiseShip || '',
                        customerNotes: booking.notes || '',
                        disembarkTime: booking.disembarkTime || '',
                        flightArrivalTime: booking.flightArrivalTime || '',
                        flightDepartureTime: booking.flightDepartureTime || '',
                        updatedAt: new Date()
                      };

                      if (exists) {
                        await bookingRef.set(fieldsToUpdate, { merge: true });
                        console.log(`[Viator Sync] Updated booking ${bookingRefId} with modifications.`);
                      } else {
                        // If it doesn't exist, treat it as a new booking
                        fieldsToUpdate.bookingId = bookingRefId;
                        fieldsToUpdate.source = 'viator-email';
                        fieldsToUpdate.status = 'confirmed';
                        fieldsToUpdate.paymentStatus = 'PAID';
                        fieldsToUpdate.createdAt = new Date();
                        await bookingRef.set(fieldsToUpdate);
                        console.log(`[Viator Sync] Created booking ${bookingRefId} from modification email.`);
                      }
                    }

                  } catch (err) {
                    console.error(`Error saving/updating Viator booking ${bookingRefId}:`, err);
                  }

                  resolveMsg();
                });
              });
            });
            messagePromises.push(msgPromise);
          });

          fetch.once('error', (fetchErr) => reject(fetchErr));
          fetch.once('end', () => {
            Promise.all(messagePromises).then(() => {
              imap.end();
              resolve(bookingsList);
            });
          });
        });
      });
    });

    imap.once('error', (err: any) => reject(err));
    imap.connect();
  });
}

export function fetchCancellations(): Promise<void> {
  // fetchCancellations is merged into fetchNewBookings to run in a single clean pass
  return Promise.resolve();
}

export type { ViatorBooking };
