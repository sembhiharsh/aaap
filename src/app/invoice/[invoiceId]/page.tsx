import { getDb } from "@/lib/firebase-server";
import { doc, getDoc } from "firebase/firestore/lite";
import { Metadata } from "next";
import PrintButton from "@/components/PrintButton";

export const metadata: Metadata = {
  title: "Invoice | BarcelonasTaxis",
};

export default async function InvoicePage({ params }: { params: { invoiceId: string } }) {
  const { invoiceId } = params;

  if (!invoiceId) {
    return <div>Invalid Invoice ID</div>;
  }

  const db = getDb();
  
  // 1. Fetch Invoice
  const invoiceSnap = await getDoc(doc(db, "invoices", invoiceId));
  if (!invoiceSnap.exists()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-sm w-full">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invoice Not Found</h2>
          <p className="text-gray-500">We couldn't find the requested invoice.</p>
        </div>
      </div>
    );
  }
  const invoice = invoiceSnap.data();

  // 2. Fetch Booking
  const bookingSnap = await getDoc(doc(db, "bookings", invoice.bookingId));
  const booking = bookingSnap.exists() ? bookingSnap.data() : null;

  const today = invoice.createdAt?.toDate ? 
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(invoice.createdAt.toDate()) : 
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  const formatInvoiceDate = (d: string) => {
    try {
      if (!d) return "Not Specified";
      let parts = d.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return d; // fallback
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
            <div className="w-16 h-16 bg-[#1A56DB] rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <span className="text-white font-black text-2xl tracking-tighter">BT</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">BarcelonasTaxis</h2>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">
              Josep Tarradellas Barcelona-El Prat<br />
              08820 El Prat de Llobregat<br />
              Barcelona, Spain
            </p>
          </div>
          <div className="mt-8 md:mt-0 md:text-right">
            <div className="text-3xl font-black text-[#1A56DB] tracking-tight">INVOICE</div>
            <div className="text-gray-900 font-bold text-lg mt-2">{invoiceId}</div>
            <div className="text-gray-500 font-medium text-[14px] mt-0.5">Date: {today}</div>
          </div>
        </div>

        {/* Customer & Booking Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div>
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-widest mb-2">Bill To</div>
            <div className="text-gray-900 font-bold text-[17px]">{invoice.customerName}</div>
            <div className="text-gray-500 font-medium text-[14px] mt-1">{booking?.email || "Email not available"}</div>
            {booking?.phone && <div className="text-gray-500 font-medium text-[14px] mt-0.5">{booking.phone}</div>}
          </div>
          <div className="md:text-right">
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-widest mb-2">Booking Reference</div>
            <div className="text-gray-900 font-bold text-[17px]">{invoice.bookingId}</div>
            <div className="text-gray-600 font-medium text-[15px] mt-1">
              {formatInvoiceDate(booking?.date)} at {booking?.time || "Time not specified"}
            </div>
          </div>
        </div>

        {/* Invoice Items */}
        <div className="mb-12 rounded-xl overflow-hidden border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F8F9FA] border-b border-gray-200">
              <tr>
                <th className="px-5 py-4 text-left">Description</th>
                <th className="px-5 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-5 py-6 align-top">
                  <div className="font-black text-gray-900 text-[16px] mb-5">Private Transfer</div>
                  
                  <div className="flex gap-4">
                    <div className="flex-1 bg-[#F8F9FA] rounded-lg p-3">
                      <span className="font-bold text-[#6B7280] block text-[10px] uppercase tracking-widest mb-0.5">Pickup Location</span>
                      <span className="text-[13px] font-semibold text-gray-900">{booking?.pickup || "Not Specified"}</span>
                      {booking?.flightNumber && (
                        <span className="text-[12px] font-medium text-[#1A56DB] block mt-1">Flight: {booking.flightNumber}</span>
                      )}
                    </div>
                    
                    <div className="flex-1 bg-[#F8F9FA] rounded-lg p-3">
                      <span className="font-bold text-[#6B7280] block text-[10px] uppercase tracking-widest mb-0.5">Drop-off Location</span>
                      <span className="text-[13px] font-semibold text-gray-900">{booking?.dropoff || "Not Specified"}</span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-6 text-right font-bold text-gray-900 text-[15px] align-top">
                  €{invoice.total?.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-16">
          <div className="w-full max-w-sm">
            <div className="flex justify-between py-2 text-[14px] text-gray-500 font-medium">
              <span>Subtotal</span>
              <span>€{invoice.baseAmount?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 text-[14px] text-gray-500 font-medium">
              <span>VAT ({invoice.vatPct}%)</span>
              <span>€{invoice.vatAmount?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-4 mt-2 border-t-2 border-gray-900 items-center">
              <span className="uppercase tracking-wide text-sm font-bold text-gray-900">Total</span>
              <span className="text-2xl font-black text-[#1A56DB]">€{invoice.total?.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="text-center pt-8 border-t border-gray-100">
          <p className="text-gray-400 font-medium text-[13px]">
            Thank you for choosing BarcelonasTaxis — Barcelona Airport Transfers
          </p>
        </div>
      </div>
      
      <PrintButton />
    </div>
  );
}
