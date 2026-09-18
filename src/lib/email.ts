// src/lib/email.ts
import {
  bookingConfirmationTemplate,
  adminBookingNotificationTemplate,
  bookingCancellationTemplate,
  bookingStatusUpdateTemplate,
  invoiceTemplate
} from '@/lib/emailTemplates';
import nodemailer from 'nodemailer';
import { getAdminDb } from '@/lib/firebase-admin';
const resendApiKey = process.env.RESEND_API_KEY as string;
const defaultFromEmail = process.env.RESEND_FROM_EMAIL as string;
const defaultAdminEmail = process.env.ADMIN_EMAIL as string;

if (!resendApiKey || !defaultFromEmail || !defaultAdminEmail) {
  console.warn("WARNING: Email configuration missing in environment variables. Email sending may fail.");
}

/**
 * Reusable base email sender using Resend HTTP API, falling back to Gmail SMTP on error.
 */
export async function sendEmail({
  from,
  to,
  subject,
  html,
}: {
  from?: string;
  to: string;
  subject: string;
  html: string;
}) {
  const user = process.env.ICLOUD_USER;
  const pass = process.env.ICLOUD_PASS;

  if (!user || !pass) {
    console.warn('[Email] iCloud credentials missing in environment. Skipping email dispatch.');
    return { messageId: 'skipped-no-auth' };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: { user, pass },
  });

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP Timeout after 5 seconds')), 5000)
    );

    const info: any = await Promise.race([
      transporter.sendMail({
        from: from || `BarcelonasTaxis <${user}>`,
        to,
        subject,
        html,
      }),
      timeoutPromise,
    ]);

    console.log(`Email successfully sent via iCloud: ${info.messageId}`);
    return { messageId: info.messageId };
  } catch (error: any) {
    console.error('[iCloud SMTP Exception]:', error.message);
    throw error;
  }
}

/**
 * Booking Confirmation Email (sent to customer and admin)
 */
export async function sendBookingConfirmationEmail(bookingInput: any) {
  const bookingId = bookingInput.bookingId || bookingInput.id;

  if (!bookingId) {
    console.error('[sendBookingConfirmationEmail] Failed: No bookingId provided');
    return;
  }

  let booking = bookingInput;
  try {
    const doc = await getAdminDb().collection('bookings').doc(bookingId).get();
    if (doc.exists) {
      booking = { bookingId, ...doc.data() };
      console.log(`[sendBookingConfirmationEmail] Successfully fetched fresh data for ${bookingId} from DB.`);
    } else {
      console.warn(`[sendBookingConfirmationEmail] Booking ${bookingId} not found in DB. Falling back to provided data.`);
    }
  } catch (err) {
    console.error(`[sendBookingConfirmationEmail] DB fetch failed for ${bookingId}:`, err);
  }

  const customerRecipient = booking.email || booking.customerEmail || defaultAdminEmail;
  const adminRecipient = defaultAdminEmail;

  const customerHtml = bookingConfirmationTemplate({
    bookingId: booking.bookingId,
    customerName: booking.customerName ?? 'Customer',
    pickup: booking.pickup ?? 'TBD',
    dropoff: booking.dropoff ?? 'TBD',
    date: booking.date ?? '',
    time: booking.time ?? '',
    vehicle: booking.vehicle ?? 'economy',
    passengers: Number(booking.passengers || 1),
    luggage: Number(booking.luggage || 0),
    price: Number(booking.price || 0),
    status: booking.status ?? 'Confirmed',
    locale: booking.locale || 'en',
  });

  const adminHtml = adminBookingNotificationTemplate({
    bookingId: booking.bookingId,
    customerName: booking.customerName ?? '',
    email: booking.email || booking.customerEmail || '',
    phone: booking.phone ?? '',
    pickup: booking.pickup,
    dropoff: booking.dropoff,
    date: booking.date,
    time: booking.time,
    vehicle: booking.vehicle,
    passengers: Number(booking.passengers),
    luggage: Number(booking.luggage),
    price: Number(booking.price),
    source: booking.source ?? 'website',
    internalNotes: booking.internalNotes ?? '',
  });

  // 1. Send to Customer (isolated error handling)
  try {
    await sendEmail({
      to: customerRecipient,
      subject: `Booking Confirmation: Your Transfer with BarcelonasTaxis [${booking.bookingId}]`,
      html: customerHtml,
    });
  } catch (e) {
    console.error('Error sending customer confirmation email:', e);
  }

  // 2. Send to Admin (isolated error handling)
  try {
    await sendEmail({
      to: adminRecipient,
      subject: `NEW BARCELONASTAXIS BOOKING - ${booking.bookingId}`,
      html: adminHtml,
    });
  } catch (e) {
    console.error('Error sending admin notification email:', e);
  }
}

