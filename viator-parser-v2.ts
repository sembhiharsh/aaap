// ============================================
// viator-parser-v2.ts — Deterministic Reconstruction Engine
// Version: 2.1.0
// Phases 1-9 implemented in single file
// ============================================
import { normalizePrice } from './src/lib/bookingFormatters';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface FieldEvidence<T> {
  value: T;
  source: string;
  email: string;
  matchedText: string;
  confidence: ConfidenceLevel;
}

export interface BookingHistoryEvent {
  date: Date;
  type: string;
  summary: string;
  details?: any;
}

export interface BookingStateV2 {
  bookingRef: string;

  // Dates and Times
  travelDate?: FieldEvidence<string>;
  pickupTime?: FieldEvidence<string>;

  // Addresses
  pickupAddress?: FieldEvidence<string>;
  dropoffAddress?: FieldEvidence<string>;

  // Flight & Cruise Info
  flightNumber?: FieldEvidence<string>;
  airline?: FieldEvidence<string>;
  flightArrivalTime?: FieldEvidence<string>;
  flightDepartureTime?: FieldEvidence<string>;
  cruiseShip?: FieldEvidence<string>;
  disembarkationTime?: FieldEvidence<string>;

  // Customer Info
  customerName?: FieldEvidence<string>;
  passengerCount?: FieldEvidence<number>;
  phoneNumber?: FieldEvidence<string>;

  // Metadata
  tourName?: FieldEvidence<string>;
  tourGrade?: FieldEvidence<string>;
  status?: FieldEvidence<string>;
  customerNotes?: FieldEvidence<string>;
  email?: FieldEvidence<string>;
  netRate?: FieldEvidence<string>;

  // Internal Tracking
  bookingHistory: BookingHistoryEvent[];
  requiresReview: boolean;
  reviewReasons: string[];
}

export interface RawEmail {
  subject: string;
  body: string;
  receivedAt: Date;
}

// ============================================
// PHASE 1: STRICT FIELD EXTRACTION ENGINE
// ============================================

