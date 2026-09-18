# EasyRide Admin App (Standalone)

Dedicated standalone Admin Dashboard and Dispatch Portal for Barcelona Taxis.

## Features
- **Unified Portal & Admin Login**: Direct entry on `/` or `/admin` with persistent authentication.
- **Full Admin Dashboard**: Comprehensive booking management (New, Confirmed, Completed, Cancelled, Deleted, Range, Accounts, Invoicing, Drivers, Totals) at `/admin-dashboard`.
- **Driver Portal**: Dispatch viewing for assigned drivers at `/driver-dashboard`.
- **Invoice Generator**: Automated invoice generation and printing at `/invoice/[invoiceId]`.
- **Background Email Worker**: Integrated sync and booking parser triggers.
- **Capacitor Android Support**: Pre-configured `capacitor.config.json` for building a dedicated mobile Admin app.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
The admin app will be running at `http://localhost:3001` (or `http://localhost:3000`).

### 3. Build for Production
```bash
npm run build
npm start
```
