import { supabase } from './supabase';
import { supabaseAdmin } from './supabase-admin';

export function toCamelBooking(row: any): any {
  if (!row) return null;
  return {
    id: row.id || row.booking_id,
    bookingId: row.booking_id || row.id,
    customerName: row.customer_name || 'Lead Traveler',
    email: row.email || '',
    phone: row.phone || '',
    pickup: row.pickup || 'Not Specified',
    dropoff: row.dropoff || 'Not Specified',
    date: row.date || '',
    time: row.time || '',
    vehicle: row.vehicle || 'economy',
    status: row.status || 'confirmed',
    paymentStatus: row.payment_status || 'PAID',
    price: Number(row.price) || 0,
    driver: row.driver || '',
    driverId: row.driver_id || '',
    driverPrice: row.driver_price != null ? Number(row.driver_price) : '',
    driver2: row.driver2 || '',
    driver2Price: row.driver2_price != null ? Number(row.driver2_price) : '',
    passengers: Number(row.passengers) || 1,
    luggage: Number(row.luggage) || 0,
    customerNotes: row.customer_notes || '',
    internalNotes: row.internal_notes || '',
    source: row.source || 'viator-email',
    createdAt: row.created_at ? { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) } : null,
    updatedAt: row.updated_at ? { seconds: Math.floor(new Date(row.updated_at).getTime() / 1000) } : null,
    airline: row.airline || '',
    flight: row.flight || '',
    flightNumber: row.flight_number || '',
    flightArrivalTime: row.flight_arrival_time || '',
    flightDepartureTime: row.flight_departure_time || '',
    cruiseShip: row.cruise_ship || '',
    disembarkTime: row.disembark_time || '',
    pickupTimeSource: row.pickup_time_source || 'default',
    pickupTimeConfidence: row.pickup_time_confidence || 'high',
    parserVersion: row.parser_version || '2.0.0',
  };
}

export function toSnakeBooking(camel: any): any {
  const row: any = {};
  if (camel.id) row.id = camel.id;
  if (camel.bookingId) row.booking_id = camel.bookingId;
  if (camel.customerName !== undefined) row.customer_name = camel.customerName;
  if (camel.email !== undefined) row.email = camel.email;
  if (camel.phone !== undefined) row.phone = camel.phone;
  if (camel.pickup !== undefined) row.pickup = camel.pickup;
  if (camel.dropoff !== undefined) row.dropoff = camel.dropoff;
  if (camel.date !== undefined) row.date = camel.date;
  if (camel.time !== undefined) row.time = camel.time;
  if (camel.vehicle !== undefined) row.vehicle = camel.vehicle;
  if (camel.status !== undefined) row.status = camel.status;
  if (camel.paymentStatus !== undefined) row.payment_status = camel.paymentStatus;
  if (camel.price !== undefined) row.price = Number(camel.price) || 0;
  if (camel.driver !== undefined) row.driver = camel.driver;
  if (camel.driverId !== undefined) row.driver_id = camel.driverId;
  if (camel.driverPrice !== undefined) row.driver_price = camel.driverPrice !== '' ? Number(camel.driverPrice) : null;
  if (camel.driver2 !== undefined) row.driver2 = camel.driver2;
  if (camel.driver2Price !== undefined) row.driver2_price = camel.driver2Price !== '' ? Number(camel.driver2Price) : null;
  if (camel.passengers !== undefined) row.passengers = Number(camel.passengers) || 1;
  if (camel.luggage !== undefined) row.luggage = Number(camel.luggage) || 0;
  if (camel.customerNotes !== undefined) row.customer_notes = camel.customerNotes;
  if (camel.internalNotes !== undefined) row.internal_notes = camel.internalNotes;
  if (camel.source !== undefined) row.source = camel.source;
  if (camel.airline !== undefined) row.airline = camel.airline;
  if (camel.flight !== undefined) row.flight = camel.flight;
  if (camel.flightNumber !== undefined) row.flight_number = camel.flightNumber;
  if (camel.flightArrivalTime !== undefined) row.flight_arrival_time = camel.flightArrivalTime;
  if (camel.flightDepartureTime !== undefined) row.flight_departure_time = camel.flightDepartureTime;
  if (camel.cruiseShip !== undefined) row.cruise_ship = camel.cruiseShip;
  if (camel.disembarkTime !== undefined) row.disembark_time = camel.disembarkTime;
  if (camel.pickupTimeSource !== undefined) row.pickup_time_source = camel.pickupTimeSource;
  if (camel.pickupTimeConfidence !== undefined) row.pickup_time_confidence = camel.pickupTimeConfidence;
  if (camel.parserVersion !== undefined) row.parser_version = camel.parserVersion;
  row.updated_at = new Date().toISOString();
  return row;
}

export function toCamelDriver(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driver_id || '',
    name: row.name || '',
    pin: row.pin || '1234',
    phone: row.phone || '',
    status: row.status || 'Active',
    createdAt: row.created_at ? { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) } : null,
  };
}

export function toSnakeDriver(camel: any): any {
  const row: any = {};
  if (camel.id) row.id = camel.id;
  if (camel.driverId) row.driver_id = camel.driverId;
  if (camel.name !== undefined) row.name = camel.name;
  if (camel.pin !== undefined) row.pin = camel.pin;
  if (camel.phone !== undefined) row.phone = camel.phone;
  if (camel.status !== undefined) row.status = camel.status;
  row.updated_at = new Date().toISOString();
  return row;
}
