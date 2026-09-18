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

## 3. Email Sync Integration (MSOBAN Email)
The application connects directly to Gmail via IMAP to automatically parse Viator reservation emails into Firestore:

- **Connected Email**: `alisoban1990@gmail.com`
- **App Password**: `lbhq osnk izll vpkv`
- **IMAP Host**: `imap.gmail.com:993` (SSL/TLS)
- **Status**: Tested and verified — successfully synced Viator bookings (e.g. `BR-1448000749`, `BR-1447161793`, `BR-1441882857`, `BR-1439052305`).
- **Worker Endpoint**: `/api/email-worker` runs automated background polling every 2 minutes.
- **Sync Scripts**:
  - `test-email-connection.ts`: Tests IMAP authentication and reports inbox message counts.
  - `sync-now.ts`: Manually triggers an immediate pull and parse of all recent Viator emails.

---

## 4. Firebase Database Status: DISCONNECTED
As requested, the previous Firebase project (`easyride-8978d`) has been **completely disconnected**.

### How to Connect Your New Firebase Project:
Update `.env.local` (and `.env`) with your new Firebase project credentials:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_new_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_new_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_new_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_new_project_id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

---

## 5. Directory Structure & Key Files
- `src/app/page.tsx` & `src/app/admin/page.tsx`: Pure Viator Admin Portal login page.
- `src/app/admin-dashboard/page.tsx`: Full administrative control panel (reservations, driver assignment, payouts, filters, invoices, search).
- `src/app/invoice/[invoiceId]/page.tsx`: Printable invoice template.
- `src/app/api/email-worker/route.ts`: Background synchronization worker endpoint.
- `src/app/api/admin/bookings/[bookingId]/`: Admin delete and update endpoints.
- `src/lib/firebase-server.ts`: REST-based Firestore database client.
- `src/lib/bookingFormatters.ts`: Date, time, price, name, and status formatting utilities.
- `viator-email-agent.ts`: IMAP Viator email fetcher, message validator, and parser.
- `viator-parser-v2.ts`: Regex parser extracting lead traveler, pickup/dropoff, dates, times, flight numbers, cruise ship, passenger count, and net rate from Viator email bodies.
- `public/ADMIN FAVICON AND APP LOGO.png`: Dedicated Admin app logo.

---

## 6. How to Run Locally
```powershell
cd C:\Users\autot\.gemini\antigravity-ide\scratch\barcelona-admin-app
npm install
npm run dev
```
Open **`http://localhost:3001`** in your browser.
