export const dynamic = 'force-dynamic';
// src/app/api/invoices/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createAndSendInvoice, generateInvoiceId } from '@/lib/invoices';

export async function POST(request: Request) {
  try {
    console.log('[Invoice API] Parsing request...');
    const { bookingId, amount, email, customerName = '', status = 'UNPAID', vatPct = 0 } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    console.log('[Invoice API] Generating invoice ID synchronously...');
    const invoiceId = await generateInvoiceId();

    console.log(`[Invoice API] Triggering async creation in the background for ${invoiceId}...`);
    createAndSendInvoice({
      bookingId,
      amount,
      email,
      customerName,
      status,
      vatPct,
      preGeneratedInvoiceId: invoiceId
    }).catch(err => {
      console.error(`[Invoice API Background Error] failed to process ${invoiceId}:`, err);
    });

    console.log(`[Invoice API] Returning 202 Accepted for ${invoiceId}.`);
    return NextResponse.json({ invoiceId }, { status: 202 });
  } catch (e: any) {
    console.error('[Invoice API] Error:', e);
    return NextResponse.json({ error: e.message || 'Failed to create invoice' }, { status: 500 });
  }
}

export async function GET() {
  try {
    console.log('[Invoice API] Fetching recent invoices from Supabase...');
    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      throw new Error(error.message);
    }
    return NextResponse.json(invoices || []);
  } catch (e: any) {
    console.error('[Invoice API] Fetch error:', e);
    return NextResponse.json({ error: e.message || 'Failed to fetch invoices' }, { status: 500 });
  }
}