// All known Viator email labels used as stop boundaries.
// NOTE: standalone "Location:" intentionally excluded to prevent
// false matches inside "Pick up Location:" / "Drop Off Location:".
const STOP_LABELS = [
  'Booking Reference:', 'Booking Details',
  'Tour Name:', 'Travel Date:',
  'Lead Traveler Name:', 'Traveler Names:', 'Travelers:',
  'Product Code:',
  'Tour Grade Code:', 'Tour Grade Description:', 'Tour Grade:',
  'Net Rate:', 'Hotel Pickup:',
  'Arrival Flight No:', 'Arrival Airline:', 'Arrival Flight:',
  'Departure Flight No:', 'Departure Airline:', 'Departure Flight:',
  'Pick up Location:', 'Drop Off Location:',
  'Pickup Point/Meeting point:',
  'Arrival Time:', 'Departure Time:', 'Boarding Time:',
  'Cruise Ship:', 'Disembarkation Time:',
  'Special Requirements:', 'Phone:',
  'Send the customer', 'Optional:',
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STOP_PATTERN = STOP_LABELS.map(escapeRe).join('|');

/** Remove Unicode invisible characters (U+2068, U+2069, U+200B, etc.) */
function cleanInvisible(text: string): string {
  return text.replace(/[\u2068\u2069\u200B\u200C\u200D\uFEFF]/g, '');
}

/** Normalize raw email body for parsing */
export function normalizeEmailText(raw: string): string {
  let t = raw || '';
  t = t.replace(/<[^>]+>/g, ' ');        // strip HTML tags
  t = t.replace(/&nbsp;/gi, ' ');         // decode HTML entities
  t = cleanInvisible(t);                   // invisible chars
  t = t.replace(/\s+/g, ' ').trim();      // collapse whitespace
  return t;
}

function isEmptyValue(val: string): boolean {
  const c = cleanInvisible(val).trim();
  return !c || c === 'N/A' || c === 'Not Specified' || c === 'No' || c === 'None';
}

/**
 * Phase 1: Extract field value using strict lookahead stop boundaries.
 * Captures text after `label` until the next known label or end-of-string.
 */
function extractField(label: string, text: string, maxLen = 500): string | null {
  const escaped = escapeRe(label);
  const re = new RegExp(`${escaped}\\s*(.+?)(?=\\s*(?:${STOP_PATTERN})|$)`, 'i');
  const m = text.match(re);
  if (!m?.[1]) return null;
  const val = cleanInvisible(m[1]).trim();
  if (!val || isEmptyValue(val)) return null;
  if (val.length > maxLen) return null; // too long → likely leaked content
  return val;
}

// ============================================
// PHASE 2: PASSENGER COUNT
// ============================================

/**
 * Extract total passenger count from "Travelers: X Adults, Y Children".
 * Never defaults to 1 — returns null if no evidence.
 */
function extractPassengers(text: string): number | null {
  const m = text.match(/Travelers:\s*(\d+)\s*Adults?(?:,\s*(\d+)\s*Child(?:ren)?)?/i);
  if (!m) return null;
  const adults = parseInt(m[1]) || 0;
  const children = parseInt(m[2] || '0') || 0;
  const total = adults + children;
  return total > 0 ? total : null;
}

// ============================================
// PHASE 3: PHONE NUMBER EXTRACTION
// ============================================

/** Normalize phone to E.164 format (+1XXXXXXXXXX) */
function normalizeE164(raw: string): string {
  let cleaned = raw.trim();
  // Strip leading 0 if preceded by +44 (UK), +61 (AU), or +33 (FR)
  cleaned = cleaned.replace(/^(\+(?:44|61|33))\s*0(\d+)/, '$1$2');
  const digits = cleaned.replace(/[^\d]/g, '');
  if (digits.length >= 10) return `+${digits}`;
  return digits;
}

/**
 * Extract phone from "Phone: (Alternate Phone)US+1 XXXXXXXXXX" or "AU+61 XXXXXXXXXX", etc.
 * Strips (Alternate Phone), 2-letter country prefix (AU, US, GB, ES, etc.), normalizes to E.164.
 */
function extractPhone(text: string): string | null {
  const m = text.match(/Phone:\s*(?:\(Alternate Phone\))?\s*(?:[A-Za-z]{2})?\s*(\+?[\d][\d\s()+-]{6,})/i);
  if (!m?.[1]) return null;
  const norm = normalizeE164(m[1]);
  return norm.length >= 8 ? norm : null;
}

// ============================================
// PHASE 4: ADDRESS EXTRACTION
// ============================================

/** Strip leaked labels, trailing noise, embedded phone numbers */
function cleanAddress(addr: string): string {
  let c = cleanInvisible(addr).trim();
  // Trim leaked labels that bled into address value
  c = c.replace(/\s*(Arrival|Departure|Boarding Time|Arrival Flight|Departure Flight|Booking Details|Special Requirements|Send the customer).*$/i, '').trim();
  // Strip embedded venue phone numbers like "(ph: +34 ...)" or "ph: +34 ..." or phone numbers
  c = c.replace(/\s*\(?ph:[^)]*\)?/gi, '').trim();
  // Normalize airport name
  c = c.replace(/Barcelona-El Prat Airport(,\s*08820\s*El Prat de Llobregat\s*Spain)?/gi, 'Barcelona-El Prat Airport (BCN)');
  // Remove trailing punctuation
  c = c.replace(/[,;:\s]+$/, '').trim();
  return c;
}

/**
 * Extract pickup address.
 * Priority: Hotel Pickup → Pick up Location (stripped of "Accommodations in").
 */
function extractPickup(text: string): string | null {
  // Primary: Hotel Pickup (contains full address with city/country)
  let val = extractField('Hotel Pickup:', text, 300);
  if (val) {
    val = val.replace(/\s*\(ph:[^)]*\)/gi, '').trim();
    val = val.replace(/My hotel is not yet booked:?\s*/i, '').trim();
    if (isEmptyValue(val)) val = null;
  }
  // Secondary: Pick up Location (display name, strip "Accommodations in" prefix)
  if (!val) {
    val = extractField('Pick up Location:', text, 300);
    if (val) val = val.replace(/^Accommodations in\s*/i, '').trim();
  }
  // Tertiary: Pickup Point/Meeting point (used when not decided yet)
  if (!val) {
    val = extractField('Pickup Point/Meeting point:', text, 300);
  }
  
  // If the extracted value contains the placeholder text, return null so it can fallback to Cruise Port/Airport
  if (val && val.toLowerCase().includes('traveler has not decided')) {
    val = null;
  }
  
  return val ? cleanAddress(val) : null;
}