/**
 * Booking Cancellation Email (sent to customer and admin)
 */
export async function sendBookingCancellationEmail(booking: any) {
  const recipient = booking.email || booking.customerEmail || defaultAdminEmail;
  const html = bookingCancellationTemplate({
    bookingId: booking.bookingId,
    customerName: booking.customerName ?? '',
  });

  try {
    await sendEmail({
      to: recipient,
      subject: `BarcelonasTaxis – Booking Cancelled ${booking.bookingId}`,
      html,
    });
  } catch (e) {
    console.error('Error sending cancellation email to customer:', e);
  }

  try {
    await sendAdminNotification({
      subject: `Booking Cancelled – ${booking.bookingId}`,
      html,
    });
  } catch (e) {
    console.error('Error sending admin cancellation notification:', e);
  }
}

/**
 * Booking Status Update Email (sent to customer and admin)
 */
export async function sendBookingStatusUpdateEmail(bookingInput: any) {
  const bookingId = bookingInput.bookingId || bookingInput.id;

  if (!bookingId) {
    console.error('[sendBookingStatusUpdateEmail] Failed: No bookingId provided');
    return;
  }

  let booking = bookingInput;
  try {
    const doc = await getAdminDb().collection('bookings').doc(bookingId).get();
    if (doc.exists) {
      booking = { bookingId, ...doc.data() };
    }
  } catch (err) {
    console.error(`[sendBookingStatusUpdateEmail] DB fetch failed for ${bookingId}:`, err);
  }

  const recipient = booking.email || booking.customerEmail || defaultAdminEmail;
  const html = bookingStatusUpdateTemplate({
    bookingId: booking.bookingId,
    customerName: booking.customerName ?? 'Customer',
    pickup: booking.pickup ?? 'TBD',
    dropoff: booking.dropoff ?? 'TBD',
    date: booking.date ?? '',
    time: booking.time ?? '',
    price: Number(booking.price || 0),
    status: booking.status ?? 'Updated',
    locale: booking.locale || 'en',
  });

  try {
    await sendEmail({
      to: recipient,
      subject: `BarcelonasTaxis – Booking Update ${booking.bookingId}`,
      html,
    });
  } catch (e) {
    console.error('Error sending status update email to customer:', e);
  }

  try {
    await sendAdminNotification({
      subject: `Booking Status Updated – ${booking.bookingId}`,
      html,
    });
  } catch (e) {
    console.error('Error sending admin status update notification:', e);
  }
}

/**
 * Invoice Email (sent to customer and admin)
 */
export async function sendInvoiceEmail(invoice: any) {
  const recipient = invoice.email || invoice.customerEmail || defaultAdminEmail;
  const html = invoiceTemplate({
    invoiceNumber: invoice.invoiceId,
    bookingId: invoice.bookingId,
    customerName: invoice.customerName,
    amount: invoice.amount,
    vat: invoice.vat,
    total: invoice.total,
  });

  try {
    await sendEmail({
      to: recipient,
      subject: `BarcelonasTaxis – Invoice ${invoice.invoiceId}`,
      html,
    });
  } catch (e) {
    console.error('Error sending invoice email to customer:', e);
  }

  try {
    await sendAdminNotification({
      subject: `Invoice Generated – ${invoice.invoiceId}`,
      html,
    });
  } catch (e) {
    console.error('Error sending admin invoice notification:', e);
  }
}

/**
 * Reusable helper to send a notification to the internal admin address.
 */
export async function sendAdminNotification({
  subject,
  html,
}: {
  subject: string;
  html: string;
}) {
  return sendEmail({
    from: `BarcelonasTaxis System <noreply@barcelonastaxis.com>`,
    to: defaultAdminEmail,
    subject,
    html,
  });
}
