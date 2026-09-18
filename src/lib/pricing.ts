// src/lib/pricing.ts
import { loadGoogleMapsScript } from './geocoding/provider';

export interface FareResult {
  price: number;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSENGER RATE (€/km) — exported for display use
// ─────────────────────────────────────────────────────────────────────────────
export function getPerKmRate(passengers: number): number {
  if (passengers <= 2) return 2.5;
  if (passengers === 3) return 3.5;
  if (passengers === 4) return 4.5;
  return 6.5; // 5+ passengers
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE DISTANCE LOOKUP
// Approximate driving km for known BCN transfer routes.
// Exported so the UI resolves distance from pickup/dropoff strings.
// ─────────────────────────────────────────────────────────────────────────────
export async function getGoogleRouteDistanceKm(pickup: string, dropoff: string, pickupPlaceId?: string, dropoffPlaceId?: string): Promise<number> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLACES_API_KEY;
  if (!apiKey) throw new Error("No API key available for Google Maps Distance Matrix");

  const google = await loadGoogleMapsScript(apiKey);
  const service = new google.maps.DistanceMatrixService();

  return new Promise((resolve, reject) => {
    // Strictly pass the Place ID if we have it, otherwise fallback to the exact string
    const origin = pickupPlaceId ? { placeId: pickupPlaceId } : pickup;
    const destination = dropoffPlaceId ? { placeId: dropoffPlaceId } : dropoff;

    const requestPayload = {
      origins: [origin],
      destinations: [destination],
      travelMode: google.maps.TravelMode.DRIVING,
    };

    service.getDistanceMatrix(requestPayload, (response: any, status: any) => {
      
      // Helper function to retry with plain strings
      const retryWithStrings = () => {
        console.warn(`DistanceMatrix failed with placeIds (Status: ${status}), retrying with text strings...`);
        service.getDistanceMatrix({
          origins: [pickup],
          destinations: [dropoff],
          travelMode: google.maps.TravelMode.DRIVING,
        }, (retryResponse: any, retryStatus: any) => {
          if (retryStatus !== 'OK') return reject(new Error(`DistanceMatrix text retry failed: ${retryStatus}`));
          const retryElement = retryResponse?.rows?.[0]?.elements?.[0];
          if (!retryElement || retryElement.status !== 'OK') {
            return reject(new Error(`DistanceMatrix text retry element failed: ${retryElement?.status}`));
          }
          resolve(retryElement.distance.value / 1000);
        });
      };

      // If the entire request was denied or invalid (e.g., placeId not supported or bad ID)
      if (status !== 'OK') {
        if (pickupPlaceId || dropoffPlaceId) {
          return retryWithStrings();
        }
        return reject(new Error(`DistanceMatrix failed with status: ${status}`));
      }

      const element = response?.rows?.[0]?.elements?.[0];
      if (!element || element.status !== 'OK') {
        // If the placeId failed to route (ZERO_RESULTS, NOT_FOUND, etc)
        if (pickupPlaceId || dropoffPlaceId) {
          return retryWithStrings();
        }
        return reject(new Error(`DistanceMatrix element failed with status: ${element?.status}`));
      }

      // The distance value is in meters, so divide by 1000 to get km
      const distanceKm = element.distance.value / 1000;
      resolve(distanceKm);
    });
  });
}

export function getRouteDistanceKm(pickup: string, dropoff: string): number {
  const p = (pickup || '').toLowerCase();
  const d = (dropoff || '').toLowerCase();

  const isSants = p.includes('sants') || d.includes('sants');
  const isSagrada = p.includes('sagrada') || d.includes('sagrada');
  const isRaval = p.includes('raval') || d.includes('raval');
  const isBadalona = p.includes('badalona') || d.includes('badalona') || p.includes('marina badalona') || d.includes('marina badalona');
  
  // Only trigger airport/port if the OTHER location is a known city center
  const isKnownCityLocation = isSants || isSagrada || isRaval || isBadalona;
  const isAirport = ['airport', 'aeroport', 'bcn', 'el prat', 'terminal 1', 'terminal 2', 't1', 't2'].some(k => p.includes(k) || d.includes(k));
  const isPort = p.includes('port') || d.includes('cruise');

  if (isAirport && isKnownCityLocation) {
    if (isSants) return 17;   // Airport ↔ Sants ~17 km driving
    if (isSagrada) return 19;   // Airport ↔ Sagrada Família ~19 km driving
    if (isRaval) return 16;   // Airport ↔ Raval ~16 km driving
    if (isBadalona) return 28; // Badalona is ~28km
  }
  
  if (isPort && isKnownCityLocation) {
    if (isSants) return 10;
    if (isSagrada) return 8;
    if (isRaval) return 5;
    if (isBadalona) return 16; // Port to Badalona is ~16km
  }

  // If we can't reliably guess the distance, return a high fallback so we don't undercharge drastically
  return 50; 
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE KEY HELPERS (kept for backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export const PRICE_MATRIX: Record<string, { basePrice: number; extraPerPassenger: number }> = {
  airport_sagrada: { basePrice: 45, extraPerPassenger: 5 },
  airport_sants: { basePrice: 45, extraPerPassenger: 5 },
  airport_raval: { basePrice: 45, extraPerPassenger: 5 },
  sagrada_anywhere: { basePrice: 45, extraPerPassenger: 5 },
  sants_anywhere: { basePrice: 45, extraPerPassenger: 5 },
  raval_anywhere: { basePrice: 45, extraPerPassenger: 5 },
};

export function getRouteType(pickup: string, dropoff: string): string | null {
  const p = (pickup || '').toLowerCase();
  const d = (dropoff || '').toLowerCase();
  const isAirport = ['airport', 'aeroport', 'bcn', 'el prat'].some(k => p.includes(k) || d.includes(k));
  if (isAirport) {
    if (p.includes('sagrada') || d.includes('sagrada')) return 'airport_sagrada';
    if (p.includes('sants') || d.includes('sants')) return 'airport_sants';
    if (p.includes('raval') || d.includes('raval')) return 'airport_raval';
  }
  if (p.includes('sagrada') || d.includes('sagrada')) return 'sagrada_anywhere';
  if (p.includes('sants') || d.includes('sants')) return 'sants_anywhere';
  if (p.includes('raval') || d.includes('raval')) return 'raval_anywhere';
  return null;
}

export function getRouteKey(pickup: string, dropoff: string): string {
  return getRouteType(pickup, dropoff) || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FARE CALCULATOR — Tiered Distance Model
// ─────────────────────────────────────────────────────────────────────────────

export const PRICING_CONFIG = {
  ZONE1_MAX_KM: 20,
  ZONE2_MAX_KM: 28.5,
  ZONE1_FARE: 68.00,
  ZONE1_FARE_VAN: 75.00,
  ZONE2_FARE: 75.00,
  ZONE2_FARE_VAN: 100.00,
  TIER_RATE_PER_KM: 2.60,
  VAN_SURCHARGE: 25.00, // Flat surcharge for vans
  ROUND_TRIP_DISCOUNT: 0.90, // 10% discount on the total for round-trips
};

export interface PricingParams {
  passengers: number;
  vehicleId: string;
  distanceKm: number;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  isRoundTrip?: boolean;
  pickup?: string;
  dropoff?: string;
}

export function calculateFare(params: PricingParams): FareResult {
  const { passengers, distanceKm, isRoundTrip } = params;

  // Minivan/PMR is now 4-8 pax (passengers > 3) or explicitly selected
  const isLargeVehicle = passengers > 3 || ['minivan', 'pmr', 'pmr-accessible'].includes(params.vehicleId || '');

  console.log('Calculated Route Distance (km):', distanceKm);

  let finalPrice = 0;

  // 1. Zone 1 (0 to 20 km)
  if (distanceKm <= PRICING_CONFIG.ZONE1_MAX_KM) {
    finalPrice = isLargeVehicle ? PRICING_CONFIG.ZONE1_FARE_VAN : PRICING_CONFIG.ZONE1_FARE;
    if (isRoundTrip) {
      finalPrice = (finalPrice * 2) * PRICING_CONFIG.ROUND_TRIP_DISCOUNT;
    }
    return { price: Math.round(finalPrice), label: 'Zone 1 Flat Rate' };
  }

  // 2. Zone 2 (20.1 to 28.5 km)
  if (distanceKm <= PRICING_CONFIG.ZONE2_MAX_KM) {
    finalPrice = isLargeVehicle ? PRICING_CONFIG.ZONE2_FARE_VAN : PRICING_CONFIG.ZONE2_FARE;
    if (isRoundTrip) {
      finalPrice = (finalPrice * 2) * PRICING_CONFIG.ROUND_TRIP_DISCOUNT;
    }
    return { price: Math.round(finalPrice), label: 'Zone 2 Flat Rate' };
  }

  // 3. Zone 3 (Over 28.5 km)
  // Multiply the entire distance by €2.60
  finalPrice = distanceKm * PRICING_CONFIG.TIER_RATE_PER_KM;

  // Van Surcharge
  // Add a flat +€25.00 surcharge for Minivan/PMR on long trips
  if (isLargeVehicle) {
    finalPrice += PRICING_CONFIG.VAN_SURCHARGE;
  }

  // Round-Trip Handling
  if (isRoundTrip) {
    finalPrice = (finalPrice * 2) * PRICING_CONFIG.ROUND_TRIP_DISCOUNT;
  }

  // Strict Minimum Price Floor (prevent dips below Zone 2 pricing)
  const minFloor = isLargeVehicle ? PRICING_CONFIG.ZONE2_FARE_VAN : PRICING_CONFIG.ZONE2_FARE;
  finalPrice = Math.max(finalPrice, minFloor);

  return { price: Math.round(finalPrice), label: 'Distance-based Rate' };
}