/** Extract dropoff address from "Drop Off Location:" */
function extractDropoff(text: string): string | null {
  const val = extractField('Drop Off Location:', text, 300);
  return val ? cleanAddress(val) : null;
}

// ============================================
// PHASE 5: FLIGHT DATA EXTRACTION
// ============================================

interface FlightInfo {
  number: string;
  airline: string;
  type: 'arrival' | 'departure';
}

/**
 * Extract flight number + airline from Arrival/Departure fields.
 * Tries arrival first, then departure.
 */
function extractFlightData(text: string): FlightInfo | null {
  // Try arrival
  let num = extractField('Arrival Flight No:', text, 30);
  let air = extractField('Arrival Airline:', text, 100);
  if (num) return { number: num, airline: air || '', type: 'arrival' };

  // Try departure
  num = extractField('Departure Flight No:', text, 30);
  air = extractField('Departure Airline:', text, 100);
  if (num) return { number: num, airline: air || '', type: 'departure' };

  return null;
}

// ============================================
// PHASE 6: TIME ENGINE
// ============================================

/**
 * Extract pickup time from Tour Grade Code (e.g., TG1~09:30 → "09:30").
 * Rejects "00:00" as a valid pickup time (flags for review).
 */
function extractTourGradeTime(text: string): { time: string; code: string } | null {
  // Explicit "Tour Grade Code:" field
  const fieldMatch = text.match(/(?:Tour )?Grade Code:\s*(TG\d+[~\-:](\d{2}:\d{2}))/i);
  if (fieldMatch) return { time: fieldMatch[2], code: fieldMatch[1] };

  // If this is an amendment with "changed from ... to ... TG...":
  const changedToMatch = text.match(/changed\s+from\b.*?\bto\b.*?(TG\d+[~\-:](\d{2}:\d{2}))/i);
  if (changedToMatch) {
    return { time: changedToMatch[2], code: changedToMatch[1] };
  }

  // Fallback: scan body for all TG patterns and pick the last non-00:00 match if multiple
  const allMatches = [...text.matchAll(/TG\d+[~\-:](\d{2}:\d{2})/gi)];
  if (allMatches.length > 0) {
    const nonZero = allMatches.filter(m => m[1] !== '00:00');
    const best = nonZero.length > 0 ? nonZero[nonZero.length - 1] : allMatches[allMatches.length - 1];
    return { time: best[1], code: best[0] };
  }

  return null;
}

/** Extract flight arrival/departure times (stored separately from pickup) */
function extractFlightTimes(text: string): { arrival?: string; departure?: string } {
  return {
    arrival: extractField('Arrival Time:', text, 30) || undefined,
    departure: extractField('Departure Time:', text, 30) || undefined,
  };
}

// ============================================
// PHASE 7: CHRONOLOGICAL RECONSTRUCTION
// ============================================

function makeEvidence<T>(value: T, source: string, emailSubject: string, confidence: ConfidenceLevel): FieldEvidence<T> {
  return { value, source, email: emailSubject, matchedText: String(value), confidence };
}

/**
 * Confidence-ranked overwrite check.
 * Rule: NEVER overwrite HIGH confidence with LOW.
 * "Hotel Barcelona" (HIGH) always beats "Not Specified" (LOW).
 */
function shouldOverwrite<T>(existing: FieldEvidence<T> | undefined, incoming: FieldEvidence<T>): boolean {
  if (!existing) return true;
  const rank: Record<ConfidenceLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
  if (rank[incoming.confidence] < rank[existing.confidence]) return false;
  // Don't overwrite with placeholder values
  const v = String(incoming.value);
  if (!v || v === 'Not Specified' || v === 'N/A' || v === '' || v === 'No') return false;
  return true;
}

function setField<T>(state: BookingStateV2, key: keyof BookingStateV2, evidence: FieldEvidence<T>) {
  const existing = (state as any)[key] as FieldEvidence<T> | undefined;
  if (shouldOverwrite(existing, evidence)) {
    (state as any)[key] = evidence;
  }
}

const EVIDENCE_FIELDS: (keyof BookingStateV2)[] = [
  'travelDate', 'pickupTime', 'pickupAddress', 'dropoffAddress',
  'flightNumber', 'airline', 'flightArrivalTime', 'flightDepartureTime',
  'cruiseShip', 'disembarkationTime', 'customerName', 'passengerCount',
  'phoneNumber', 'tourGrade', 'tourName', 'customerNotes', 'netRate', 'email',
];

