import { translations, Locale } from '@/lib/translations';

export function bookingConfirmationTemplate({
  bookingId,
  customerName,
  pickup,
  dropoff,
  date,
  time,
  vehicle,
  passengers,
  luggage,
  price,
  status = "Confirmed",
  locale = "en",
}: {
  bookingId: string;
  customerName: string;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  vehicle: string;
  passengers: number;
  luggage: number;
  price: number;
  status?: string;
  locale?: string;
}) {
  const safeLocale = (locale && translations[locale as Locale]) ? (locale as Locale) : "en";
  const t = translations[safeLocale].email.confirmation;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px;">
      <h2 style="color: #0056b3;">${t.title}</h2>
      <p>${t.greeting}</p>
      
      <div style="background: #f4f4f4; padding: 15px; border-radius: 5px;">
        <p><strong>${t.reference}:</strong> ${bookingId}</p>
        <p><strong>${t.dateTime}:</strong> ${date} ${t.at} ${time}</p>
        <p><strong>${t.pickup}:</strong> ${pickup}</p>
        <p><strong>${t.dropoff}:</strong> ${dropoff}</p>
        <p><strong>${t.vehicleType}:</strong> <span style="text-transform: capitalize;">${vehicle}</span></p>
        <p><strong>${t.totalPaid}:</strong> &euro;${Number(price).toFixed(2)}</p>
      </div>

      <h3 style="margin-top: 20px;">${t.changesTitle}</h3>
      <p>${t.changesText}</p>
      
      <p><em>${t.bestRegards},<br>${t.team}</em></p>
    </div>`;
}

export function adminBookingNotificationTemplate({
  bookingId,
  customerName,
  email,
  phone,
  pickup,
  dropoff,
  date,
  time,
  vehicle,
  passengers,
  luggage,
  price,
  source,
  internalNotes,
}: {
  bookingId: string;
  customerName: string;
  email: string;
  phone: string;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  vehicle: string;
  passengers: number;
  luggage: number;
  price: number;
  source: string;
  internalNotes: string;
}) {
  const dashboardUrl = `https://barcelonastaxis.com/admin-dashboard?bookingId=${bookingId}`;
  
  return `
    <div style="font-family:Arial,sans-serif;color:#0F172A;background:#F1F5F9;padding:20px;max-width:600px;margin:auto;border-radius:8px;">
      <h1 style="color:#DC2626;font-size:20px;margin-bottom:15px;border-bottom:2px solid #DC2626;padding-bottom:5px;">NEW BARCELONASTAXIS BOOKING</h1>
      
      <div style="background:#FFFFFF;padding:15px;border-radius:6px;border:1px solid #E2E8F0;margin-bottom:15px;">
        <h2 style="font-size:14px;color:#475569;margin-top:0;text-transform:uppercase;">Customer Info</h2>
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:3px 0;font-weight:bold;width:120px;">Name:</td><td>${customerName}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Email:</td><td><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Phone:</td><td>${phone || 'N/A'}</td></tr>
        </table>
      </div>

      <div style="background:#FFFFFF;padding:15px;border-radius:6px;border:1px solid #E2E8F0;margin-bottom:15px;">
        <h2 style="font-size:14px;color:#475569;margin-top:0;text-transform:uppercase;">Journey Details</h2>
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:3px 0;font-weight:bold;width:120px;">Booking ID:</td><td style="font-weight:bold;color:#2563EB;">${bookingId}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Pickup:</td><td>${pickup}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Drop-off:</td><td>${dropoff}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Date/Time:</td><td>${date} @ ${time}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Vehicle:</td><td><span style="text-transform:capitalize;">${vehicle}</span></td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Passengers:</td><td>${passengers}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Luggage:</td><td>${luggage}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Price:</td><td style="font-weight:bold;color:#16A34A;">€${price}</td></tr>
          <tr><td style="padding:3px 0;font-weight:bold;">Source:</td><td><span style="text-transform:capitalize;background:#E2E8F0;padding:2px 6px;border-radius:4px;font-size:12px;">${source}</span></td></tr>
        </table>
      </div>

      <div style="background:#FEF3C7;padding:15px;border-radius:6px;border:1px solid #FDE68A;margin-bottom:20px;">
        <h2 style="font-size:14px;color:#92400E;margin-top:0;text-transform:uppercase;">Internal Notes</h2>
        <p style="font-size:14px;margin:0;color:#92400E;">${internalNotes || 'None provided.'}</p>
      </div>

      <div style="text-align:center;margin-top:20px;">
        <a href="${dashboardUrl}" style="background:#2563EB;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">View in Admin Dashboard</a>
      </div>
    </div>`;
}

