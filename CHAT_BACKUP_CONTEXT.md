# Viator Admin App - Standalone Backup Context

## Architecture & Configuration
- **Repository**: `https://github.com/sembhiharsh/aaap.git` (Branch `main`)
- **App Path**: `C:\Users\autot\.gemini\antigravity-ide\scratch\barcelona-admin-app`
- **Database**: Supabase (`https://acuqqbovxalflwcpffds.supabase.co`)
- **Email Synchronization**: Exclusively connected via IMAP to `alisoban1990@gmail.com` with App Password `lbhq osnk izll vpkv`.
- **Pure Admin App**: All Firebase libraries, Firestore SDKs, driver portal login screens, and legacy branding (`BarcelonasTaxis`, `BCN Drivers`) have been completely purged from the codebase.
- **Port**: `3001` (`http://localhost:3001`)

## Key Files
- `src/lib/supabase.ts`: Supabase Browser client.
- `src/lib/supabase-admin.ts`: Supabase Admin client using service role.
- `src/lib/supabase-client.ts`: Unified Supabase client helper supporting real-time subscriptions, queries, and document mutations.
- `src/lib/db.ts`: Schema mapping layer converting camelCase and snake_case models.
- `viator-email-agent.ts`: IMAP email polling agent that parses Viator booking emails and writes directly into the Supabase `bookings` table.
- `src/app/page.tsx` & `src/app/admin/page.tsx`: Master Admin authentication page (password: `admin123` / `admin`).
- `src/app/admin-dashboard/page.tsx`: Full real-time Viator Admin Dashboard backed by Supabase.
- `src/app/invoice/[invoiceId]/page.tsx`: Printable invoice generator backed by Supabase.
- `src/app/api/email-worker/route.ts`: Background polling endpoint.
- `src/app/api/invoices/route.ts`: Supabase-backed invoice creation and retrieval API.
