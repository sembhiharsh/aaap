/**
 * Centralized Booking Data Formatters & Normalizers
 * Viator Admin & Email Integration
 */

export type Locale = "en" | "es" | "ca";

// ============================================
// 1. TIME PARSING & FORMATTING
// ============================================

/**
 * Normalizes any raw time input into standard 24h format "HH:mm".
 * Handles formats like: "10:30 AM", "10:30AM", "10.30", "22:30", "8:00 p.m.", "8:00p.m.", "10:30 AM A", "1030", "800pm", "10:30:00"
 */
export function normalizeTime(rawTime: any): string {
  if (!rawTime || typeof rawTime !== "string") return "";
  let str = rawTime.trim();
  if (!str || str === 'N/A' || str === 'Not Specified') return "";

  // If string contains an embedded time (e.g. "Flight Arrival: 9:45 am"), extract it
  const embeddedMatch = str.match(/(\d{1,2}:\d{2}\s*(?:[AP]M)?|\d{1,2}\s+(?:am|pm)|\d{1,2}(?:am|pm))/i);
  if (embeddedMatch && embeddedMatch[0] !== str.trim()) {
    str = embeddedMatch[1].trim();
  }

  // Strip boarding or extra parenthetical notes if present (e.g. "10:30 (Boarding: 10:00)")
  const boardMatch = str.match(/^([^(]+)/);
  if (boardMatch) str = boardMatch[1].trim();

  // Clean trailing artifacts like "AM A" -> "AM", "p.m." -> "pm", etc.
  str = str.replace(/\b([ap]\.?m\.?)\s+[a-z]\b/gi, '$1');
  str = str.replace(/p\.?m\.?/gi, 'pm').replace(/a\.?m\.?/gi, 'am');
  str = str.replace(/\s+/g, ' ');

  // Bare hour with AM/PM: "6 am", "7am", "9 pm"
  const BareHourMatch = str.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (BareHourMatch) {
    let hours = parseInt(BareHourMatch[1], 10);
    const ampm = BareHourMatch[2].toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:00`;
  }

  // 12-hour match with colon or dot: e.g. "10:30 am", "8.00 pm", "10:30am"
  const TwelveHourMatch = str.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)$/i);
  if (TwelveHourMatch) {
    let hours = parseInt(TwelveHourMatch[1], 10);
    const minutes = TwelveHourMatch[2];
    const ampm = TwelveHourMatch[3].toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${minutes}`;
  }

  // 12-hour match without separator: e.g. "1030am", "800pm", "1030 am"
  const TwelveHourNoSepMatch = str.match(/^(\d{3,4})\s*(am|pm)$/i);
  if (TwelveHourNoSepMatch) {
    const digits = TwelveHourNoSepMatch[1];
    const ampm = TwelveHourNoSepMatch[2].toLowerCase();
    let hours = parseInt(digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2), 10);
    const minutes = digits.slice(-2);
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${minutes}`;
  }

  // 24-hour match with colon or dot: e.g. "22:30", "08.00", "10:30:00"
  const TwentyFourMatch = str.match(/^(\d{1,2})[:.](\d{2})(?:[:.] \d{2})?$/);
  if (TwentyFourMatch) {
    const hours = parseInt(TwentyFourMatch[1], 10);
    const minutes = TwentyFourMatch[2];
    if (hours >= 0 && hours < 24) {
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
  }

  // Raw digits 1-2 length without AM/PM: e.g. "9", "12", "07"
  if (/^\d{1,2}$/.test(str)) {
    const hours = parseInt(str, 10);
    if (hours >= 0 && hours < 24) {
      return `${String(hours).padStart(2, '0')}:00`;
    }
  }

  // Raw digits 3-4 length without AM/PM: e.g. "1030", "0800", "800"
  if (/^\d{3,4}$/.test(str)) {
    let hours = parseInt(str.length === 3 ? str.slice(0, 1) : str.slice(0, 2), 10);
    const minutes = str.slice(-2);
    if (hours >= 0 && hours < 24) {
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
  }

  return str;
}


/**
 * Formats standard 24h "HH:mm" time into clean localized display format.
 * EN: "10:30 AM", "8:00 PM"
 * ES / CA: "10:30", "20:00"
 */
export function formatTimeDisplay(timeStr: any, locale: Locale = "en"): string {
  const norm = normalizeTime(timeStr);
  if (!norm) return "—";

  const match = norm.match(/^(\d{2}):(\d{2})$/);
  if (!match) return norm;

  const hhNum = parseInt(match[1], 10);
  const mm = match[2];

  if (locale === "en") {
    const period = hhNum >= 12 ? "PM" : "AM";
    let displayHour = hhNum % 12;
    if (displayHour === 0) displayHour = 12;
    return `${displayHour}:${mm} ${period}`;
  }

  // 24-hour clock for Spanish / Catalan
  return `${String(hhNum).padStart(2, '0')}:${mm}`;
}

// ============================================
// 2. DATE PARSING & FORMATTING
// ============================================

/**
 * Normalizes various raw date strings into standard ISO "YYYY-MM-DD".
 * Supports: "01/07/2026", "1 July 2026", "July 1, 2026", "2026-07-01", "01-07-2026", "2026/07/01"
 */
export function normalizeDate(rawDate: any): string {
  if (!rawDate || typeof rawDate !== "string") return "";
  let str = rawDate.trim();
  
  // Strip common trailing artifacts from bad parses
  str = str.replace(/(?:Lead )?Traveler Names?:?.*/gi, '').trim();

  if (!str) return "";

  // 1. Check YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const yyyy = ymdMatch[1];
    const mm = String(parseInt(ymdMatch[2], 10)).padStart(2, '0');
    const dd = String(parseInt(ymdMatch[3], 10)).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // 2. Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const dd = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
    const mm = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
    const yyyy = dmyMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // 3. Fallback to JS Date parsing
  try {
    let dateStr = str;
    if (!/\d{4}/.test(dateStr)) {
      dateStr = `${dateStr} ${new Date().getFullYear()}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch {}

  return str;
}

/**
 * Converts date string (e.g. "2026-07-01") into Date object safely
 */
export function parseDateObj(dateStr: any): Date | null {
  const norm = normalizeDate(dateStr);
  if (!norm) return null;

  const parts = norm.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Formats normalized "YYYY-MM-DD" date for display per locale.
 * EN: "Wed, Jul 1, 2026"
 * ES: "Mié, 1 Jul 2026"
 * CA: "Dc., 1 Jul 2026"
 */
export function formatDateDisplay(dateStr: any, locale: Locale = "en"): string {
  const dateObj = parseDateObj(dateStr);
  if (!dateObj) return dateStr || "—";

  const locMap: Record<Locale, string> = {
    en: 'en-US',
    es: 'es-ES',
    ca: 'ca-ES',
  };

  const formatted = dateObj.toLocaleDateString(locMap[locale] || 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Capitalize first letter of weekday in ES/CA (e.g., "mié." -> "Mié")
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Combines Date & Time into standard single localized string.
 * EN: "Wed, Jul 1, 2026 • 10:30 AM"
 * ES: "Mié, 1 Jul 2026 • 10:30"
 * CA: "Dc., 1 Jul 2026 • 10:30"
 */
export function formatDateTimeCombined(dateStr: any, timeStr: any, locale: Locale = "en"): string {
  const formattedDate = formatDateDisplay(dateStr, locale);
  const formattedTime = formatTimeDisplay(timeStr, locale);

  if (!formattedDate || formattedDate === "—") return formattedTime || "—";
  if (!formattedTime || formattedTime === "—") return formattedDate;

  return `${formattedDate} • ${formattedTime}`;
}

/**
 * Banner Header Date Formatter (e.g., "1 JULY 2026" or "1 JULIO 2026")
 */
export function formatDateHeaderDisplay(dateStr: any, locale: Locale = "en"): string {
  const dateObj = parseDateObj(dateStr);
  if (!dateObj) return dateStr || "No Date";

  const locMap: Record<Locale, string> = {
    en: 'en-GB',
    es: 'es-ES',
    ca: 'ca-ES',
  };

  const formatted = dateObj.toLocaleDateString(locMap[locale] || 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return formatted.toUpperCase();
}

// ============================================
// 3. CUSTOMER NAME NORMALIZATION
// ============================================

/**
 * Normalizes customer names:
 * - Capitalizes each word ("john doe" -> "John Doe")
 * - Strips noise ("Lead Traveler Name:", "Pax", "Adults", numbers, links)
 * - Deduplicates repetitive strings ("Craig Hardman Craig Hardman" -> "Craig Hardman")
 */
export function normalizeCustomerName(name: any): string {
  if (!name || typeof name !== "string") return "Customer";
  
  let cleaned = name
    .replace(/\([^)]*\)/g, '') // remove parentheticals like (Adults: 2)
    .replace(/Lead Traveler Names?:?/gi, '')
    .replace(/Traveler Names?:?/gi, '')
    .replace(/Lead traveler:?/gi, '')
    .replace(/Customer:?/gi, '')
    .replace(/Adults?/gi, '')
    .replace(/Pax/gi, '')
    .replace(/\d+/g, '')
    .replace(/http\S+/g, '')
    .replace(/[^a-zA-Z\s'-]/g, '')
    .trim();

  // Deduplicate repeated names like "Craig Hardman Craig Hardman"
  cleaned = cleaned.replace(/(.+?)\s+\1\b/gi, '$1').trim();

  if (!cleaned) return "Customer";

  // Capitalize each word nicely
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================
// 4. PRICE PARSING & FORMATTING
// ============================================

/**
 * Converts any price string (€37.50, 37,50 €, EUR 78,72) into a numeric float.
 */
export function normalizePrice(price: any): number {
  if (typeof price === "number") return isNaN(price) ? 0 : price;
  if (!price) return 0;

  const str = String(price).trim();
  const match = str.match(/[\d.,]+/);
  if (!match) return 0;

  let cleaned = match[0];
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/,/g, '.');
  }

  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Formats price as €37.50
 */
export function formatPriceDisplay(price: any): string {
  const num = normalizePrice(price);
  return `€${num.toFixed(2)}`;
}

// ============================================
// 5. VEHICLE NORMALIZATION
// ============================================

/**
 * Standardizes vehicle strings to: "Economy" | "Business" | "Executive" | "Van" | "Minibus"
 */
export function normalizeVehicle(vehicle: any): string {
  if (!vehicle || typeof vehicle !== "string") return "Economy";
  const lower = vehicle.toLowerCase().trim();

  if (lower.includes("minibus") || /\bminibus\b|\bbus\b/.test(lower)) return "Minibus";
  if (lower.includes("van") || lower.includes("minivan")) return "Van";
  if (lower.includes("exec") || lower.includes("luxury")) return "Executive";
  if (lower.includes("business") || lower.includes("biz")) return "Business";
  return "Economy";
}

// ============================================
// 6. STATUS NORMALIZATION
// ============================================

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "pending_payment";

/**
 * Standardizes status strings to canonical status enum keys
 */
export function normalizeStatus(status: any): BookingStatus {
  if (!status || typeof status !== "string") return "confirmed";
  const lower = status.toLowerCase().trim();

  if (lower === "completed") return "completed";
  if (lower === "cancelled" || lower === "canceled") return "cancelled";
  if (lower === "pending_payment" || lower === "pending") return "pending_payment";
  return "confirmed";
}

/**
 * Display label for status
 */
export function formatStatusDisplay(status: any): string {
  const norm = normalizeStatus(status);
  switch (norm) {
    case "confirmed": return "Confirmed";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    case "pending_payment": return "Pending";
  }
}

// ============================================
// 7. BOOKING REFERENCE NORMALIZATION
// ============================================

export function normalizeBookingRef(ref: any): string {
  if (!ref || typeof ref !== "string") return "";
  const cleaned = ref.trim().toUpperCase().replace(/^BR-?/, '');
  return `BR-${cleaned}`;
}

// ============================================
// 8. LOCATION CLEANING
// ============================================

export function cleanLocation(addr: any): string {
  if (!addr || typeof addr !== "string") return "Not Specified";
  const cleaned = addr.replace(/["']/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.toLowerCase() === "not specified" || cleaned.toLowerCase() === "n/a") {
    return "Not Specified";
  }
  return cleaned;
}