export function bookingCancellationTemplate({ bookingId, customerName }: { bookingId: string; customerName: string }) {
  return `
    <div style="font-family:Arial,sans-serif;color:#0F172A;background:#F9FAFB;padding:20px;max-width:600px;margin:auto;border-radius:8px;">
      <h1 style="color:#DC2626;font-size:24px;margin-bottom:20px;">BarcelonasTaxis – Booking Cancelled</h1>
      <p>Hi ${customerName},</p>
      <p>We’re sorry to inform you that your booking <strong>${bookingId}</strong> has been cancelled.</p>
      <p>If this was a mistake or you wish to re‑book, please visit our site.</p>
      <p style="color:#64748B;">© ${new Date().getFullYear()} BarcelonasTaxis</p>
    </div>`;
}

export function bookingStatusUpdateTemplate({
  bookingId,
  customerName,
  pickup,
  dropoff,
  date,
  time,
  price,
  status,
  locale = "en",
}: {
  bookingId: string;
  customerName?: string;
  pickup?: string;
  dropoff?: string;
  date?: string;
  time?: string;
  price?: number;
  status?: string;
  locale?: string;
}) {
  const safeLocale = (locale && translations[locale as Locale]) ? (locale as Locale) : "en";
  const t = translations[safeLocale].email.confirmation;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px;">
      <h2 style="color: #0056b3;">${t.title}</h2>
      <p>${t.greeting}</p>
      
      <div style="background: #f4f4f4; padding: 15px; border-radius: 5px;">
        <p><strong>${t.reference}:</strong> ${bookingId}</p>
        <p><strong>${t.dateTime}:</strong> ${date} ${t.at} ${time}</p>
        <p><strong>${t.pickup}:</strong> ${pickup}</p>
        <p><strong>${t.dropoff}:</strong> ${dropoff}</p>
        <p><strong>${t.totalPaid}:</strong> &euro;${Number(price).toFixed(2)}</p>
      </div>

      <h3 style="margin-top: 20px;">${t.changesTitle}</h3>
      <p>${t.changesText}</p>
      
      <p><em>${t.bestRegards},<br>${t.team}</em></p>
    </div>`;
}

export function invoiceTemplate({
  invoiceNumber,
  bookingId,
  customerName,
  amount,
  vat,
  total,
}: {
  invoiceNumber: string;
  bookingId: string;
  customerName: string;
  amount: number;
  vat: number;
  total: number;
}) {
  return `
    <div style="font-family:Arial,sans-serif;color:#0F172A;background:#F9FAFB;padding:20px;max-width:600px;margin:auto;border-radius:8px;">
      <h1 style="color:#1E3A8A;font-size:24px;margin-bottom:20px;">BarcelonasTaxis – Invoice</h1>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr><td style="font-weight:bold;">Invoice #:</td><td>${invoiceNumber}</td></tr>
        <tr><td style="font-weight:bold;">Booking ID:</td><td>${bookingId}</td></tr>
        <tr><td style="font-weight:bold;">Customer:</td><td>${customerName}</td></tr>
        <tr><td style="font-weight:bold;">Amount:</td><td>€${amount.toFixed(2)}</td></tr>
        <tr><td style="font-weight:bold;">VAT:</td><td>€${vat.toFixed(2)}</td></tr>
        <tr><td style="font-weight:bold;">Total:</td><td>€${total.toFixed(2)}</td></tr>
      </table>
      <p>Thank you for your business.</p>
      <p style="color:#64748B;">© ${new Date().getFullYear()} BarcelonasTaxis</p>
    </div>`;
}

export function adminNotificationTemplate({ subject, body }: { subject: string; body: string }) {
  return `
    <div style="font-family:Arial,sans-serif;color:#0F172A;background:#F9FAFB;padding:20px;max-width:600px;margin:auto;border-radius:8px;">
      <h1 style="color:#1E3A8A;font-size:24px;margin-bottom:20px;">BarcelonasTaxis – Admin Notification</h1>
      <p><strong>${subject}</strong></p>
      <p>${body}</p>
      <p style="color:#64748B;">© ${new Date().getFullYear()} BarcelonasTaxis</p>
    </div>`;
}