/** Phase 8: Names that should be rejected as invalid customer names */
const INVALID_NAMES = ['lead traveler', 'passenger', 'adult', 'child', 'customer', 'traveler'];

/**
 * Parse a new/original Viator booking email into BookingStateV2 fields.
 * Also used for cancellation emails (which contain booking details).
 */
export function parseBaseEmail(email: RawEmail): Partial<BookingStateV2> {
  const text = normalizeEmailText(email.body);
  const subj = email.subject || '';
  const result: Partial<BookingStateV2> = {};

  // Booking Reference
  const refMatch = subj.match(/#(BR-\d+)/i) || text.match(/Booking Reference:\s*#?(BR-\d+)/i) || subj.match(/\b(BR-\d+)\b/i) || text.match(/\b(BR-\d+)\b/i);
  if (refMatch) result.bookingRef = (refMatch[1] || refMatch[0]).toUpperCase();

  // Tour Name
  const tourName = extractField('Tour Name:', text, 200);
  if (tourName) result.tourName = makeEvidence(tourName, 'Tour Name', subj, 'HIGH');

  // Travel Date
  const travelDate = extractField('Travel Date:', text, 60);
  if (travelDate) result.travelDate = makeEvidence(travelDate, 'Travel Date', subj, 'HIGH');

  // Customer Name (Phase 8: reject invalid names)
  const name = extractField('Lead Traveler Name:', text, 100);
  if (name) {
    const trimmed = name.trim();
    const isInvalid = INVALID_NAMES.some(bad => trimmed.toLowerCase() === bad);
    result.customerName = makeEvidence(trimmed, 'Lead Traveler Name', subj, isInvalid ? 'LOW' : 'HIGH');
  }

  // Passenger Count (Phase 2)
  const pax = extractPassengers(text);
  if (pax) result.passengerCount = makeEvidence(pax, 'Travelers', subj, 'HIGH');

  // Phone (Phase 3)
  const phone = extractPhone(text);
  if (phone) result.phoneNumber = makeEvidence(phone, 'Phone', subj, 'HIGH');

  // Pickup Address (Phase 4)
  const pickup = extractPickup(text);
  if (pickup) result.pickupAddress = makeEvidence(pickup, 'Hotel Pickup', subj, 'HIGH');

  // Dropoff Address (Phase 4)
  const dropoff = extractDropoff(text);
  if (dropoff) result.dropoffAddress = makeEvidence(dropoff, 'Drop Off Location', subj, 'HIGH');

  // Flight Data (Phase 5)
  const flight = extractFlightData(text);
  if (flight) {
    result.flightNumber = makeEvidence(flight.number, `${flight.type} Flight No`, subj, 'HIGH');
    if (flight.airline) {
      result.airline = makeEvidence(flight.airline, `${flight.type} Airline`, subj, 'HIGH');
    }
  }

  // Flight Times (Phase 6 — stored separately from pickup)
  const flightTimes = extractFlightTimes(text);
  if (flightTimes.arrival) result.flightArrivalTime = makeEvidence(flightTimes.arrival, 'Arrival Time', subj, 'HIGH');
  if (flightTimes.departure) result.flightDepartureTime = makeEvidence(flightTimes.departure, 'Departure Time', subj, 'HIGH');

  // Cruise Ship
  const cruise = extractField('Cruise Ship:', text, 100);
  if (cruise) result.cruiseShip = makeEvidence(cruise, 'Cruise Ship', subj, 'HIGH');

  // Disembarkation Time
  const disembark = extractField('Disembarkation Time:', text, 30);
  if (disembark) result.disembarkationTime = makeEvidence(disembark, 'Disembarkation Time', subj, 'HIGH');

  // Tour Grade (Phase 6 — derive pickup time from TG code)
  const tg = extractTourGradeTime(text);
  if (tg) {
    result.tourGrade = makeEvidence(tg.code, 'Tour Grade Code', subj, 'HIGH');
    if (tg.time !== '00:00') {
      result.pickupTime = makeEvidence(tg.time, 'Tour Grade Code', subj, 'HIGH');
    }
  }

  // Special Requirements
  const notes = extractField('Special Requirements:', text, 500);
  if (notes && notes.toLowerCase() !== 'no' && notes.toLowerCase() !== 'none') {
    result.customerNotes = makeEvidence(notes, 'Special Requirements', subj, 'HIGH');
  }

  // Net Rate
  const rate = extractField('Net Rate:', text, 50);
  if (rate) result.netRate = makeEvidence(rate, 'Net Rate', subj, 'HIGH');

  // Cancellation from subject
  if (/cancel/i.test(subj)) {
    result.status = makeEvidence('Cancelled', 'Email Subject', subj, 'HIGH');
  }

  return result;
}

/**
 * Parse a Viator amendment email.
 * Extracts "• LABEL changed from OLD to NEW ." patterns,
 * plus re-scans for Tour Grade Code.
 */
export function parseAmendmentEmail(email: RawEmail): Partial<BookingStateV2> {
  const text = normalizeEmailText(email.body);
  const subj = email.subject || '';
  
  // Inherit all base booking details from the email body (Customer name, dates, phones, addresses)
  const baseResult = parseBaseEmail(email);
  const result: Partial<BookingStateV2> = { ...baseResult };

  // Booking ref from amendment body
  const refMatch = text.match(/Booking Reference:\s*#?(BR-\d+)/i);
  if (refMatch) result.bookingRef = refMatch[1];

  // Parse "• FIELD changed from VALUE to VALUE ." items ONLY in the changelog header section
  const changelogSection = text.split(/Booking Details|Booking Reference:/i)[0] || text;
  const items = changelogSection.split('•').filter(s => /changed\s+from\b/i.test(s));

  for (const item of items) {
    // Regex: LABEL changed from [OLD_VALUE] to NEW_VALUE
    const m = item.match(/(.+?)\s+changed\s+from\b.*?\bto\s+(.+)/i);
    if (!m) continue;

    const label = m[1].trim();
    let newValue = cleanInvisible(m[2]).trim();
    // Strip trailing period and bracketed links
    newValue = newValue.replace(/\s*\[https?:\/\/[^\]]+\]/gi, '').replace(/\s*\.\s*$/, '').trim();
    if (!newValue || isEmptyValue(newValue)) continue;

    // Map amendment label → state field
    if (/Departure Airline/i.test(label) || /Arrival Airline/i.test(label)) {
      result.airline = makeEvidence(newValue, `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Departure Flight No/i.test(label) || /Arrival Flight No/i.test(label)) {
      result.flightNumber = makeEvidence(newValue, `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Drop Off Location/i.test(label)) {
      result.dropoffAddress = makeEvidence(cleanAddress(newValue), `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Pick up Location/i.test(label) || /Hotel Pickup/i.test(label)) {
      result.pickupAddress = makeEvidence(cleanAddress(newValue), `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Departure Time/i.test(label)) {
      result.flightDepartureTime = makeEvidence(newValue, `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Arrival Time/i.test(label)) {
      result.flightArrivalTime = makeEvidence(newValue, `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Disembarkation Time/i.test(label) || /Disembark/i.test(label)) {
      const cleanDisembark = newValue.split(/[\s\.\,\[]/)[0] || newValue;
      result.disembarkationTime = makeEvidence(cleanDisembark, `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Cruise Ship/i.test(label)) {
      result.cruiseShip = makeEvidence(newValue, `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Travel Date/i.test(label)) {
      result.travelDate = makeEvidence(newValue, `Amendment: ${label}`, subj, 'HIGH');
    } else if (/Traveler|Passenger/i.test(label)) {
      const count = parseInt(newValue);
      if (!isNaN(count) && count > 0) {
        result.passengerCount = makeEvidence(count, `Amendment: ${label}`, subj, 'HIGH');
      }
    } else if (/Tour Grade/i.test(label)) {
      const tgMatch = newValue.match(/(TG\d+[~\-:](\d{2}:\d{2}))/i);
      if (tgMatch) {
        result.tourGrade = makeEvidence(tgMatch[1], `Amendment: ${label}`, subj, 'HIGH');
        if (tgMatch[2] !== '00:00') {
          result.pickupTime = makeEvidence(tgMatch[2], `Amendment: ${label}`, subj, 'HIGH');
        }
      } else {
        const timeMatch = newValue.match(/\b(\d{1,2}:\d{2})\b/);
        if (timeMatch && timeMatch[1] !== '00:00') {
          result.pickupTime = makeEvidence(timeMatch[1], `Amendment: ${label}`, subj, 'HIGH');
        }
      }
    }
  }

  // Re-extract TG code from amendment body
  const tg = extractTourGradeTime(text);
  if (tg) {
    result.tourGrade = makeEvidence(tg.code, 'Amendment Tour Grade', subj, 'HIGH');
    if (tg.time !== '00:00') {
      result.pickupTime = makeEvidence(tg.time, 'Amendment Tour Grade', subj, 'HIGH');
    }
  }

  // Cancellation
  if (/cancel/i.test(subj)) {
    result.status = makeEvidence('Cancelled', 'Email Subject', subj, 'HIGH');
  }

  return result;
}

/**
 * Phase 7 + 9: Reconstruct final booking state from chronologically sorted emails.
 * Applies base → amendments → cancellations in order.
 * Phase 9: Once cancelled, NEVER un-cancel from a re-parsed original email.
 */
export function reconstructBooking(emails: RawEmail[]): BookingStateV2 {
  const sorted = [...emails].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  if (sorted.length === 0) {
    return { bookingRef: '', bookingHistory: [], requiresReview: true, reviewReasons: ['No emails found'] };
  }

  const state: BookingStateV2 = {
    bookingRef: '',
    bookingHistory: [],
    requiresReview: false,
    reviewReasons: [],
  };

  for (const email of sorted) {
    const subj = email.subject || '';
    const isCancellation = /cancel/i.test(subj);
    const isAmendment = /amend/i.test(subj);

    let updates: Partial<BookingStateV2>;

    if (isCancellation) {
      // Phase 9: If already cancelled, skip duplicate
      if (state.status?.value === 'Cancelled') {
        state.bookingHistory.push({ date: email.receivedAt, type: 'Cancellation', summary: 'Duplicate cancellation ignored' });
        continue;
      }
      updates = parseBaseEmail(email);
      state.status = makeEvidence('Cancelled', 'Email Subject', subj, 'HIGH');
      state.bookingHistory.push({ date: email.receivedAt, type: 'Cancellation', summary: 'Booking cancelled' });
    } else if (isAmendment) {
      updates = parseAmendmentEmail(email);
      state.bookingHistory.push({ date: email.receivedAt, type: 'Amendment', summary: `Amendment: ${subj}` });
    } else {
      updates = parseBaseEmail(email);
      state.bookingHistory.push({ date: email.receivedAt, type: 'New Booking', summary: 'Initial booking' });
    }

    // Set booking ref from first email that has one
    if (updates.bookingRef && !state.bookingRef) state.bookingRef = updates.bookingRef;

    // Apply field updates using confidence-ranked overwrite
    for (const key of EVIDENCE_FIELDS) {
      const incoming = (updates as any)[key] as FieldEvidence<any> | undefined;
      if (incoming) setField(state, key, incoming);
    }

    // Phase 9: Status — only update if not already cancelled
    if (updates.status && state.status?.value !== 'Cancelled') {
      state.status = updates.status;
    }
  }

  // Phase 6: Pickup time fallbacks
  if (!state.pickupTime?.value || state.pickupTime.value === '00:00') {
    if (state.disembarkationTime?.value && !isEmptyValue(state.disembarkationTime.value)) {
      state.pickupTime = { ...state.disembarkationTime, source: 'Disembarkation Fallback', confidence: 'MEDIUM' };
    } else if (state.flightArrivalTime?.value && !isEmptyValue(state.flightArrivalTime.value)) {
      state.pickupTime = { ...state.flightArrivalTime, source: 'Flight Arrival Fallback', confidence: 'MEDIUM' };
    } else {
      state.requiresReview = true;
      state.reviewReasons.push('No valid pickup time found');
    }
  }

  // Fallback: Infer missing pickup / dropoff from Tour Name / Product Name
  const tourName = state.tourName?.value || '';
  const shipName = state.cruiseShip?.value && !isEmptyValue(state.cruiseShip.value) ? state.cruiseShip.value.trim() : '';
  const cruisePortLabel = shipName ? `Cruise Port (${shipName})` : 'Cruise Port';
  const airportLabel = 'Barcelona-El Prat Airport (BCN)';

  const hasPickup = state.pickupAddress?.value && !isEmptyValue(state.pickupAddress.value);
  const hasDropoff = state.dropoffAddress?.value && !isEmptyValue(state.dropoffAddress.value);

  if (tourName) {
    const tourLower = tourName.toLowerCase();
    const isAirport = tourLower.includes('airport') || tourLower.includes('aeropuerto') || tourLower.includes('bcn');
    const isCruise = tourLower.includes('cruise') || tourLower.includes('port') || tourLower.includes('puerto');
    const isArrival = tourLower.includes('arrival') || tourLower.includes('llegada') || tourLower.includes('from airport') || tourLower.includes('from cruise');
    const isDeparture = tourLower.includes('departure') || tourLower.includes('salida') || tourLower.includes('to airport') || tourLower.includes('to cruise');

    // Case 1: Airport <-> Cruise Port
    if (isAirport && isCruise) {
      if (isArrival || tourLower.includes('airport to cruise')) {
        if (!hasPickup) state.pickupAddress = makeEvidence(airportLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
        if (!hasDropoff) state.dropoffAddress = makeEvidence(cruisePortLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
      } else if (isDeparture || tourLower.includes('cruise to airport')) {
        if (!hasPickup) state.pickupAddress = makeEvidence(cruisePortLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
        if (!hasDropoff) state.dropoffAddress = makeEvidence(airportLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
      }
    }
    // Case 2: Airport <-> City/Hotel
    else if (isAirport) {
      if (isArrival || tourLower.includes('airport to') || tourLower.includes('from airport')) {
        if (!hasPickup) state.pickupAddress = makeEvidence(airportLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
      } else if (isDeparture || tourLower.includes('to airport') || tourLower.includes('from city') || tourLower.includes('from hotel')) {
        if (!hasDropoff) state.dropoffAddress = makeEvidence(airportLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
      }
    }
    // Case 3: Cruise Port <-> City/Hotel
    else if (isCruise) {
      if (isArrival || tourLower.includes('from cruise') || tourLower.includes('cruise to')) {
        if (!hasPickup) state.pickupAddress = makeEvidence(cruisePortLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
      } else if (isDeparture || tourLower.includes('to cruise') || tourLower.includes('from city') || tourLower.includes('from hotel')) {
        if (!hasDropoff) state.dropoffAddress = makeEvidence(cruisePortLabel, 'Tour Name Fallback', tourName, 'MEDIUM');
      }
    }
  }

  applyValidation(state);
  return state;
}

// ============================================
// VALIDATION
// ============================================

export function applyValidation(state: BookingStateV2) {
  const leakPatterns = ['changed from', 'Booking Details', 'undefined', 'null', '⁨⁩', 'Questions?', 'Send the customer'];
  const checkFields: (keyof BookingStateV2)[] = ['pickupAddress', 'dropoffAddress', 'customerNotes', 'pickupTime', 'flightDepartureTime'];

  for (const key of checkFields) {
    const evidence = (state as any)[key] as FieldEvidence<string> | undefined;
    if (!evidence?.value) continue;
    for (const leak of leakPatterns) {
      if (evidence.value.toLowerCase().includes(leak.toLowerCase())) {
        state.requiresReview = true;
        state.reviewReasons.push(`Field ${key} contains leak: "${leak}"`);
      }
    }
  }

  // Route validation
  if (state.flightArrivalTime?.value) {
    if (state.pickupAddress?.value && !state.pickupAddress.value.toLowerCase().includes('airport') && !state.pickupAddress.value.toLowerCase().includes('aeropuerto')) {
      state.requiresReview = true;
      state.reviewReasons.push('Route Validation: Has Flight Arrival but pickup is not Airport');
    }
  }
  if (state.flightDepartureTime?.value) {
    if (state.dropoffAddress?.value && !state.dropoffAddress.value.toLowerCase().includes('airport') && !state.dropoffAddress.value.toLowerCase().includes('aeropuerto')) {
      state.requiresReview = true;
      state.reviewReasons.push('Route Validation: Has Flight Departure but dropoff is not Airport');
    }
  }

  // Passenger validation
  if (state.passengerCount?.value && state.passengerCount.value <= 0) {
    state.requiresReview = true;
    state.reviewReasons.push('Passenger count is 0 or invalid');
  }
}

// ============================================
// PHASE 8: FIRESTORE SAFETY
// ============================================

/**
 * Compare existing Firestore value against newly parsed value.
 * Decision: keep the highest confidence data, never downgrade.
 */
export function compareAndChooseBest(
  firestoreVal: any,
  parsedVal: any,
  parsedConfidence: ConfidenceLevel
): { value: any; reason: string } {
  // Empty parsed → keep existing
  if (parsedVal === undefined || parsedVal === null || parsedVal === '' || parsedVal === 'N/A' || parsedVal === 'Not Specified') {
    return { value: firestoreVal, reason: 'Parsed empty, keep existing' };
  }
  // Empty existing → use parsed
  if (!firestoreVal || firestoreVal === '' || firestoreVal === 'Not Specified' || firestoreVal === 'N/A') {
    return { value: parsedVal, reason: 'Existing empty, use parsed' };
  }
  // LOW/UNKNOWN confidence → keep existing
  if (parsedConfidence === 'LOW' || parsedConfidence === 'UNKNOWN') {
    return { value: firestoreVal, reason: `Parsed confidence ${parsedConfidence}, keep existing` };
  }
  // HIGH/MEDIUM → update
  return { value: parsedVal, reason: `Parsed confidence ${parsedConfidence}, update` };
}

/** Sanitize field value for Firestore: strip leaked text, invisible chars, validate length */
export function cleanFieldValue(val?: string, maxLen: number = 200): string {
  if (!val) return '';
  let clean = cleanInvisible(val)
    .replace(/changed\s+from\s+.*?\s+to\s+/gi, '')
    .replace(/\[Not Applicable\]/gi, '')
    .replace(/Booking Details.*/gi, '')
    .trim();
  if (clean.toLowerCase() === 'undefined' || clean.toLowerCase() === 'null') return '';
  if (clean.length > maxLen) clean = clean.substring(0, maxLen).trim();
  return clean;
}

/**
 * Convert BookingStateV2 to flat Firestore document.
 * Phase 8: rejects invalid customer names.
 */
export function toFirestoreDoc(state: BookingStateV2): Record<string, any> {
  const pickup = cleanFieldValue(state.pickupAddress?.value, 200);
  const dropoff = cleanFieldValue(state.dropoffAddress?.value, 200);
  const notes = cleanFieldValue(state.customerNotes?.value, 500);
  const phone = state.phoneNumber?.value || '';
  const flight = cleanFieldValue(state.flightNumber?.value, 50);
  const airline = cleanFieldValue(state.airline?.value, 100);
  const netRate = cleanFieldValue(state.netRate?.value, 50);
  const parsedPrice = normalizePrice(netRate);

  // Phase 8: Reject invalid customer names
  let customerName = cleanFieldValue(state.customerName?.value, 100);
  if (INVALID_NAMES.some(bad => customerName.toLowerCase() === bad)) {
    customerName = '';
  }

  return {
    bookingId: state.bookingRef,
    customerName: customerName || '',
    phone,
    date: state.travelDate?.value || '',
    time: state.pickupTime?.value || '',
    pickupTime: state.pickupTime?.value || '',
    pickup: pickup || 'Not Specified',
    pickupLocation: pickup || 'Not Specified',
    dropoff: dropoff || 'Not Specified',
    dropOff: dropoff || 'Not Specified',
    flight,
    flightNumber: flight,
    airline,
    price: parsedPrice || 0,
    netRate: netRate || '',
    flightArrival: cleanFieldValue(state.flightArrivalTime?.value, 50),
    flightArrivalTime: cleanFieldValue(state.flightArrivalTime?.value, 50),
    flightDeparture: cleanFieldValue(state.flightDepartureTime?.value, 50),
    flightDepartureTime: cleanFieldValue(state.flightDepartureTime?.value, 50),
    cruiseShip: cleanFieldValue(state.cruiseShip?.value, 100),
    disembarkTime: cleanFieldValue(state.disembarkationTime?.value, 50),
    passengers: state.passengerCount?.value || 0,
    travelers: String(state.passengerCount?.value || 0),
    notes,
    customerNotes: notes,
    status: state.status?.value?.toLowerCase() === 'cancelled' ? 'CANCELLED' : 'confirmed',
    tourGradeCode: state.tourGrade?.value || '',
    requiresReview: state.requiresReview || false,
    reviewReasons: state.reviewReasons || [],
    bookingHistory: state.bookingHistory || [],
    source: 'viator-email',
    parserVersion: '2.1.0',
    updatedAt: new Date().toISOString(),
  };
}

// Legacy export aliases for backward compatibility
export { STOP_LABELS as KNOWN_LABELS };
export interface GetFieldResult {
  value: string | null;
  matchedText: string | null;
  exceededLength: boolean;
}
export function getField(label: string, text: string, maxLength: number): GetFieldResult {
  const val = extractField(label + ':', normalizeEmailText(text), maxLength);
  return { value: val, matchedText: val, exceededLength: false };
}
