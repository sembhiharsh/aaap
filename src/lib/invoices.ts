// src/lib/invoices.ts
import { supabaseAdmin } from './supabase-admin';

export async function generateInvoiceId(): Promise<string> {
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  return `INV-${randomDigits}`;
}

export interface CreateInvoiceParams {
  bookingId: string;
  amount: number;
  email: string;
  customerName: string;
  status: string;
  vatPct?: number;
}

export async function createAndSendInvoice(params: CreateInvoiceParams & { preGeneratedInvoiceId?: string }): Promise<string> {
  const { bookingId, amount, customerName, status, vatPct = 21, preGeneratedInvoiceId } = params;

  console.log('[Invoices Lib] Resolving invoice ID...');
  const invoiceId = preGeneratedInvoiceId || (await generateInvoiceId());
  const now = new Date().toISOString();

  const totalAmount = Number(amount);
  const baseAmount = totalAmount / (1 + vatPct / 100);
  const vatAmount = totalAmount - baseAmount;

  console.log(`[Invoices Lib] Saving invoice ${invoiceId} to Supabase...`);
  const { error } = await supabaseAdmin.from('invoices').upsert({
    id: invoiceId,
    invoice_id: invoiceId,
    booking_id: bookingId,
    customer_name: customerName,
    base_amount: Number(baseAmount.toFixed(2)),
    vat_pct: Number(vatPct),
    vat_amount: Number(vatAmount.toFixed(2)),
    total: Number(totalAmount.toFixed(2)),
    status,
    created_at: now,
  });

  if (error) {
    console.error(`[Invoices Lib] Error saving invoice ${invoiceId}:`, error.message);
    throw new Error(error.message);
  }

  console.log(`[Invoices Lib] Success: Invoice created ${invoiceId}`);
  return invoiceId;
}
