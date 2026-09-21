# Viator Admin App - AI Context & Chat Backup

*This document serves as a complete context backup for this project. You can paste this file or reference it in any new AI session to immediately bring the AI assistant up to speed on the architecture, setup, email sync, and current status.*

---

## 1. Project Overview & Architecture
**Barcelona Admin App / Viator Dispatch Manager** is a standalone, isolated Next.js administration portal built specifically for managing Viator bookings, assigning drivers, viewing reservations, tracking totals, and generating invoices.

- **GitHub Repository**: [`https://github.com/sembhiharsh/aaap.git`](https://github.com/sembhiharsh/aaap.git)
- **Branch**: `main`
- **Local Directory**: `C:\Users\autot\.gemini\antigravity-ide\scratch\barcelona-admin-app`

---

## 2. Key Features & Isolation
- **Pure Admin App**: All driver portal login tabs, customer checkout widgets, and legacy branding (`BarcelonasTaxis`, `BCN Drivers`) have been stripped out.
- **Dedicated Entry**: Direct master password login on `/` and `/admin` leading to the `/admin-dashboard`.
- **Master Admin Password**: `admin123` (also accepts `admin` / `taxisbarcelona24`).
- **Capacitor Mobile Ready**: `capacitor.config.json` configured for `com.admin.app` ("Admin Dispatch App").

---

## 3. Database: SUPABASE (Active)
The database has been fully migrated from Firebase to **Supabase**:
- **Supabase Project URL**: `https://acuqqbovxalflwcpffds.supabase.co`
- **SQL Schema Script**: `supabase_schema.sql` (Creates `bookings`, `drivers`, `invoices`, `email_audit_logs`, and `viator_import_logs` with RLS policies and Realtime enabled).
- **Client SDK**: `@supabase/supabase-js` with realtime subscriptions.
- **Server SDK**: `src/lib/supabase-admin.ts` with service role privileges.
- **Data Layer Adapter**: `src/lib/db.ts` & `src/lib/firebase.ts` (Drop-in Supabase compatibility adapter).

---

## 4. Email Sync Integration (MSOBAN Email)
The application connects directly to Gmail via IMAP to automatically parse Viator reservation emails and write them to Supabase:

- **Connected Email**: `alisoban1990@gmail.com`
- **App Password**: `lbhq osnk izll vpkv`
- **IMAP Host**: `imap.gmail.com:993` (SSL/TLS)
- **Worker Endpoint**: `/api/email-worker` runs automated background polling every 2 minutes.
- **Sync Scripts**:
  - `test-email-connection.ts`: Tests IMAP authentication and reports inbox message counts.
  - `sync-now.ts`: Manually triggers an immediate pull and parse of all recent Viator emails.

---

## 5. Directory Structure & Key Files
- `src/app/page.tsx` & `src/app/admin/page.tsx`: Pure Viator Admin Portal login page.
- `src/app/admin-dashboard/page.tsx`: Full administrative control panel (reservations, driver assignment, payouts, filters, invoices, search).
- `src/app/invoice/[invoiceId]/page.tsx`: Printable invoice template powered by Supabase.
- `src/app/api/email-worker/route.ts`: Background synchronization worker endpoint.
- `src/app/api/admin/bookings/[bookingId]/`: Admin delete and update endpoints.
- `src/lib/supabase.ts` & `src/lib/supabase-admin.ts`: Supabase client & server singletons.
- `src/lib/db.ts`: CamelCase <-> SnakeCase database schema mapper.
- `viator-email-agent.ts`: IMAP Viator email fetcher and parser writing to Supabase.
- `supabase_schema.sql`: Full PostgreSQL DDL schema with indexes and RLS policies.
- `public/ADMIN FAVICON AND APP LOGO.png`: Dedicated Admin app logo.

---

## 6. How to Run Locally
```powershell
cd C:\Users\autot\.gemini\antigravity-ide\scratch\barcelona-admin-app
npm install
npm run dev
```
Open **`http://localhost:3001`** in your browser.
