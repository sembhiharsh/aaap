import { supabaseAdmin } from "@/lib/supabase-admin";
import { Metadata } from "next";
import PrintButton from "@/components/PrintButton";

export const metadata: Metadata = {
  title: "Invoice | Viator Dispatch Portal",
};

export default async function InvoicePage({ params }: { params: { invoiceId: string } }) {
  const { invoiceId } = params;

  if (!invoiceId) {
    return <div>Invalid Invoice ID</div>;
  }

  // 1. Fetch Invoice from Supabase
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .or(`id.eq.${invoiceId},invoice_id.eq.${invoiceId}`)
    .single();

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-sm w-full">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invoice Not Found</h2>
          <p className="text-gray-500">We couldn't find the requested invoice.</p>
        </div>
      </div>
    );
  }

  // 2. Fetch Booking from Supabase
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('booking_id', invoice.booking_id)
    .single();

  const today = invoice.created_at
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(invoice.created_at))
    : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  const formatInvoiceDate = (d: string) => {
    try {
      if (!d) return "Not Specified";
      let parts = d.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return d;
    } catch {
      return "Not Specified";
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center py-10 font-sans">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 md:p-12 w-full max-w-3xl print:shadow-none print:border-0 print:p-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-10 border-b border-gray-100">
          <div>
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <span className="text-slate-950 font-black text-xl">VIP</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">INVOICE</h1>
            <p className="text-sm text-gray-500 mt-1">Ref: <span className="font-mono font-bold text-gray-800">#{invoice.invoice_id || invoice.id}</span></p>
          </div>
          <div className="mt-4 md:mt-0 text-left md:text-right">
            <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              {invoice.status || 'PAID'}
            </span>
            <p className="text-sm text-gray-500">Date Issued:</p>
            <p className="text-sm font-bold text-gray-800">{today}</p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 pb-10 border-b border-gray-100">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Billed To</h3>
            <p className="text-base font-bold text-gray-900">{invoice.customer_name || booking?.customer_name || "Lead Traveler"}</p>
            {(invoice.customer_email || booking?.email) && (
              <p className="text-sm text-gray-600">{invoice.customer_email || booking?.email}</p>
            )}
            {booking?.phone && (
              <p className="text-sm text-gray-600">{booking.phone}</p>
            )}
          </div>
          <div className="md:text-right">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Transfer Details</h3>
            <p className="text-sm text-gray-700 font-medium">Date: <span className="font-bold text-gray-900">{formatInvoiceDate(booking?.date)}</span> at <span className="font-bold text-gray-900">{booking?.time}</span></p>
            <p className="text-sm text-gray-700 font-medium">Vehicle: <span className="font-bold text-gray-900 capitalize">{booking?.vehicle || "Standard"}</span></p>
            <p className="text-sm text-gray-700 font-medium">Booking ID: <span className="font-bold font-mono text-gray-900">{booking?.booking_id || invoice.booking_id}</span></p>
          </div>
        </div>

        {/* Route Details Box */}
        {booking && (
          <div className="bg-gray-50 rounded-xl p-4 mb-8 border border-gray-100 text-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span className="text-gray-700"><strong className="text-gray-900">Pickup:</strong> {booking.pickup}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span className="text-gray-700"><strong className="text-gray-900">Dropoff:</strong> {booking.dropoff}</span>
              </div>
            </div>
          </div>
        )}

        {/* Line Items */}
        <div className="mb-10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <th className="py-3">Description</th>
                <th className="py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              <tr>
                <td className="py-4">
                  <p className="font-bold text-gray-900">Private Transfer Service</p>
                  <p className="text-xs text-gray-500">{booking?.pickup} → {booking?.dropoff}</p>
                </td>
                <td className="py-4 text-right font-bold text-gray-900">
                  €{Number(invoice.amount).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total Summary */}
        <div className="flex justify-end mb-10">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between py-1 border-t border-gray-100 font-bold text-base text-gray-900">
              <span>Total Paid:</span>
              <span className="text-amber-600">€{Number(invoice.amount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
          <p>Thank you for choosing our private transfer services.</p>
        </div>

        <PrintButton />
      </div>
    </div>
  );
}
