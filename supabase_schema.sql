-- =======================================================
-- Supabase Schema for Viator Admin Dispatch Application
-- Run this SQL in your Supabase Project SQL Editor
-- =======================================================

-- 1. Bookings Table
CREATE TABLE IF NOT EXISTS public.bookings (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL UNIQUE,
    customer_name TEXT DEFAULT 'Lead Traveler',
    email TEXT,
    phone TEXT,
    pickup TEXT DEFAULT 'Not Specified',
    dropoff TEXT DEFAULT 'Not Specified',
    date TEXT,
    time TEXT,
    vehicle TEXT DEFAULT 'economy',
    price NUMERIC(10, 2) DEFAULT 0.00,
    passengers INTEGER DEFAULT 1,
    luggage INTEGER DEFAULT 0,
    status TEXT DEFAULT 'confirmed',
    payment_status TEXT DEFAULT 'PAID',
    driver TEXT,
    driver_id TEXT,
    driver_price NUMERIC(10, 2),
    driver2 TEXT,
    driver2_price NUMERIC(10, 2),
    airline TEXT,
    flight TEXT,
    flight_number TEXT,
    flight_arrival_time TEXT,
    flight_departure_time TEXT,
    cruise_ship TEXT,
    disembark_time TEXT,
    customer_notes TEXT,
    internal_notes TEXT,
    source TEXT DEFAULT 'viator-email',
    pickup_time_source TEXT,
    pickup_time_confidence TEXT DEFAULT 'high',
    parser_version TEXT DEFAULT '2.0.0',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
    deleted_at TIMESTAMPTZ
);

-- Indexes for lightning fast queries & sorting
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_source ON public.bookings(source);
CREATE INDEX IF NOT EXISTS idx_bookings_driver_id ON public.bookings(driver_id);

-- 2. Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    driver_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pin TEXT NOT NULL DEFAULT '1234',
    phone TEXT,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL UNIQUE,
    booking_id TEXT REFERENCES public.bookings(booking_id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_email TEXT,
    customer_vat TEXT,
    customer_address TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    status TEXT DEFAULT 'PAID',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. Email Audit Logs Table
CREATE TABLE IF NOT EXISTS public.email_audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    message_id TEXT,
    subject TEXT,
    from_address TEXT,
    received_at TIMESTAMPTZ,
    booking_ref_extracted TEXT,
    processing_result TEXT,
    mailbox TEXT,
    error TEXT,
    fetched_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 5. Viator Import Logs Table
CREATE TABLE IF NOT EXISTS public.viator_import_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    booking_id TEXT,
    subject TEXT,
    error TEXT,
    stack TEXT,
    received_at TIMESTAMPTZ,
    import_status TEXT,
    logged_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 6. Enable Row Level Security (RLS) & Policies
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viator_import_logs ENABLE ROW LEVEL SECURITY;

-- Allow Public / Service Access for Admin Dispatch System
CREATE POLICY "Allow full access to bookings" ON public.bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to drivers" ON public.drivers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to invoices" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to email_audit_logs" ON public.email_audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to viator_import_logs" ON public.viator_import_logs FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
