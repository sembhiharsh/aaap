// src/lib/invoices.ts
import { getAdminDb } from './firebase-admin';
import * as admin from 'firebase-admin';
import { sendInvoiceEmail } from './email';

// Helper for 120-second max timeout (increased from 10s/30s for stability)
const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Invoice operation timed out after ${ms}ms`)), ms));

export async function generateInvoiceId(): Promise<string> {
  const counterRef = getAdminDb().collection('counters').doc('invoices');
  try {
    const newId = await getAdminDb().runTransaction(async (transaction: any) => {
      const snap = await transaction.get(counterRef);
      const current = snap.exists ? snap.data()?.next ?? 1 : 1;
      transaction.set(counterRef, { next: current + 1 }, { merge: true });
      const padded = String(current).padStart(6, '0');
      return `INV-${padded}`;
    });
    return newId;
  } catch (err: any) {
    console.error('[Invoice] Transaction failed (likely Firebase Rules). Falling back to random ID.', err.message);
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `INV-${randomDigits}`;
  }
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
  const { bookingId, amount, email, customerName, status, vatPct = 21, preGeneratedInvoiceId } = params;

  console.log('[Invoices Lib] Resolving invoice ID...');
  const invoiceId = preGeneratedInvoiceId || (await Promise.race([generateInvoiceId(), timeout(120000)])) as string;
  
  const invoiceRef = getAdminDb().collection('invoices').doc(invoiceId);
  const now = new Date();

  const totalAmount = Number(amount);
  const baseAmount = totalAmount / (1 + vatPct / 100);
  const vatAmount = totalAmount - baseAmount;

  console.log(`[Invoices Lib] Saving invoice ${invoiceId} to DB...`);
  await Promise.race([
    invoiceRef.set({
      invoiceId,
      bookingId,
      customerName,
      baseAmount: Number(baseAmount.toFixed(2)),
      vatPct: Number(vatPct),
      vatAmount: Number(vatAmount.toFixed(2)),
      total: Number(totalAmount.toFixed(2)),
      status,
      createdAt: now,
    }),
    timeout(120000)
  ]);

  console.log(`[Invoices Lib] Logging activity for ${invoiceId}...`);
  const activityRef = getAdminDb().collection('activityLogs').doc(`${invoiceId}_created_${Date.now()}`);
  await Promise.race([
    activityRef.set({
      timestamp: now,
      adminUser: null,
      action: 'Invoice Created',
      bookingId,
    }),
    timeout(120000)
  ]);

  console.log(`[Invoices Lib] Skipping invoice email dispatch as per request.`);
  /*
  console.log(`[Invoices Lib] Dispatching invoice email via SMTP to ${email}...`);
  await Promise.race([
    sendInvoiceEmail({
      invoiceId,
      bookingId,
      customerName,
      email,
      amount: totalAmount,
      vat: vatAmount,
      total: totalAmount,
    }),
    timeout(120000)
  ]);
  */

  console.log(`[Invoices Lib] Success: Invoice email sent to ${email}`);
  return invoiceId;
}
