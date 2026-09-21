# Viator Admin App (Standalone)

Dedicated standalone Admin Dashboard and Dispatch Portal for Viator Bookings.

## Features
- **Pure Admin Portal**: Direct entry on `/` or `/admin` with master admin access.
- **Full Admin Dashboard**: Real-time booking management (Viator Bookings, New Booking, Cancelled, Revenue Totals, Invoicing) backed by **Supabase** at `/admin-dashboard`.
- **Viator Email Sync Worker**: Continuous IMAP synchronization with `alisoban1990@gmail.com` parsing live Viator bookings.
- **Invoice Generator**: Automated invoice generation and printing backed by Supabase at `/invoice/[invoiceId]`.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
The admin app is accessible at `http://localhost:3001` (or `http://localhost:3000`).

### 3. Build for Production
```bash
npm run build
npm start
```
