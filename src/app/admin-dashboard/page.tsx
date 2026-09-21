"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
// @ts-ignore
import { createPortal } from "react-dom";
import {
  LayoutDashboard, PlusCircle, Users, BarChart2, FileText,
  LogOut, Search, Printer, X, Phone, Mail, MapPin, Navigation,
  TrendingUp, DollarSign, CheckCircle2, RefreshCw, Eye, ClipboardList,
  CheckCheck, XCircle, Loader2, Copy, MessageCircle, ExternalLink, ArrowRight, Bell, Calendar, ArrowLeft, Globe, Car, AlertTriangle, Trash2, ChevronDown, ChevronUp
} from "lucide-react";

import {
  db, auth,
  signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut,
  collection, getDocs, doc, setDoc, updateDoc,
  query, orderBy, Timestamp, runTransaction, where, onSnapshot
} from "@/lib/supabase-client";
import {
  normalizeTime,
  formatTimeDisplay,
  normalizeDate,
  formatDateDisplay,
  formatDateTimeCombined,
  formatDateHeaderDisplay,
  normalizeCustomerName,
  normalizePrice,
  formatPriceDisplay,
  normalizeVehicle,
  normalizeStatus,
  formatStatusDisplay,
  cleanLocation,
  Locale
} from "@/lib/bookingFormatters";
import { EmailWorkerStarter } from "@/components/EmailWorkerStarter";

/* ─── Types ─── */
type Section = "reservations" | "new" | "confirmed" | "completed" | "cancelled" | "deleted" | "accounts" | "range" | "invoice";
type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed" | "DELETED" | "INCOMPLETE" | "NEW" | "new";
type Booking = {
  id: string; bookingId: string; customerName: string; email: string;
  phone?: string; pickup: string; dropoff: string; date: string; time: string;
  vehicle: string; status: BookingStatus; paymentStatus?: string; price: number; driver?: string; driverId?: string; driverPrice?: string | number; driver2?: string; driver2Price?: string | number;
  passengers?: number; luggage?: number; customerNotes?: string;
  internalNotes?: string; source?: string; createdAt?: any;
  flight?: string; flightNumber?: string; airline?: string; cruiseShip?: string;
  childSeatRequired?: boolean; childSeatQty?: number;
  wheelchairAccessRequired?: boolean; petsAllowed?: boolean;
  bookingType?: string; disembarkTime?: string; flightArrivalTime?: string; flightDepartureTime?: string;
  pickupTimeSource?: string; pickupTimeConfidence?: 'high' | 'medium' | 'review_required';
  parserVersion?: string;
};
type Driver = {
  id: string;
  driverId: string;
  name: string;
  pin: string;
  phone?: string;
  status: 'Active' | 'Disabled' | 'Deleted';
  createdAt?: any;
};
type Customer = {
  email: string; name: string; phone: string; company?: string;
  vatNumber?: string; billingAddress?: string; notes?: string;
  isVip?: boolean; isCorporate?: boolean;
  bookings: Booking[]; totalSpent: number; lastBookingDate: string;
};

/* ─── Config & Helpers ─── */
const VEHICLES = ["economy", "business", "van", "executive", "minibus"];

const STATUS_CONFIG: Record<BookingStatus, { bg: string; text: string; dot: string }> = {
  confirmed: { bg: "bg-[#8B4513]/10", text: "text-[#8B4513]", dot: "bg-[#8B4513]" },
  completed: { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
  cancelled: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  pending_payment: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
  DELETED: { bg: "bg-gray-200", text: "text-gray-600", dot: "bg-gray-500" },
  INCOMPLETE: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" },
  NEW: { bg: "bg-[#8B4513]/10", text: "text-[#8B4513]", dot: "bg-[#8B4513]" },
  new: { bg: "bg-[#8B4513]/10", text: "text-[#8B4513]", dot: "bg-[#8B4513]" },
};

const getStatusConfig = (status: string) => STATUS_CONFIG[normalizeStatus(status)] || { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };

const BOTTOM_NAV = [
  { id: "reservations", label: "Viator Bookings", icon: Calendar },
  { id: "new", label: "New Booking", icon: PlusCircle },
  { id: "cancelled", label: "Cancelled", icon: XCircle },
  { id: "invoice", label: "Generate Invoice", icon: FileText },
] as const;

const SIDEBAR_NAV = [
  { id: "reservations", label: "Viator Bookings", icon: LayoutDashboard },
  { id: "new", label: "New Reservation", icon: PlusCircle },
  { id: "cancelled", label: "Cancelled Bookings", icon: XCircle },
  { id: "invoice", label: "Generate Invoice", icon: FileText },
] as const;

const formatDate = (d: string, locale: Locale = "en") => formatDateDisplay(d, locale);
const formatDateHeader = (dateStr: string, locale: Locale = "en") => formatDateHeaderDisplay(dateStr, locale);

const formatMonthYearHeader = (dateStr: string, locale: Locale = "en") => {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const trimmed = dateStr.trim().toUpperCase();
  if (trimmed === 'MISSING' || trimmed === '') return dateStr;

  let dateObj: Date | null = null;
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    dateObj = new Date(year, month, day);
  } else if (trimmed.includes('/')) {
    const [datePart] = trimmed.split(',');
    const slashParts = datePart.trim().split('/');
    if (slashParts.length === 3) {
      const day = parseInt(slashParts[0], 10);
      const month = parseInt(slashParts[1], 10) - 1;
      const year = parseInt(slashParts[2], 10);
      dateObj = new Date(year, month, day);
    }
  }

  if (dateObj && !isNaN(dateObj.getTime())) {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { month: "long", year: "numeric" }).format(dateObj);
  }
  return dateStr;
};

/* ═══════════════════════════════════════════════
   MOBILE BOOKING CARD COMPONENT (with inline edit)
═══════════════════════════════════════════════ */
function MobileBookingCard({ b, conf, setDetailBooking, updateStatus, zoomedBookingId, setZoomedBookingId, setBookings, onDeleteClick, drivers }: any) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [pickup, setPickup] = useState(b.pickup || "");
  const [dropoff, setDropoff] = useState(b.dropoff || "");
  const [date, setDate] = useState(b.date || "");
  const [time, setTime] = useState(b.time || "");
  const [price, setPrice] = useState(b.price ?? "");
  const [driver, setDriver] = useState(b.driver || "");
  const [driverPrice, setDriverPrice] = useState(b.driverPrice || "");
  const [driver2, setDriver2] = useState(b.driver2 || "");
  const [driver2Price, setDriver2Price] = useState(b.driver2Price || "");
  const [isEditingDriver2, setIsEditingDriver2] = useState(false);
  const isCancelled = b.status?.toUpperCase() === 'CANCELLED' || b.status?.toUpperCase() === 'CANCELED';

  const handleSave = async (updateObj: any) => {
    try {
      await updateDoc(doc(db, 'bookings', b.id), updateObj);
      Object.assign(b, updateObj);
      setBookings((prev: Booking[]) => prev.map((bk: Booking) => bk.id === b.id ? { ...bk, ...updateObj } : bk));
      setEditingField(null);
    } catch (err) {
      console.error("Failed to update", err);
      alert("Update failed");
    }
  };

  const cancelEdit = () => {
    setPickup(b.pickup || "");
    setDropoff(b.dropoff || "");
    setDate(b.date || "");
    setTime(b.time || "");
    setPrice(b.price ?? "");
    setDriver(b.driver || "");
    setEditingField(null);
  };

  const MobileEditBtn = ({ field }: { field: string }) => (
    <button
      onClick={(e) => { e.stopPropagation(); setEditingField(field); }}
      className="text-gray-400 hover:text-[#8B4513] active:text-[#8B4513] p-1.5 rounded-md hover:bg-[#8B4513]/5 transition-all shrink-0"
      title={`Edit ${field}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
    </button>
  );

  const SaveCancelBtns = ({ onSave }: { onSave: () => void }) => (
    <div className="flex gap-2 mt-2">
      <button onClick={(e) => { e.stopPropagation(); onSave(); }} className="flex-1 bg-[#8B4513] hover:bg-[#6b340e] text-white text-[12px] px-3 py-2 rounded-lg font-bold transition-colors shadow-sm">Save</button>
      <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] px-3 py-2 rounded-lg font-bold transition-colors">Cancel</button>
    </div>
  );

  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 w-full transition-all flex flex-col gap-3.5 ${b.status?.toUpperCase() === 'CANCELLED'
        ? 'bg-red-50/80 hover:bg-red-100/80 border border-red-200 shadow-sm'
        : 'bg-white shadow-sm border border-gray-200 hover:border-gray-300'
        }`}
    >
      {/* ── Section 1: Header (Booking ID, Customer Name) & Date/Time ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between cursor-pointer" onClick={() => setDetailBooking(b)}>
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${conf.dot}`} />
            <div>
              <div className="relative">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomedBookingId((prev: any) => prev === b.id ? null : b.id);
                  }}
                  className={`client-name-trigger cursor-pointer inline-block origin-left transition-all duration-300 ease-in-out font-black text-gray-900 text-[16px] tracking-tight
                    ${zoomedBookingId === b.id
                      ? "scale-[1.5] text-gray-900 font-bold bg-white border border-gray-200 shadow-xl px-2 py-0.5 rounded-lg z-50 relative cursor-pointer"
                      : ""
                    }`}
                >
                  {normalizeCustomerName(b.customerName)}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[#6B7280] text-[12px] font-medium mt-0.5">
                <span>{b.bookingId}</span>
                {b.source && (
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-bold text-gray-600 uppercase">
                    {b.source === 'viator-email' || b.source === 'viator' ? 'Viator' : b.source}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {(b.passengers || 0) > 0 && (
                  <div className="text-xs text-gray-600 font-bold flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200">
                    <Users size={12} /> {b.passengers}
                  </div>
                )}
                <div
                  onClick={(e) => { e.stopPropagation(); setEditingField("price"); }}
                  className="text-xs font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Click to edit price"
                >
                  <span>Price:</span>
                  <span>{b.price ? `€${Number(b.price).toFixed(2)}` : '€0.00'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isCancelled && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm(`Pull booking ${b.bookingId} back to Active Bookings?`)) {
                    await updateStatus(b.id, "confirmed");
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-black text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-all shadow-sm shrink-0 cursor-pointer"
                title="Pull back to Active Bookings"
              >
                <RefreshCw size={12} strokeWidth={2.5} /> Restore
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onDeleteClick) onDeleteClick(b);
              }}
              className="w-8 h-8 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 rounded-md transition-colors shrink-0 shadow-sm"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Date & Time Row */}
        {editingField === "datetime" ? (
          <div className="bg-[#F8F9FA] rounded-xl p-3 flex flex-col gap-2 border border-gray-200 mt-1" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Edit Date & Time</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-900 outline-none focus:border-[#8B4513] focus:ring-2 focus:ring-[#8B4513]/10 bg-white" />
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 font-black text-[#8B4513] outline-none focus:border-[#8B4513] focus:ring-2 focus:ring-[#8B4513]/10 bg-white" />
            <SaveCancelBtns onSave={() => handleSave({ date, time })} />
          </div>
        ) : (
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setDetailBooking(b)}>
              <Calendar size={15} className="text-[#8B4513] shrink-0" />
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-extrabold text-gray-900">{formatDateTimeCombined(b.date, b.time, "en")}</span>
              </div>
            </div>
            <MobileEditBtn field="datetime" />
          </div>
        )}

        {/* Edit Price on Mobile Card */}
        {editingField === "price" && (
          <div className="bg-[#F8F9FA] rounded-xl p-3 flex flex-col gap-2 border border-gray-200 mt-1" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Edit Booking Price (€)</div>
            <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
              className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-900 outline-none focus:border-[#8B4513] focus:ring-2 focus:ring-[#8B4513]/10 bg-white" placeholder="0.00" autoFocus />
            <SaveCancelBtns onSave={() => handleSave({ price: parseFloat(String(price)) || 0 })} />
          </div>
        )}
      </div>

      {/* ── Section 2: Route (Pickup -> Dropoff) ── */}
      <div className="border-t border-[#E5E7EB] pt-3">
        {editingField === "route" ? (
          <div className="bg-[#F8F9FA] rounded-xl p-3 flex flex-col gap-2 border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Edit Route</div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Pickup</label>
              <input type="text" value={pickup} onChange={e => setPickup(e.target.value)}
                className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-900 outline-none focus:border-[#8B4513] focus:ring-2 focus:ring-[#8B4513]/10 bg-white" placeholder="Pickup address" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Dropoff</label>
              <input type="text" value={dropoff} onChange={e => setDropoff(e.target.value)}
                className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-600 outline-none focus:border-[#8B4513] focus:ring-2 focus:ring-[#8B4513]/10 bg-white" placeholder="Dropoff address" />
            </div>
            <SaveCancelBtns onSave={() => handleSave({ pickup, dropoff })} />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-[#F9FAFB] rounded-xl p-3 border border-gray-100 min-w-0" onClick={() => setDetailBooking(b)}>
            <MapPin size={15} className="text-[#8B4513] shrink-0" />
            <div className="text-[14px] font-extrabold text-gray-900 truncate flex-1 min-w-0" title={cleanLocation(b.pickup)}>{cleanLocation(b.pickup)}</div>
            <ArrowRight size={16} className="text-gray-400 shrink-0 mx-0.5" strokeWidth={2.5} />
            <div className="text-[14px] font-extrabold text-gray-900 truncate flex-1 min-w-0 text-right" title={cleanLocation(b.dropoff)}>{cleanLocation(b.dropoff)}</div>
            <MobileEditBtn field="route" />
          </div>
        )}
      </div>



      {/* ── Section 4: Driver Assignment ── */}
      <div className="border-t border-[#E5E7EB] pt-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Driver</span>
        </div>
        {editingField === "driver" ? (
          <div className="flex flex-col gap-2 bg-[#F8F9FA] rounded-xl p-3 border border-gray-200 w-full" onClick={e => e.stopPropagation()}>
            <select value={driver} onChange={e => setDriver(e.target.value)}
              className="text-[12px] border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none font-bold text-gray-800 bg-white w-full focus:border-[#8B4513]">
              <option value="">Select driver...</option>
              {drivers?.filter((d: any) => d.status === 'Active').map((d: any) => (
                <option key={d.driverId || d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500">PAYOUT {"\u20AC"}:</span>
              <input type="number" value={driverPrice} onChange={e => setDriverPrice(e.target.value)}
                className="text-[12px] border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none font-bold text-gray-800 bg-white flex-1 focus:border-[#8B4513]" placeholder="Amount" />
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={(e) => handleSave({ driver, driverPrice })} className="bg-[#8B4513] hover:bg-[#6b340e] text-white text-[11px] px-3 py-1.5 rounded-lg font-bold flex-1 transition-colors">Save</button>
              <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[11px] px-3 py-1.5 rounded-lg font-bold flex-1 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full gap-2">
            {b.driver ? (
              <div className="flex items-center justify-between px-3 py-1.5 bg-orange-50 text-[#8B4513] rounded-lg text-[11px] font-bold border border-blue-100 min-h-8 flex-1">
                <div className="flex items-center gap-2 truncate">
                  <Users size={13} className="shrink-0" />
                  <span className="truncate">{b.driver}</span>
                </div>
                {b.driverPrice && (
                    <div className="shrink-0 bg-white px-1.5 py-0.5 rounded shadow-sm border border-orange-100 ml-2 text-[12px] font-black flex items-center">
                      <span>{"\u20AC"}{b.driverPrice}</span>
                    </div>
                  )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 text-gray-500 rounded-lg text-[11px] font-bold border border-gray-200 h-8 flex-1">
                <Users size={13} className="shrink-0 text-gray-400" />
                Not Assigned
              </span>
            )}
            <MobileEditBtn field="driver" />
          </div>
        )}

        {/* Second Driver Box (Mobile) */}
        {isEditingDriver2 ? (
          <div className="flex flex-col gap-2 bg-purple-50/50 rounded-xl p-3 border border-purple-200 w-full mt-1" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">Assign 2nd Driver</div>
            <select value={driver2} onChange={e => setDriver2(e.target.value)}
              className="text-[12px] border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none font-bold text-gray-800 bg-white w-full focus:border-purple-600">
              <option value="">Select 2nd driver...</option>
              {drivers?.filter((d: any) => d.status === 'Active').map((d: any) => (
                <option key={d.driverId || d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500">PAYOUT {"\u20AC"}:</span>
              <input type="number" value={driver2Price} onChange={e => setDriver2Price(e.target.value)}
                className="text-[12px] border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none font-bold text-gray-800 bg-white flex-1 focus:border-purple-600" placeholder="Amount" />
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={(e) => { e.stopPropagation(); handleSave({ driver2, driver2Price }); setIsEditingDriver2(false); }} className="bg-purple-800 hover:bg-purple-900 text-white text-[11px] px-3 py-1.5 rounded-lg font-bold flex-1 transition-colors">Save</button>
              <button onClick={(e) => { e.stopPropagation(); setIsEditingDriver2(false); setDriver2(b.driver2 || ""); setDriver2Price(b.driver2Price || ""); }} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[11px] px-3 py-1.5 rounded-lg font-bold flex-1 transition-colors">Cancel</button>
              {b.driver2 && (
                <button onClick={(e) => { e.stopPropagation(); handleSave({ driver2: "", driver2Price: "" }); setDriver2(""); setDriver2Price(""); setIsEditingDriver2(false); }} className="bg-red-50 text-red-600 border border-red-200 text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-colors">Remove</button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full gap-2 mt-0.5" onClick={e => e.stopPropagation()}>
            {b.driver2 ? (
              <div onClick={() => setIsEditingDriver2(true)} className="flex items-center justify-between px-3 py-1.5 bg-purple-50 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200 min-h-8 flex-1 cursor-pointer hover:bg-purple-100 transition-colors">
                <div className="flex items-center gap-2 truncate">
                  <Users size={13} className="shrink-0 text-purple-600" />
                  <span className="truncate">2nd: {b.driver2}</span>
                </div>
                {b.driver2Price && (
                  <div className="shrink-0 bg-white px-1.5 py-0.5 rounded shadow-sm border border-purple-200 ml-2 text-[12px] font-black text-purple-800 flex items-center">
                    <span>{"\u20AC"}{b.driver2Price}</span>
                  </div>
                )}
              </div>
            ) : (
              <span onClick={() => setIsEditingDriver2(true)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg text-[11px] font-semibold border border-dashed border-gray-300 h-8 flex-1 cursor-pointer transition-colors">
                <Users size={13} className="shrink-0 text-gray-400" />
                + 2nd Driver
              </span>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════
   TABLE ROW COMPONENT
═══════════════════════════════════════════════ */
function BookingTableRow({ b, setDetailBooking, updateStatus, zoomedBookingId, setZoomedBookingId, onDeleteClick, drivers }: any) {
  const conf = getStatusConfig(b.status);
  const isZoomed = zoomedBookingId === b.id;

  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [pickup, setPickup] = useState(b.pickup || "");
  const [dropoff, setDropoff] = useState(b.dropoff || "");

  const [isEditingDateTime, setIsEditingDateTime] = useState(false);
  const [date, setDate] = useState(b.date || "");
  const [time, setTime] = useState(b.time || "");

  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [price, setPrice] = useState(b.price || "");
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  const [isManualDriver, setIsManualDriver] = useState(false);
  const [driver, setDriver] = useState(b.driver || "");
  const [driverPrice, setDriverPrice] = useState(b.driverPrice || "");
  const [isManualDriver2, setIsManualDriver2] = useState(false);
  const [driver2, setDriver2] = useState(b.driver2 || "");
  const [driver2Price, setDriver2Price] = useState(b.driver2Price || "");

  const handleSave = async (e: any, updateObj: any, setEditState: any) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'bookings', b.id), updateObj);
      Object.assign(b, updateObj);
      setEditState(false);
    } catch (err) {
      console.error("Failed to update", err);
      alert("Update failed");
    }
  };

  const EditIcon = ({ onClick }: any) => (
    <button onClick={onClick} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-[#8B4513] p-1 shrink-0 transition-opacity" title="Edit">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
    </button>
  );

  const isCancelled = b.status?.toUpperCase() === 'CANCELLED' || b.status?.toUpperCase() === 'CANCELED';
  return (
    <tr
      className={`transition-colors cursor-pointer group ${isCancelled ? 'bg-red-100 hover:bg-red-200 border-b-2 border-red-400 shadow-inner' : 'hover:bg-gray-50'}`}
      onClick={() => setDetailBooking(b)}
    >
      <td className="px-5 py-4">
        <div className="relative">
          <div
            onClick={(e) => {
              e.stopPropagation();
              setZoomedBookingId((prev: any) => prev === b.id ? null : b.id);
            }}
            className={`client-name-trigger cursor-pointer inline-block origin-left transition-all duration-300 ease-in-out font-black text-gray-900 text-[15px]
              ${isZoomed
                ? "scale-[1.5] text-gray-900 font-bold bg-white border border-gray-200 shadow-xl px-2 py-0.5 rounded-lg z-50 relative cursor-pointer"
                : ""
              }`}
          >
            {normalizeCustomerName(b.customerName)}
          </div>
        </div>
        <div className="text-[#6B7280] text-[12px] font-medium mt-0.5">{b.bookingId}</div>
        {(b.passengers || 0) > 0 && (
          <div className="text-sm text-gray-500 flex items-center gap-1 mt-1">
            <Users size={14} /> {b.passengers}
          </div>
        )}
        <div className="mt-1.5" onClick={e => e.stopPropagation()}>
          {isEditingDriver ? (
            <div className="flex flex-col gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl w-max shadow-md" onClick={e => e.stopPropagation()}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">1st Driver:</div>
              <div className="flex items-center gap-2">
                {isManualDriver ? (
                  <input type="text" value={driver} onChange={e => setDriver(e.target.value)} onClick={e => e.stopPropagation()} className="text-[12px] border border-gray-300 rounded px-2 py-1 font-bold text-gray-800 outline-none w-36 shadow-sm bg-white" placeholder="Driver name" autoFocus />
                ) : (
                  <select value={driver} onChange={e => setDriver(e.target.value)} onClick={e => e.stopPropagation()}
                    className="text-[12px] border border-gray-300 rounded px-2 py-1 font-bold text-gray-800 outline-none w-36 shadow-sm bg-white" autoFocus>
                    <option value="">Select driver...</option>
                    {drivers?.filter((d: any) => d.status === 'Active').map((d: any) => (
                      <option key={d.driverId || d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                )}
                <button onClick={(e) => { e.stopPropagation(); setIsManualDriver(!isManualDriver); }} className="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 p-1 rounded transition-colors" title={isManualDriver ? "Select from list" : "Type manually"}>
                  {isManualDriver ? <ClipboardList size={12} /> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 w-16">PAYOUT {"\u20AC"}:</span>
                <input type="number" value={driverPrice} onChange={e => setDriverPrice(e.target.value)} onClick={e => e.stopPropagation()} className="text-[12px] border border-gray-300 rounded px-2 py-1 font-bold text-gray-800 outline-none w-20 shadow-sm bg-white" placeholder="Price" />
              </div>

              {/* ── 2nd Driver Inside Box ── */}
              <div className="pt-2 border-t border-gray-200 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">2nd Driver (Optional):</span>
                <div className="flex items-center gap-2">
                  {isManualDriver2 ? (
                    <input type="text" value={driver2} onChange={e => setDriver2(e.target.value)} onClick={e => e.stopPropagation()} className="text-[12px] border border-gray-300 rounded px-2 py-1 font-bold text-gray-800 outline-none w-36 shadow-sm bg-white" placeholder="2nd driver name" />
                  ) : (
                    <select value={driver2} onChange={e => setDriver2(e.target.value)} onClick={e => e.stopPropagation()}
                      className="text-[12px] border border-gray-300 rounded px-2 py-1 font-bold text-gray-800 outline-none w-36 shadow-sm bg-white">
                      <option value="">Select 2nd driver...</option>
                      {drivers?.filter((d: any) => d.status === 'Active').map((d: any) => (
                        <option key={d.driverId || d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setIsManualDriver2(!isManualDriver2); }} className="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 p-1 rounded transition-colors" title={isManualDriver2 ? "Select from list" : "Type manually"}>
                    {isManualDriver2 ? <ClipboardList size={12} /> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500 w-16">PAYOUT {"\u20AC"}:</span>
                  <input type="number" value={driver2Price} onChange={e => setDriver2Price(e.target.value)} onClick={e => e.stopPropagation()} className="text-[12px] border border-gray-300 rounded px-2 py-1 font-bold text-gray-800 outline-none w-20 shadow-sm bg-white" placeholder="Price" />
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-gray-100">
                <button onClick={(e) => {
                  const sel = drivers?.find((d: any) => d.name === driver);
                  handleSave(e, { driver, driverPrice, driverId: sel?.driverId || "", driver2, driver2Price }, setIsEditingDriver);
                }} className="bg-[#8B4513] text-white text-[10px] px-3 py-1.5 rounded font-bold hover:bg-[#6b340e] flex-1">Save</button>
                <button onClick={(e) => { e.stopPropagation(); setIsEditingDriver(false); setDriver(b.driver || ""); setDriverPrice(b.driverPrice || ""); setDriver2(b.driver2 || ""); setDriver2Price(b.driver2Price || ""); setIsManualDriver(false); setIsManualDriver2(false); }} className="bg-gray-200 text-gray-700 text-[10px] px-3 py-1.5 rounded font-bold hover:bg-gray-300 flex-1">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1 w-max">
              <div className="flex items-center gap-1 group/driver">
                {b.driver ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-orange-50 text-amber-900 rounded text-[11px] font-bold border border-orange-200">
                    <Users size={12} /> {b.driver}
                    {b.driverPrice && (
                      <span className="bg-white text-emerald-800 px-1.5 py-0.2 rounded border border-orange-200 text-[11px] font-black">
                        €{b.driverPrice}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[11px] font-bold border border-gray-200">
                    <Users size={12} /> Not Assigned
                  </span>
                )}
                <EditIcon onClick={(e: any) => { e.stopPropagation(); setIsEditingDriver(true); }} />
              </div>
              {/* 2nd Driver Box */}
              <div className="flex items-center gap-1 group/driver2 mt-0.5">
                {b.driver2 ? (
                  <span onClick={(e) => { e.stopPropagation(); setIsEditingDriver(true); }} className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-50 text-purple-900 rounded text-[11px] font-bold border border-purple-200 cursor-pointer">
                    <Users size={12} /> 2nd: {b.driver2}
                    {b.driver2Price && (
                      <span className="bg-white text-purple-800 px-1.5 py-0.2 rounded border border-purple-200 text-[11px] font-black">
                        €{b.driver2Price}
                      </span>
                    )}
                  </span>
                ) : (
                  <span onClick={(e) => { e.stopPropagation(); setIsEditingDriver(true); }} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded text-[11px] font-medium border border-dashed border-gray-300 cursor-pointer transition-colors" title="Add 2nd Driver">
                    <Users size={11} className="text-gray-400" /> + 2nd Driver
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </td>

      <td className="px-5 py-4 max-w-[220px]">
        {isEditingRoute ? (
          <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
            <input type="text" value={pickup} onChange={e => setPickup(e.target.value)} className="text-[13px] border rounded px-1 py-0.5 w-full font-semibold text-gray-900 outline-none focus:border-[#8B4513]" placeholder="Pickup" />
            <input type="text" value={dropoff} onChange={e => setDropoff(e.target.value)} className="text-[13px] border rounded px-1 py-0.5 w-full font-medium text-gray-600 outline-none focus:border-[#8B4513]" placeholder="Dropoff" />
            <div className="flex gap-1 mt-1">
              <button onClick={(e) => handleSave(e, { pickup, dropoff }, setIsEditingRoute)} className="bg-[#8B4513] hover:bg-[#6b340e] text-white text-[10px] px-2 py-0.5 rounded font-bold transition-colors">Save</button>
              <button onClick={(e) => { e.stopPropagation(); setIsEditingRoute(false); setPickup(b.pickup); setDropoff(b.dropoff); }} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] px-2 py-0.5 rounded font-bold transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="overflow-hidden pr-2">
              <div className="text-gray-900 font-extrabold text-[15px] truncate" title={cleanLocation(b.pickup)}>
                {cleanLocation(b.pickup)}
              </div>
              <div className="text-gray-800 font-bold text-[14px] truncate mt-1 flex items-center gap-1" title={cleanLocation(b.dropoff)}>
                <ArrowRight size={12} className="text-[#8B4513] shrink-0" strokeWidth={3} />
                {cleanLocation(b.dropoff)}
              </div>
            </div>
            <EditIcon onClick={(e: any) => { e.stopPropagation(); setIsEditingRoute(true); }} />
          </div>
        )}
      </td>

      <td className="px-5 py-4">
        {isEditingDateTime ? (
          <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
            <input type="text" value={date} onChange={e => setDate(e.target.value)} className="text-[13px] border rounded px-1 py-0.5 w-full font-bold text-gray-900 outline-none focus:border-[#8B4513]" placeholder="Date" />
            <input type="text" value={time} onChange={e => setTime(e.target.value)} className="text-[13px] border rounded px-1 py-0.5 w-full font-black text-[#8B4513] outline-none focus:border-[#8B4513]" placeholder="Time" />
            <div className="flex gap-1 mt-1">
              <button onClick={(e) => handleSave(e, { date, time }, setIsEditingDateTime)} className="bg-[#8B4513] hover:bg-[#6b340e] text-white text-[10px] px-2 py-0.5 rounded font-bold transition-colors">Save</button>
              <button onClick={(e) => { e.stopPropagation(); setIsEditingDateTime(false); setDate(b.date); setTime(b.time); }} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] px-2 py-0.5 rounded font-bold transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="font-extrabold text-gray-900 text-[15px]">
                {formatDateDisplay(b.date, "en")}
              </div>
              <div className="text-[#8B4513] font-black text-[16px] mt-0.5">
                {formatTimeDisplay(b.time, "en")}
              </div>
            </div>
            <EditIcon onClick={(e: any) => { e.stopPropagation(); setIsEditingDateTime(true); }} />
          </div>
        )}
      </td>

      <td className="px-5 py-4">
        {isEditingPrice ? (
          <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="text-[13px] border rounded px-1.5 py-0.5 w-24 font-bold text-gray-900 outline-none focus:border-[#8B4513]"
              placeholder="Price"
              autoFocus
            />
            <div className="flex gap-1 mt-1">
              <button onClick={(e) => handleSave(e, { price: parseFloat(String(price)) || 0 }, setIsEditingPrice)} className="bg-[#8B4513] hover:bg-[#6b340e] text-white text-[10px] px-2 py-0.5 rounded font-bold transition-colors">Save</button>
              <button onClick={(e) => { e.stopPropagation(); setIsEditingPrice(false); setPrice(b.price || ""); }} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] px-2 py-0.5 rounded font-bold transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between group/price">
            <div>
              <div className="font-extrabold text-emerald-800 text-[15px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 inline-block">
                {b.price ? `€${Number(b.price).toFixed(2)}` : '€0.00'}
              </div>
              {b.paymentStatus && (
                <div className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">
                  {b.paymentStatus}
                </div>
              )}
            </div>
            <EditIcon onClick={(e: any) => { e.stopPropagation(); setIsEditingPrice(true); }} />
          </div>
        )}
      </td>



      <td className="px-3 py-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          {isCancelled && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (confirm(`Pull booking ${b.bookingId} back to Active Bookings?`)) {
                  await updateStatus(b.id, "confirmed");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-all shadow-sm cursor-pointer"
              title="Pull back to Active Bookings"
            >
              <RefreshCw size={12} strokeWidth={2.5} /> Restore to Active
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteClick && onDeleteClick(b); }}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-all"
            title="Delete booking"
          >
            <Trash2 size={12} strokeWidth={2.5} /> Delete
          </button>
        </div>
      </td>

    </tr>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function AdminDashboard() {
  const [authed, setAuthed] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [section, setSection] = useState<string>("reservations");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [newBookingAlert, setNewBookingAlert] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('cancelledModalDismissed') !== 'true') {
      setShowCancelledModal(true);
    }
  }, []);
  const audioEnabledRef = useRef(true);

  const enableAudio = useCallback(() => {
    setAudioEnabled(true);
    audioEnabledRef.current = true;

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      gainNode.gain.value = 0;
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) { }
  }, []);

  const playBeep = useCallback(() => {
    if (!audioEnabledRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) { }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setAuthed(true);
      setIsAuthLoading(false);
    }, (error: any) => {
      console.error("Auth state change error:", error);
      setIsAuthLoading(false);
    });

    if (typeof window !== "undefined" && localStorage.getItem("easyride_admin_token") === "authenticated") {
      setAuthed(true);
    }

    // Safety fallback: hide loader after 2s
    const fallbackTimer = setTimeout(() => setIsAuthLoading(false), 2000);

    return () => {
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);


  // Auto-Update PWA Polling
  useEffect(() => {
    let initialVersion: string | number | null = null;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();
          if (!initialVersion) {
            initialVersion = data.version;
          } else if (data.version && data.version !== initialVersion) {
            console.log("New app version detected, showing warning...");
            setUpdateAvailable(true);
            clearInterval(interval);
          }
        }
      } catch (e) {
        // silently ignore
      }
    }, 180000); // check every 3 minutes to save bandwidth
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    let isInitial = true;
    const q = collection(db, "bookings");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Booking))
          .filter(b => b.status !== "pending_payment");
        console.log('Bookings received from DB:', docs.length, 'paid/confirmed bookings');
        docs.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
        setBookings(docs);
        setFetchError(null);
        setLoading(false);

        if (!isInitial) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const booking = change.doc.data() as Booking;
              console.log('🔔 New booking:', booking.bookingId);

              if (Notification.permission === 'granted') {
                const notifTitle = '🟠 New Viator Booking!';
                const notifOptions = {
                  body: `${booking.customerName} - ${booking.date}`,
                  icon: '/icon.png?v=4'
                };

                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then((registration) => {
                    registration.showNotification(notifTitle, notifOptions);
                  }).catch(() => {
                    new Notification(notifTitle, notifOptions);
                  });
                } else {
                  new Notification(notifTitle, notifOptions);
                }
              }

              playBeep();

              setNewBookingAlert(`New booking from ${booking.customerName}!`);
              setTimeout(() => setNewBookingAlert(null), 5000);
            }
          });
        }
        isInitial = false;
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        setFetchError(error.message || "Failed to fetch bookings.");
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authed, playBeep]);

  const [loginError, setLoginError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (password === "admin123" || password === "taxisbarcelona24" || password === "admin") {
      setAuthed(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("easyride_admin_token", "authenticated");
      }
    } else {
      setLoginError("Invalid Admin Password");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) { }
    setAuthed(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem("easyride_admin_token");
    }
  };

  /* ── Login Screen ── */
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 font-sans">
        <Loader2 className="w-10 h-10 animate-spin text-[#8B4513] mb-4" />
        <p className="text-gray-500 font-medium">Verifying authentication...</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full">
          <img src="/ADMIN FAVICON AND APP LOGO.png?v=2" alt="Admin Logo" className="h-20 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-black text-center text-gray-900 mb-1">
            Viator Admin Portal
          </h1>
          <p className="text-center text-[#6B7280] text-xs mb-6 font-medium">
            Enter Admin Password to access
          </p>

          {loginError && (
            <div className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold p-3 rounded-lg mb-4 text-center">
              {loginError}
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Admin Password</label>
              <input
                type="password"
                placeholder="Password"
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="w-full py-3.5 bg-[#8B4513] text-white rounded-xl font-bold text-[15px] hover:bg-[#8B4513]/90 transition-colors shadow-sm">
            Access Admin Dashboard
          </button>
        </form>
      </div>
    );
  }

  /* ── Render active section content ── */
  const renderSection = () => {
    const mobileStatusMap: Record<string, string> = {
      confirmed: "pending",
      completed: "completed",
      cancelled: "cancelled",
      deleted: "deleted",
    };

    if (section in mobileStatusMap) {
      return (
        <ReservationsSection
          bookings={bookings}
          loading={loading}
          onRefresh={() => { }}
          setBookings={setBookings}
          defaultFilter={mobileStatusMap[section]}
        />
      );
    }
    if (section === "reservations") return <ReservationsSection bookings={bookings} loading={loading} onRefresh={() => { }} setBookings={setBookings} defaultFilter="ALL" />;
    if (section === "new") return <NewReservationSection db={db} onCreated={() => setSection("reservations")} />;
    if (section === "invoice") return <GenerateInvoiceSection bookings={bookings} db={db} />;
  };

  return (
    <div className="h-screen max-h-screen bg-[#F8F9FA] print:bg-white flex flex-col md:flex-row overflow-hidden print:overflow-visible font-sans">
      <EmailWorkerStarter />

      {updateAvailable && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center border-t-4 border-red-500 animate-in zoom-in duration-300">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-black text-gray-900 mb-2">New Update Available!</h2>
            <p className="text-gray-600 text-[14px] font-medium mb-6 leading-relaxed">A brand new code change has just been deployed to the servers. Please update your app now to continue.</p>
            <button
              onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then((registrations) => {
                    registrations.forEach(r => r.unregister());
                    window.location.reload();
                  });
                } else {
                  window.location.reload();
                }
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 px-4 rounded-lg shadow-md transition-colors"
            >
              Update App Now
            </button>
          </div>
        </div>
      )}

      {newBookingAlert && (
        <div className="fixed top-0 left-0 right-0 bg-green-500 text-white text-center py-3 px-4 z-[999] font-bold shadow-md">
          🔔 {newBookingAlert}
        </div>
      )}

      {/* ── Desktop Sidebar (locked, non-scrolling) ── */}
      <aside className="hidden md:flex w-64 h-screen max-h-screen bg-white border-r border-gray-100 flex-col shrink-0 shadow-sm z-10 print:hidden sticky top-0 left-0">
        <div className="flex items-center justify-center gap-3 px-6 py-3 border-b border-gray-100">
          <img src="/ADMIN FAVICON AND APP LOGO.png?v=2" alt="Admin Logo" className="h-20 object-contain w-full" />
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {SIDEBAR_NAV.map(item => {
            const Icon = item.icon;
            const isActive = section === item.id || (item.id === "reservations" && ["confirmed", "completed", "cancelled"].includes(section));
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-bold transition-all text-left
                  ${isActive ? "bg-[#8B4513]/10 text-[#8B4513]" : "text-[#6B7280] hover:text-[#8B4513] hover:bg-[#F8F9FA]"}`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-6 py-4 border-t border-gray-100">

        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-8 py-6 text-[#6B7280] hover:text-red-600 transition-colors text-[15px] border-t border-gray-100 font-bold"
        >
          <LogOut size={20} strokeWidth={2} /> Sign out
        </button>
      </aside>

      <div className="md:hidden flex items-center justify-between bg-white px-4 py-1.5 shrink-0 z-40 sticky top-0 border-b border-gray-100 shadow-sm print:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/ADMIN FAVICON AND APP LOGO.png?v=2" alt="Admin Logo" className="h-[55px] object-contain" />
        </div>
        <div className="flex items-center gap-4">


          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg transition-colors active:bg-red-100 shadow-sm"
          >
            <LogOut size={14} strokeWidth={2.5} /> Logout
          </button>
        </div>
      </div>

      {/* ── Main Content (only this side scrolls) ── */}
      <main className="flex-1 h-screen max-h-screen overflow-y-auto overflow-x-hidden pb-24 md:pb-8 print:w-full print:block print:p-0 print:m-0 print:overflow-visible print:bg-white">
        {fetchError && (
          <div className="p-4 m-4 bg-red-50 border-l-4 border-red-500 text-red-700">
            <h3 className="font-bold">Error Fetching Data</h3>
            <p>{fetchError}</p>
            <p className="text-sm mt-2 opacity-80">This typically happens if Supabase environment variables are missing on the production deployment. Check environment variables for NEXT_PUBLIC_SUPABASE_URL.</p>
          </div>
        )}
        {renderSection()}
      </main>

      {/* ── Mobile Bottom Navigation (hidden on desktop) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 h-16 flex flex-col justify-center print:hidden"
        style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.04)" }}>
        <div className="flex items-stretch px-2">
          {BOTTOM_NAV.map(item => {
            const Icon = item.icon;
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex-1 flex flex-col items-center justify-center px-1 transition-all min-w-0
                  ${isActive ? "text-[#8B4513]" : "text-[#9CA3AF]"}`}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`mb-1 shrink-0 ${isActive ? "text-[#8B4513]" : "text-[#9CA3AF]"}`}
                />
                <span
                  className="text-[11px] font-bold leading-none truncate w-full text-center tracking-wide"
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

    </div>
  );
}

/* ═══════════════════════════════════════════════
   1. MY RESERVATIONS
═══════════════════════════════════════════════ */
const toISODateString = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateForSort = (d: any): Date | null => {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim().toUpperCase();
  if (trimmed === 'MISSING' || trimmed === '') return null;

  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month, day);
    if (!isNaN(dateObj.getTime())) {
      return dateObj;
    }
  }

  if (trimmed.includes('/')) {
    const [datePart] = trimmed.split(',');
    const slashParts = datePart.trim().split('/');
    if (slashParts.length === 3) {
      const day = parseInt(slashParts[0], 10);
      const month = parseInt(slashParts[1], 10) - 1;
      const year = parseInt(slashParts[2], 10);
      const dateObj = new Date(year, month, day);
      if (!isNaN(dateObj.getTime())) {
        return dateObj;
      }
    }
  }

  try {
    let dateStr = d;
    if (!/\d{4}/.test(dateStr)) {
      dateStr = `${dateStr} 2024`;
    }
    const dateObj = new Date(dateStr);
    if (!isNaN(dateObj.getTime())) {
      return dateObj;
    }
  } catch { }

  return null;
};

function EmptyState({ title = "No data available", message = "There is currently no information to display here." }: { title?: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-150 shadow-sm text-center max-w-md mx-auto my-12">
      <ClipboardList className="w-12 h-12 text-gray-300 mb-4 mx-auto" />
      <h3 className="text-lg font-bold text-gray-800 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
    </div>
  );
}

function ReservationsSection({ bookings, loading, onRefresh, setBookings, defaultFilter, sourceFilter, drivers }: {
  bookings: Booking[]; loading: boolean; onRefresh: () => void; setBookings: any; defaultFilter?: string; sourceFilter?: string; drivers?: Driver[];
}) {
  const [filter, setFilter] = useState(defaultFilter === "confirmed" ? "pending" : (defaultFilter ?? "ALL"));
  const [search, setSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState("ALL");
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [mobileDeleteConfirm, setMobileDeleteConfirm] = useState<Booking | null>(null);

  if (!bookings) {
    return <EmptyState title="No bookings data" message="We couldn't retrieve any booking data. Please check your database connection or try reloading." />;
  }

  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return toISODateString(now);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const now = new Date();
    now.setDate(now.getDate() + 6);
    return toISODateString(now);
  });
  const [preset, setPreset] = useState<string>("current");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [zoomedBookingId, setZoomedBookingId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".client-name-trigger")) {
        setZoomedBookingId(null);
      }
    };
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, []);

  useEffect(() => {
    if (defaultFilter) setFilter(defaultFilter);
  }, [defaultFilter]);

  const handlePresetChange = (selected: string) => {
    setPreset(selected);
    const now = new Date();

    if (selected === "current") {
      setStartDate(toISODateString(now));
      const next = new Date();
      next.setDate(now.getDate() + 6);
      setEndDate(toISODateString(next));
    } else if (selected === "upcoming") {
      const next = new Date();
      next.setDate(now.getDate() + 7);
      setStartDate(toISODateString(next));
      setEndDate("");
    } else if (selected === "past") {
      setStartDate("");
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      setEndDate(toISODateString(yesterday));
      setSortOrder("desc");
    } else if (selected === "pending") {
      setStartDate("");
      setEndDate("");
      setFilter("pending");
    } else if (selected === "full") {
      setStartDate("");
      setEndDate("");
      setFilter("ALL");
    }
  };

  // Parse time strings like "7:00 AM", "14:30", "9", "09:00" into total minutes (24h)
  const parseBookingTime = (t?: string | null): number => {
    if (!t) return 9999;
    const clean = String(t).trim();
    if (!clean) return 9999;
    const ampm = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(clean);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
      const period = ampm[3].toUpperCase();
      if (period === 'AM' && h === 12) h = 0;
      if (period === 'PM' && h !== 12) h += 12;
      return h * 60 + m;
    }
    const hhmm = /(\d{1,2})[:.](\d{2})/.exec(clean);
    if (hhmm) return parseInt(hhmm[1], 10) * 60 + parseInt(hhmm[2], 10);
    const bareHour = /^(\d{1,2})$/.exec(clean);
    if (bareHour) return parseInt(bareHour[1], 10) * 60;
    return 9999;
  };

  const isBookingInPast = (bDate: Date, timeStr: string): boolean => {
    const now = new Date();
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    const bD = new Date(bDate);
    bD.setHours(0, 0, 0, 0);
    if (bD < todayMidnight) return true;
    if (bD.getTime() === todayMidnight.getTime()) {
      const bookingMins = parseBookingTime(timeStr);
      if (bookingMins < 9999) {
        const nowMins = now.getHours() * 60 + now.getMinutes();
        return bookingMins < nowMins;
      }
    }
    return false;
  };

  const filtered = bookings.filter(b => {
    // Map status strings flexibly: "NEW" (Bokun/Viator imports) means the same as "confirmed"
    const statusStr = b.status as string;
    const isCancelled = statusStr === "cancelled" || statusStr === "CANCELLED" || statusStr === "CANCELED";
    const isDeleted = statusStr === "DELETED" || statusStr === "deleted";
    const isIncomplete = statusStr === "INCOMPLETE" || statusStr === "incomplete";
    const matchFilter = (filter === "ALL" && !isCancelled && !isDeleted)
      || (filter === "pending" && (statusStr === "confirmed" || statusStr === "pending_payment" || statusStr === "NEW" || statusStr === "new" || isIncomplete))
      || (filter === "completed" && (statusStr === "completed" || statusStr === "COMPLETED"))
      || (filter === "cancelled" && isCancelled)
      || (filter === "deleted" && isDeleted)
      || (filter === "needs_review" && b.pickupTimeConfidence === "review_required")
      || b.status === filter;
    const matchSource = !sourceFilter || b.source === sourceFilter;

    const s = search.toLowerCase();
    const matchSearch = !s || b.bookingId?.toLowerCase().includes(s)
      || b.customerName?.toLowerCase().includes(s)
      || b.email?.toLowerCase().includes(s)
      || b.driver?.toLowerCase().includes(s);

    const matchDriverFilter = driverFilter === "ALL"
      ? true
      : (driverFilter === "UNASSIGNED" ? !b.driver : b.driver === driverFilter);

    let matchDate = true;
    if (filter === "pending") {
      const bDate = parseDateForSort(b.date);
      if (isIncomplete) {
        // INCOMPLETE bookings have no date — always show them so they're never hidden
        matchDate = true;
      } else if (bDate) {
        if (isBookingInPast(bDate, b.time)) matchDate = false;
      } else {
        matchDate = false;
      }
    } else if (startDate || endDate) {
      const bDate = parseDateForSort(b.date);
      if (bDate) {
        const bD = new Date(bDate);
        bD.setHours(0, 0, 0, 0);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (bD < start) matchDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (bD > end) matchDate = false;
        }
        // Hide past bookings only for current/upcoming views (but allow today's past bookings)
        if ((preset === "current" || preset === "upcoming") && matchDate) {
          const now = new Date();
          const todayMidnight = new Date(now);
          todayMidnight.setHours(0, 0, 0, 0);
          if (bDate.getTime() < todayMidnight.getTime()) {
            matchDate = false;
          }
        }
      } else {
        matchDate = false;
      }
    }

    const matched = matchFilter && matchSearch && matchDate && matchSource && matchDriverFilter;
    return matched;
  });

  // Client-side console logging to trace document counts when tabs are clicked
  console.log(`[Frontend Filter] Selected tab: "${filter}" | Match count: ${filtered.length} of ${bookings.length}`);

  const sorted = [...filtered].sort((a, b) => {
    const dateA = parseDateForSort(a.date);
    const dateB = parseDateForSort(b.date);

    if (dateA === null && dateB === null) return 0;
    if (dateA === null) return 1;
    if (dateB === null) return -1;

    // Force chronological (ascending) sort for the Pending tab
    const effectiveSortOrder = filter === "pending" ? "asc" : sortOrder;

    let diff = dateA.getTime() - dateB.getTime();
    if (effectiveSortOrder === "desc") {
      diff = dateB.getTime() - dateA.getTime();
    }

    if (diff !== 0) return diff;

    // Chronological sort by minutes within same date: early first (9 AM before 10 AM before 2 PM)
    const minsA = parseBookingTime(a.time);
    const minsB = parseBookingTime(b.time);
    if (minsA !== minsB) {
      return effectiveSortOrder === "desc" ? minsB - minsA : minsA - minsB;
    }

    return (a.bookingId || "").localeCompare(b.bookingId || "");
  });

  const updateStatus = async (id: string, status: string) => {
    try { await updateDoc(doc(db, "bookings", id), { status }); } catch { }
    setBookings((prev: Booking[]) => prev.map(b => b.id === id ? { ...b, status: status as BookingStatus } : b));
  };


  return (
    <div className="p-4 md:p-8">
      {/* Booking Detail Modal */}
      {/* Mobile Delete Confirmation Modal */}
      {mobileDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-red-600" size={20} />
                <h3 className="font-black text-red-900 text-lg">Delete Booking</h3>
              </div>
              <button
                onClick={() => setMobileDeleteConfirm(null)}
                className="text-red-400 hover:text-red-700 hover:bg-red-100/50 p-1.5 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5">
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                <div className="text-xs font-bold text-gray-500 mb-1">{mobileDeleteConfirm.bookingId}</div>
                <div className="font-black text-gray-900">{normalizeCustomerName(mobileDeleteConfirm.customerName)}</div>
              </div>

              <p className="text-gray-700 font-medium mb-6">
                Are you sure you want to delete this booking?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setMobileDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      const { serverTimestamp } = await import('@/lib/supabase-client');
                      await updateDoc(doc(db, "bookings", mobileDeleteConfirm.id), {
                        status: "DELETED",
                        deletedAt: serverTimestamp(),
                        deletedBy: auth.currentUser?.email || "admin",
                      });
                      setMobileDeleteConfirm(null);
                    } catch (error) {
                      console.error("Error deleting booking:", error);
                      alert("Failed to delete booking.");
                    }
                  }}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailBooking && (
        <BookingDetailModal booking={detailBooking} onClose={() => setDetailBooking(null)} drivers={drivers} updateStatus={updateStatus} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">My Reservations</h1>
          <p className="text-[#6B7280] text-[15px] font-medium mt-1">{bookings.length} total bookings</p>
        </div>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then((registrations) => {
                  registrations.forEach(r => r.unregister());
                  window.location.reload();
                });
              } else {
                window.location.reload();
              }
            }
          }}
          className="hidden md:flex items-center gap-2 px-4 py-2 text-[15px] font-bold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-gray-700"
        >
          <RefreshCw size={18} strokeWidth={2.5} />
          <span>Update App</span>
        </button>

      </div>

      {/* Search (Full width) */}
      <div className="relative w-full mb-6">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2.5} />
        <input
          type="text"
          placeholder="Search booking ID, name, email…"
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[16px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all shadow-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Admin Controls Panel */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Date Pickers */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <span className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${preset !== "custom" ? "text-gray-300" : "text-gray-400"}`}>Start Date</span>
            <input
              type="date"
              value={startDate}
              disabled={preset !== "custom"}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPreset("custom");
              }}
              className={`px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-[#8B4513]/10 focus:border-[#8B4513] transition-all ${preset !== "custom" ? "opacity-50 cursor-not-allowed" : ""}`}
            />
          </div>

          <div className="flex flex-col">
            <span className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${preset !== "custom" ? "text-gray-300" : "text-gray-400"}`}>End Date</span>
            <input
              type="date"
              value={endDate}
              disabled={preset !== "custom"}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPreset("custom");
              }}
              className={`px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-[#8B4513]/10 focus:border-[#8B4513] transition-all ${preset !== "custom" ? "opacity-50 cursor-not-allowed" : ""}`}
            />
          </div>
        </div>

        {/* View Options & Sorting */}
        <div className="flex flex-wrap items-end gap-3 sm:justify-end">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">View Options</span>
            <select
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-[#8B4513]/10 focus:border-[#8B4513] transition-all cursor-pointer min-w-[180px]"
            >
              <option value="current">Current</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="custom">Custom Range</option>
              <option value="pending">All Pending</option>
              <option value="full">Full List</option>
            </select>
          </div>

          <button
            onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#8B4513]/10 hover:bg-[#8B4513]/20 text-[#8B4513] rounded-lg text-sm font-bold transition-all border border-[#8B4513]/10 h-[38px] cursor-pointer"
          >
            Sort: {sortOrder === "asc" ? "Earliest First" : "Latest First"}
          </button>
        </div>
      </div>

      {/* Desktop Filter Pills */}
      <div className="hidden md:flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-6">
        {["ALL", "pending", "cancelled", "needs_review", "INCOMPLETE"].map(f => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              if (preset === "pending" && f !== "pending") {
                setPreset("full");
              } else if (preset === "full" && f === "pending" && !startDate && !endDate) {
                setPreset("pending");
              }
            }}
            className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 border
              ${filter === f ? "bg-[#8B4513] border-[#8B4513] text-white shadow-sm" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {f === "pending" ? "Pending" : f === "needs_review" ? "⚠️ Needs Review" : f === "INCOMPLETE" ? "⚠️ Incomplete" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* ── Mobile Card View (< md) ── */}
      <div className="block md:hidden space-y-4">
        {loading && <div className="text-center py-10 text-gray-400 font-bold">Loading…</div>}
        {!loading && sorted.length === 0 && <div className="text-center py-10 text-gray-400 font-bold">No bookings found.</div>}

        {(() => {
          let lastDate = "";
          return sorted.map(b => {
            const conf = getStatusConfig(b.status);
            const bDate = b.date ? (preset === "past" ? formatMonthYearHeader(b.date) : formatDateHeader(b.date)) : "No Date";
            const showHeader = bDate !== lastDate;
            lastDate = bDate;
            return (
              <React.Fragment key={b.id}>
                {showHeader && (
                  <div className="bg-[#8B4513] text-white px-4 py-2.5 font-black text-[15px] uppercase tracking-wide rounded-lg shadow-sm mt-6 mb-3 flex items-center gap-2">
                    <Calendar size={16} strokeWidth={3} />
                    {bDate}
                  </div>
                )}
                <MobileBookingCard b={b} conf={conf} setDetailBooking={setDetailBooking} updateStatus={updateStatus} zoomedBookingId={zoomedBookingId} setZoomedBookingId={setZoomedBookingId} setBookings={setBookings} onDeleteClick={setMobileDeleteConfirm} drivers={drivers} />
              </React.Fragment>
            );
          });
        })()}
      </div>

      {/* ── Desktop Table View (≥ md) ── */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-100 overflow-x-auto w-full shadow-sm">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-[#F8F9FA] border-b border-gray-100">
            <tr className="text-[12px] uppercase text-[#6B7280] font-bold tracking-wider">
              <th className="px-5 py-4 text-left">Booking</th>
              <th className="px-5 py-4 text-left">Route</th>
              <th className="px-5 py-4 text-left">Date / Time</th>
              <th className="px-5 py-4 text-left">Price</th>
              <th className="px-3 py-4 text-right"></th>

            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 font-bold">Loading…</td></tr>}
            {!loading && sorted.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 font-bold">No bookings found.</td></tr>}
            {(() => {
              let lastDate = "";
              return sorted.map(b => {
                const bDate = b.date ? (preset === "past" ? formatMonthYearHeader(b.date) : formatDateHeader(b.date)) : "No Date";
                const showHeader = bDate !== lastDate;
                lastDate = bDate;
                return (
                  <React.Fragment key={b.id}>
                    {showHeader && (
                      <tr>
                        <td colSpan={5} className="bg-[#8B4513] text-white px-5 py-2.5 font-black text-[14px] uppercase tracking-wide">
                          <div className="flex items-center gap-2">
                            <Calendar size={16} strokeWidth={3} />
                            <span>{bDate}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <BookingTableRow key={b.id} b={b} setDetailBooking={setDetailBooking} updateStatus={updateStatus} zoomedBookingId={zoomedBookingId} setZoomedBookingId={setZoomedBookingId} onDeleteClick={setMobileDeleteConfirm} drivers={drivers} />
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BOOKING DETAIL MODAL
═══════════════════════════════════════════════ */
function BookingDetailModal({ booking, onClose, drivers, updateStatus }: { booking: Booking; onClose: () => void; drivers?: Driver[]; updateStatus?: (id: string, status: string) => Promise<void>; }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showNameSign, setShowNameSign] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(normalizeCustomerName(booking.customerName || ""));
  const [isSavingName, setIsSavingName] = useState(false);
  const [fontSizeScale, setFontSizeScale] = useState(1.0);
  const isCancelled = booking.status?.toUpperCase() === 'CANCELLED' || booking.status?.toUpperCase() === 'CANCELED';
  const hasDriver2 = Boolean(booking.driver2 && booking.driver2.trim() && booking.driver2.trim().toLowerCase() !== 'not assigned');

  // Editable address/date/time states
  const [isEditingPickup, setIsEditingPickup] = useState(false);
  const [editedPickup, setEditedPickup] = useState(booking.pickup || "");
  const [isEditingDropoff, setIsEditingDropoff] = useState(false);
  const [editedDropoff, setEditedDropoff] = useState(booking.dropoff || "");
  const [isEditingDateTime, setIsEditingDateTime] = useState(false);
  const [editedDate, setEditedDate] = useState(booking.date || "");
  const [editedTime, setEditedTime] = useState(booking.time || "");
  const [isSavingField, setIsSavingField] = useState(false);
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  const [editedDriver, setEditedDriver] = useState(booking.driver || "");
  const [editedDriverPrice, setEditedDriverPrice] = useState(booking.driverPrice || "");
  const [isEditingDriver2, setIsEditingDriver2] = useState(false);
  const [editedDriver2, setEditedDriver2] = useState(booking.driver2 || "");
  const [editedDriver2Price, setEditedDriver2Price] = useState(booking.driver2Price || "");
  const [isEditingPassengers, setIsEditingPassengers] = useState(false);
  const [editedPassengers, setEditedPassengers] = useState(booking.passengers ? String(booking.passengers) : "1");
  const [isEditingLuggage, setIsEditingLuggage] = useState(false);
  const [editedLuggage, setEditedLuggage] = useState(booking.luggage !== undefined && booking.luggage !== null ? String(booking.luggage) : "0");
  const [isEditingAirline, setIsEditingAirline] = useState(false);
  const [editedAirline, setEditedAirline] = useState(booking.airline || "");
  const [isEditingFlight, setIsEditingFlight] = useState(false);
  const [editedFlight, setEditedFlight] = useState(booking.flight || booking.flightNumber || "");
  const [isEditingCruiseShip, setIsEditingCruiseShip] = useState(false);
  const [editedCruiseShip, setEditedCruiseShip] = useState(booking.cruiseShip || "");
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [editedPrice, setEditedPrice] = useState(booking.price ? String(booking.price) : "");

  const saveField = async (updateObj: Record<string, any>, resetFn: () => void) => {
    setIsSavingField(true);
    try {
      const ref = doc(db, 'bookings', booking.id);
      await updateDoc(ref, updateObj);
      Object.assign(booking, updateObj);
      resetFn();
    } catch (error) {
      console.error("Failed to update", error);
      alert("Failed to save");
    } finally {
      setIsSavingField(false);
    }
  };

  const ModalEditBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-gray-400 hover:text-[#8B4513] active:text-[#8B4513] p-1 rounded transition-colors shrink-0"
      title="Edit"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
    </button>
  );

  const saveName = async () => {
    if (!editedName.trim() || editedName === booking.customerName) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const ref = doc(db, 'bookings', booking.id);
      await updateDoc(ref, { customerName: editedName.trim() });
      booking.customerName = editedName.trim(); // Optimistic update
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to update name", error);
      alert("Failed to save name");
    } finally {
      setIsSavingName(false);
    }
  };

  const [isEditingFullScreen, setIsEditingFullScreen] = useState(false);
  const [fullScreenName, setFullScreenName] = useState(normalizeCustomerName(booking.customerName || ""));
  const [isSavingFullScreen, setIsSavingFullScreen] = useState(false);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSoftDelete = async () => {
    setIsDeleting(true);
    try {
      const { serverTimestamp } = await import('@/lib/supabase-client');
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "DELETED",
        deletedAt: serverTimestamp(),
        deletedBy: auth.currentUser?.email || "admin",
      });
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      console.error("Error deleting:", error);
      alert("Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePermanentDelete = async () => {
    setIsDeleting(true);
    try {
      const { deleteDoc } = await import('@/lib/supabase-client');
      await deleteDoc(doc(db, "bookings", booking.id));
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      console.error("Error permanently deleting:", error);
      alert("Failed to permanently delete");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    setIsDeleting(true);
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "PENDING",
      });
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      console.error("Error restoring:", error);
      alert("Failed to restore");
    } finally {
      setIsDeleting(false);
    }
  };


  const saveFullScreenName = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!fullScreenName.trim() || fullScreenName === booking.customerName) {
      setIsEditingFullScreen(false);
      return;
    }
    setIsSavingFullScreen(true);
    try {
      const ref = doc(db, 'bookings', booking.id);
      await updateDoc(ref, { customerName: fullScreenName.trim() });
      booking.customerName = fullScreenName.trim(); // Optimistic update
      setEditedName(fullScreenName.trim()); // Keep small edit inline state sync'd
      setIsEditingFullScreen(false);
    } catch (error) {
      console.error("Failed to update name", error);
      alert("Failed to save name");
    } finally {
      setIsSavingFullScreen(false);
    }
  };

  useEffect(() => {
    // Hide the sidebar completely when viewing a booking
    const aside = document.querySelector('aside');
    if (aside) aside.classList.add('!hidden');
    return () => {
      if (aside) aside.classList.remove('!hidden');
    };
  }, []);

  const copyToClipboard = (value: string, key: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const mapsLink = (addr: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

  const Row = ({ label, value, copyKey, children }: { label: string; value?: string; copyKey?: string; children?: React.ReactNode }) => (
    <div className="flex flex-col py-1">
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">{label}</span>
      <div className="flex items-center justify-between">
        {children ?? <span className="text-[15px] font-extrabold text-gray-900 leading-snug break-words pr-2">{value || "—"}</span>}
        {copyKey && value && (
          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(value, copyKey); }} className="text-gray-400 hover:text-[#8B4513] transition-colors shrink-0 p-1" title="Copy">
            {copied === copyKey ? <CheckCircle2 size={14} className="text-green-500" /> : <ClipboardList size={14} />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] w-full h-full bg-gray-50 flex flex-col" onClick={e => e.stopPropagation()}>

      {/* Top Bar with Back Arrow */}
      <div className="flex items-center px-4 py-3 border-b border-gray-200 shrink-0 bg-white shadow-sm">
        <button onClick={onClose} className="px-4 py-2.5 -ml-1 bg-white text-gray-700 hover:bg-[#8B4513] hover:text-white rounded-xl transition-all duration-200 flex items-center gap-2 border border-gray-200 hover:border-[#8B4513] shadow-sm hover:shadow-md">
          <ArrowLeft size={18} strokeWidth={2.5} />
          <span className="font-bold text-[14px]">Back to Dashboard</span>
        </button>
      </div>

      {/* Blue Header */}
      <div className="bg-gradient-to-r from-[#8B4513] to-[#A0522D] px-4 py-3 flex flex-col shrink-0 text-white shadow-lg z-10">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-black leading-none tracking-tight">RES# {booking.bookingId}</span>
        </div>
        <div className="text-[13px] font-semibold mt-1.5 opacity-90 tracking-wide">{normalizeCustomerName(booking.customerName)}</div>
      </div>

      {/* Scrollable Body */}
      <div className="overflow-y-auto flex-1 bg-gray-50 pb-16">

        {/* Cancelled Alert & Restore Banner */}
        {isCancelled && (
          <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <XCircle className="text-red-600" size={22} />
              </div>
              <div>
                <div className="text-[14px] font-black text-red-900">This Booking is CANCELLED</div>
                <div className="text-[12px] font-medium text-red-700">Currently excluded from Active Bookings. You can pull it back anytime.</div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (confirm(`Pull booking ${booking.bookingId} back to Active Bookings?`)) {
                  setIsDeleting(true);
                  try {
                    await updateDoc(doc(db, "bookings", booking.id), { status: "confirmed" });
                    booking.status = "confirmed";
                    if (updateStatus) await updateStatus(booking.id, "confirmed");
                    onClose();
                  } catch (err) {
                    console.error("Failed to restore booking", err);
                    alert("Failed to restore booking");
                  } finally {
                    setIsDeleting(false);
                  }
                }
              }}
              disabled={isDeleting}
              className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[13px] font-bold rounded-lg transition-all shadow flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={15} strokeWidth={2.5} />
              Pull Back to Active Bookings
            </button>
          </div>
        )}

        {/* BOOKING & DRIVERS */}
        <div className="mx-4 mt-4 bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 mb-3">
          <div className="text-[11px] font-black bg-gradient-to-r from-emerald-800 to-teal-900 text-white uppercase tracking-wider mb-3 px-3.5 py-1.5 w-full rounded-lg shadow-sm">
            💶 BOOKING & 👤 {hasDriver2 || isEditingDriver2 ? 'DRIVERS' : 'DRIVER'}
          </div>

          <div className={`grid grid-cols-1 ${hasDriver2 || isEditingDriver2 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3 items-stretch`}>
            {/* 1. BOOKING PRICE */}
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 flex flex-col justify-between">
              {isEditingPrice ? (
                <div className="flex-1 flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">💶 EDIT BOOKING PRICE</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={editedPrice}
                    onChange={e => setEditedPrice(e.target.value)}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveField({ price: parseFloat(editedPrice) || 0 }, () => setIsEditingPrice(false))}
                    className="w-full text-sm font-bold text-gray-900 border border-gray-300 rounded px-2.5 py-1 outline-none focus:border-emerald-600 bg-white"
                  />
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() => saveField({ price: parseFloat(editedPrice) || 0 }, () => setIsEditingPrice(false))}
                      disabled={isSavingField}
                      className="text-[10px] font-bold bg-[#8B4513] text-white px-2.5 py-1 rounded hover:opacity-90 disabled:opacity-50"
                    >
                      {isSavingField ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setIsEditingPrice(false); setEditedPrice(booking.price ? String(booking.price) : ""); }}
                      className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2.5 py-1 rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">💶 BOOKING PRICE</span>
                    <ModalEditBtn onClick={() => setIsEditingPrice(true)} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-auto">
                    <span className="text-[19px] font-black text-emerald-800 leading-tight">
                      {booking.price ? `€${Number(booking.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€0.00'}
                    </span>
                    {booking.paymentStatus && (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                        booking.paymentStatus.toUpperCase() === 'PAID'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}>
                        {booking.paymentStatus}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 2. PRIMARY DRIVER */}
            <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-3 flex flex-col justify-between">
              {isEditingDriver ? (
                <div className="flex-1 flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">👤 ASSIGN PRIMARY DRIVER</span>
                  <select
                    className="w-full px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-medium bg-white outline-none focus:border-amber-600"
                    value={editedDriver}
                    onChange={(e) => setEditedDriver(e.target.value)}
                  >
                    <option value="">-- Select Driver --</option>
                    {(drivers || []).filter(d => d.status !== 'Deleted').map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-500 w-16">PAYOUT €:</span>
                    <input
                      type="number"
                      className="flex-1 px-2 py-0.5 border border-gray-300 rounded-lg text-xs font-bold bg-white"
                      placeholder="Price"
                      value={editedDriverPrice}
                      onChange={(e) => setEditedDriverPrice(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    <button onClick={() => saveField({ driver: editedDriver, driverPrice: editedDriverPrice }, () => setIsEditingDriver(false))} disabled={isSavingField}
                      className="text-[10px] font-bold bg-[#8B4513] text-white px-2.5 py-1 rounded-md hover:bg-[#6b340e]">Save</button>
                    <button onClick={() => { setIsEditingDriver(false); setEditedDriver(booking.driver || ""); setEditedDriverPrice(booking.driverPrice || ""); }}
                      className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2.5 py-1 rounded-md hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">👤 PRIMARY DRIVER</span>
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[8.5px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider">PRIMARY</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!hasDriver2 && !isEditingDriver2 && (
                        <button
                          type="button"
                          onClick={() => setIsEditingDriver2(true)}
                          className="px-2 py-0.5 text-[9.5px] font-bold rounded bg-purple-100/70 hover:bg-purple-200 text-purple-700 border border-purple-200 transition-colors"
                          title="Add Second Driver"
                        >
                          + Add 2nd Driver
                        </button>
                      )}
                      <ModalEditBtn onClick={() => setIsEditingDriver(true)} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-7 h-7 rounded-full bg-white border border-amber-200 flex items-center justify-center text-[#8B4513] shrink-0">
                        <Users size={13} strokeWidth={2.5} />
                      </div>
                      <span className="text-[13px] font-extrabold text-gray-900 truncate">
                        {booking.driver || "Not Assigned"}
                      </span>
                    </div>
                    {booking.driverPrice && (
                      <span className="bg-white text-emerald-800 px-2 py-0.5 rounded border border-amber-200 text-[11px] font-black shadow-sm shrink-0">
                        €{booking.driverPrice}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 3. SECOND DRIVER (Only show if assigned or actively editing) */}
            {(hasDriver2 || isEditingDriver2) && (
              <div className="rounded-xl p-3 flex flex-col justify-between border bg-purple-50/40 border-purple-200">
                {isEditingDriver2 ? (
                  <div className="flex-1 flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">👤 ASSIGN SECOND DRIVER</span>
                    <select
                      className="w-full px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-medium bg-white outline-none focus:border-purple-600"
                      value={editedDriver2}
                      onChange={(e) => setEditedDriver2(e.target.value)}
                    >
                      <option value="">-- Select 2nd Driver --</option>
                      {(drivers || []).filter((d: any) => d.status !== 'Deleted').map((d: any) => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-500 w-16">PAYOUT €:</span>
                      <input
                        type="number"
                        className="flex-1 px-2 py-0.5 border border-gray-300 rounded-lg text-xs font-bold bg-white"
                        placeholder="Price"
                        value={editedDriver2Price}
                        onChange={(e) => setEditedDriver2Price(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-1.5 mt-1">
                      <button onClick={() => saveField({ driver2: editedDriver2, driver2Price: editedDriver2Price }, () => setIsEditingDriver2(false))} disabled={isSavingField}
                        className="text-[10px] font-bold bg-[#8B4513] text-white px-2.5 py-1 rounded-md hover:bg-[#6b340e]">Save</button>
                      <button onClick={() => { setIsEditingDriver2(false); setEditedDriver2(booking.driver2 || ""); setEditedDriver2Price(booking.driver2Price || ""); }}
                        className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2.5 py-1 rounded-md hover:bg-gray-300">Cancel</button>
                      {hasDriver2 && (
                        <button onClick={() => saveField({ driver2: "", driver2Price: "" }, () => { setIsEditingDriver2(false); setEditedDriver2(""); setEditedDriver2Price(""); })}
                          className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-md hover:bg-red-100 ml-auto">Remove</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">👤 SECOND DRIVER</span>
                        <span className="bg-purple-100 text-purple-900 border border-purple-300 text-[8.5px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider">2ND</span>
                      </div>
                      <ModalEditBtn onClick={() => setIsEditingDriver2(true)} />
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-white border border-purple-200 text-purple-700">
                          <Users size={13} strokeWidth={2} />
                        </div>
                        <span className="text-[13px] font-extrabold truncate text-purple-950">
                          {booking.driver2}
                        </span>
                      </div>
                      {booking.driver2Price && (
                        <span className="bg-white text-purple-800 px-2 py-0.5 rounded border border-purple-200 text-[11px] font-black shadow-sm shrink-0">
                          €{booking.driver2Price}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* PICKUP INFORMATION */}
        <div className="mx-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-3">
          <div className="text-[12px] font-black bg-gradient-to-r from-[#8B4513] to-[#A0522D] text-white uppercase tracking-wider mb-4 px-4 py-2.5 w-full rounded-lg shadow-sm">
            📍 PICKUP INFORMATION
          </div>

          {/* Editable Pickup */}
          <div className="flex flex-col py-1">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">📍 PICKUP ADDRESS</span>
            <div className="flex items-center justify-between gap-1">
              {isEditingPickup ? (
                <div className="flex-1 flex flex-col gap-1">
                  <input type="text" value={editedPickup} onChange={e => setEditedPickup(e.target.value)} autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveField({ pickup: editedPickup }, () => setIsEditingPickup(false))}
                    className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white" />
                  <div className="flex gap-1">
                    <button onClick={() => saveField({ pickup: editedPickup }, () => setIsEditingPickup(false))} disabled={isSavingField}
                      className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50">
                      {isSavingField ? '...' : 'Save'}
                    </button>
                    <button onClick={() => { setIsEditingPickup(false); setEditedPickup(booking.pickup || ''); }}
                      className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-[15px] font-extrabold text-gray-900 leading-snug break-words pr-2 flex-1">{booking.pickup || '—'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <ModalEditBtn onClick={() => setIsEditingPickup(true)} />
                    {booking.pickup && (
                      <button onClick={(e) => { e.stopPropagation(); copyToClipboard(booking.pickup, 'pickup'); }} className="text-[#6B7280] hover:text-[#8B4513] transition-colors" title="Copy">
                        {copied === 'pickup' ? <CheckCircle2 size={12} className="text-green-500" /> : <ClipboardList size={12} />}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Editable Date / Time */}
          <div className="grid grid-cols-2 gap-2">
            {isEditingDateTime ? (
              <div className="col-span-2 flex flex-col gap-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">📅 DATE</span>
                    <input type="date" value={editedDate} onChange={e => setEditedDate(e.target.value)}
                      className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white mt-0.5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">🕐 TIME</span>
                    <input type="time" value={editedTime} onChange={e => setEditedTime(e.target.value)}
                      className="w-full text-xs font-bold text-[#8B4513] border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white mt-0.5" />
                  </div>
                </div>
                <div className="flex gap-1 mt-1">
                  <button onClick={() => saveField({ date: editedDate, time: editedTime }, () => setIsEditingDateTime(false))} disabled={isSavingField}
                    className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50">
                    {isSavingField ? '...' : 'Save'}
                  </button>
                  <button onClick={() => { setIsEditingDateTime(false); setEditedDate(booking.date || ''); setEditedTime(booking.time || ''); }}
                    className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <Row label="📅 DATE" value={formatDate(booking.date)} />
                </div>
                <div className="flex items-start justify-between">
                  <div className="flex-1"><Row label="🕐 TIME" value={booking.time} /></div>
                  <ModalEditBtn onClick={() => setIsEditingDateTime(true)} />
                </div>
              </>
            )}
          </div>

          {/* Editable Passengers & Luggage */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {/* PASSENGERS */}
            <div className="flex flex-col py-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">👥 PASSENGERS</span>
              <div className="flex items-center justify-between gap-1">
                {isEditingPassengers ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={editedPassengers}
                      onChange={e => setEditedPassengers(e.target.value)}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && saveField({ passengers: parseInt(editedPassengers, 10) || 1 }, () => setIsEditingPassengers(false))}
                      className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => saveField({ passengers: parseInt(editedPassengers, 10) || 1 }, () => setIsEditingPassengers(false))}
                        disabled={isSavingField}
                        className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                      >
                        {isSavingField ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setIsEditingPassengers(false); setEditedPassengers(booking.passengers ? String(booking.passengers) : "1"); }}
                        className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-[15px] font-extrabold text-gray-900 leading-snug break-words pr-2 flex-1">
                      {booking.passengers ? String(booking.passengers) : "1"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <ModalEditBtn onClick={() => setIsEditingPassengers(true)} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* LUGGAGE */}
            <div className="flex flex-col py-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">🧳 LUGGAGE</span>
              <div className="flex items-center justify-between gap-1">
                {isEditingLuggage ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={editedLuggage}
                      onChange={e => setEditedLuggage(e.target.value)}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && saveField({ luggage: parseInt(editedLuggage, 10) || 0 }, () => setIsEditingLuggage(false))}
                      className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => saveField({ luggage: parseInt(editedLuggage, 10) || 0 }, () => setIsEditingLuggage(false))}
                        disabled={isSavingField}
                        className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                      >
                        {isSavingField ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setIsEditingLuggage(false); setEditedLuggage(booking.luggage !== undefined && booking.luggage !== null ? String(booking.luggage) : "0"); }}
                        className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-[15px] font-extrabold text-gray-900 leading-snug break-words pr-2 flex-1">
                      {booking.luggage !== undefined && booking.luggage !== null ? String(booking.luggage) : "0"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <ModalEditBtn onClick={() => setIsEditingLuggage(true)} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            {/* AIRLINE */}
            <div className="flex flex-col py-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">✈️ AIRLINE</span>
              <div className="flex items-center justify-between gap-1">
                {isEditingAirline ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder="e.g. Delta, Vueling"
                      value={editedAirline}
                      onChange={e => setEditedAirline(e.target.value)}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && saveField({ airline: editedAirline.trim() }, () => setIsEditingAirline(false))}
                      className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => saveField({ airline: editedAirline.trim() }, () => setIsEditingAirline(false))}
                        disabled={isSavingField}
                        className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                      >
                        {isSavingField ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setIsEditingAirline(false); setEditedAirline(booking.airline || ''); }}
                        className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-[15px] font-extrabold text-gray-900 leading-snug break-words pr-2 flex-1">
                      {booking.airline || "—"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <ModalEditBtn onClick={() => setIsEditingAirline(true)} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* FLIGHT */}
            <div className="flex flex-col py-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">✈️ FLIGHT</span>
              <div className="flex items-center justify-between gap-1">
                {isEditingFlight ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder="e.g. DL0195"
                      value={editedFlight}
                      onChange={e => setEditedFlight(e.target.value)}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && saveField({ flight: editedFlight.trim(), flightNumber: editedFlight.trim() }, () => setIsEditingFlight(false))}
                      className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => saveField({ flight: editedFlight.trim(), flightNumber: editedFlight.trim() }, () => setIsEditingFlight(false))}
                        disabled={isSavingField}
                        className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                      >
                        {isSavingField ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setIsEditingFlight(false); setEditedFlight(booking.flight || booking.flightNumber || ''); }}
                        className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-[15px] font-extrabold text-gray-900 leading-snug break-words pr-2 flex-1">
                      {booking.flight || booking.flightNumber || "—"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <ModalEditBtn onClick={() => setIsEditingFlight(true)} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

            {/* Special Requirements */}
            {(booking.childSeatRequired || booking.wheelchairAccessRequired || booking.petsAllowed) && (
              <div className="flex flex-col py-0.5 pt-2 border-t border-gray-100">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">SPECIAL REQUIREMENTS</span>
                <div className="flex flex-wrap gap-1">
                  {booking.childSeatRequired && <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-bold border border-blue-200">Child Seat{booking.childSeatQty ? ` ×${booking.childSeatQty}` : ''}</span>}
                  {booking.wheelchairAccessRequired && <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-1 rounded-md font-bold border border-purple-200">Wheelchair Access</span>}
                  {booking.petsAllowed && <span className="text-[11px] bg-green-50 text-green-700 px-2 py-1 rounded-md font-bold border border-green-200">Pets Allowed</span>}
                </div>
              </div>
            )}

            {/* CRUISE SHIP */}
            {(booking.bookingType === 'cruise_arrival' || booking.bookingType === 'cruise_departure' || booking.cruiseShip || isEditingCruiseShip) && (
              <div className="flex flex-col py-1 pt-2 border-t border-gray-100">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">CRUISE SHIP</span>
                <div className="flex items-center justify-between gap-1">
                  {isEditingCruiseShip ? (
                    <div className="flex-1 flex flex-col gap-1">
                      <input
                        type="text"
                        placeholder="e.g. Celebrity XCel"
                        value={editedCruiseShip}
                        onChange={e => setEditedCruiseShip(e.target.value)}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && saveField({ cruiseShip: editedCruiseShip.trim() }, () => setIsEditingCruiseShip(false))}
                        className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => saveField({ cruiseShip: editedCruiseShip.trim() }, () => setIsEditingCruiseShip(false))}
                          disabled={isSavingField}
                          className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setIsEditingCruiseShip(false); setEditedCruiseShip(booking.cruiseShip || ''); }}
                          className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="text-[15px] font-extrabold text-gray-900 leading-snug break-words pr-2 flex-1">
                        {booking.cruiseShip || "—"}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <ModalEditBtn onClick={() => setIsEditingCruiseShip(true)} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {booking.disembarkTime && <Row label="DISEMBARK TIME" value={booking.disembarkTime} />}
            {booking.flightArrivalTime && <Row label="ARRIVAL TIME" value={booking.flightArrivalTime} />}
            {booking.flightDepartureTime && <Row label="DEPARTURE TIME" value={booking.flightDepartureTime} />}
        </div>

        {/* DROPOFF INFORMATION */}
        <div className="mx-4 bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 mb-3">
          <div className="text-[11px] font-black bg-gradient-to-r from-[#8B4513] to-[#A0522D] text-white uppercase tracking-wider mb-3 px-3.5 py-1.5 w-full rounded-lg shadow-sm">🏁 DROPOFF INFORMATION</div>

          {/* Editable Dropoff */}
          <div className="flex flex-col py-0.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">🏁 DROP OFF ADDRESS</span>
            <div className="flex items-center justify-between mb-1 gap-1">
              {isEditingDropoff ? (
                <div className="flex-1 flex flex-col gap-1">
                  <input type="text" value={editedDropoff} onChange={e => setEditedDropoff(e.target.value)} autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveField({ dropoff: editedDropoff }, () => setIsEditingDropoff(false))}
                    className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1 outline-none focus:border-[#8B4513] bg-white" />
                  <div className="flex gap-1">
                    <button onClick={() => saveField({ dropoff: editedDropoff }, () => setIsEditingDropoff(false))} disabled={isSavingField}
                      className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-50">
                      {isSavingField ? '...' : 'Save'}
                    </button>
                    <button onClick={() => { setIsEditingDropoff(false); setEditedDropoff(booking.dropoff || ''); }}
                      className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-[13px] font-extrabold text-gray-900 leading-snug break-words pr-2 flex-1">{booking.dropoff || '—'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <ModalEditBtn onClick={() => setIsEditingDropoff(true)} />
                    {booking.dropoff && (
                      <a href={mapsLink(booking.dropoff)} target="_blank" rel="noopener noreferrer" className="text-[#6B7280] hover:text-[#8B4513] shrink-0" title="Open in Maps">
                        <MapPin size={12} strokeWidth={2.5} />
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* CUSTOMER INFORMATION */}
        <div className="mx-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-3">
          <div className="text-[12px] font-black bg-gradient-to-r from-[#8B4513] to-[#A0522D] text-white uppercase tracking-wider mb-4 px-4 py-2.5 w-full rounded-lg shadow-sm">📞 CUSTOMER INFORMATION</div>

          <div className="flex flex-col py-0.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">📞 CUSTOMER NAME</span>
            <div className="flex items-center justify-between mb-1 gap-2">
              {isEditingName ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="flex-1 text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1 outline-none focus:border-[#8B4513] bg-white"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                />
              ) : (
                <button
                  onClick={() => {
                    setFontSizeScale(1.0);
                    setShowNameSign(true);
                  }}
                  className="text-[16px] font-black text-[#8B4513] text-left uppercase tracking-wide flex-1 break-words py-1 active:opacity-70"
                >
                  {normalizeCustomerName(booking.customerName || "—")}
                </button>
              )}

              <div className="flex items-center shrink-0">
                {isEditingName ? (
                  <button
                    onClick={saveName}
                    disabled={isSavingName}
                    className="text-xs font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50 ml-1"
                  >
                    {isSavingName ? "..." : "Save"}
                  </button>
                ) : (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }} className="text-[#6B7280] hover:text-[#8B4513] ml-1 p-1" title="Edit">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); copyToClipboard(normalizeCustomerName(booking.customerName || ""), "name"); }} className="text-[#6B7280] hover:text-[#8B4513] ml-1 p-1" title="Copy">
                      {copied === "name" ? <CheckCircle2 size={12} className="text-green-500" /> : <ClipboardList size={12} />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col py-0.5">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">📞 PHONE</span>
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-extrabold text-gray-900 truncate">{booking.phone || "—"}</span>
              {booking.phone && (
                <div className="flex items-center gap-2">
                  <a href={`tel:${booking.phone}`} className="text-[#6B7280] hover:text-green-600 transition-colors" title="Call">
                    <Phone size={12} strokeWidth={2.5} />
                  </a>
                  <a href={whatsappLink(booking.phone)} target="_blank" rel="noopener noreferrer" className="text-[#6B7280] hover:text-green-500 transition-colors" title="WhatsApp">
                    <MessageCircle size={12} strokeWidth={2.5} />
                  </a>
                  <button onClick={(e) => { e.stopPropagation(); copyToClipboard(booking.phone!, "phone"); }} className="text-[#6B7280] hover:text-[#8B4513] transition-colors" title="Copy">
                    {copied === "phone" ? <CheckCircle2 size={12} className="text-green-500" /> : <ClipboardList size={12} />}
                  </button>
                </div>
              )}
            </div>
          </div>

          <Row label="BOOKING REF" value={booking.bookingId} copyKey="ref" />

          {booking.customerNotes && (
            <div className="flex flex-col py-0.5 mt-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">CUSTOMER NOTES & REQS</span>
              <div className="bg-amber-50 text-amber-900 text-[14px] font-extrabold p-3 rounded-lg whitespace-pre-wrap leading-relaxed border border-amber-200 shadow-sm">
                {booking.customerNotes}
              </div>
            </div>
          )}
          {booking.internalNotes && (
            <div className="flex flex-col py-0.5 mt-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                <AlertTriangle size={11} className="text-red-500" />
                INTERNAL ADMIN NOTES
              </span>
              <div className="bg-red-50 text-red-900 text-[13px] font-bold p-3 rounded-lg whitespace-pre-wrap leading-relaxed border border-red-200 shadow-sm shadow-red-100 relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 rounded-t-lg"></div>
                {booking.internalNotes}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pull Back Cancelled Booking to Active */}
      {isCancelled && (
        <div className="px-4 pt-2 pb-2 mt-2">
          <button
            onClick={async () => {
              if (confirm(`Pull booking ${booking.bookingId} back to Active Bookings?`)) {
                setIsDeleting(true);
                try {
                  await updateDoc(doc(db, "bookings", booking.id), { status: "confirmed" });
                  booking.status = "confirmed";
                  if (updateStatus) await updateStatus(booking.id, "confirmed");
                  onClose();
                } catch (err) {
                  console.error("Failed to restore booking", err);
                  alert("Failed to restore booking");
                } finally {
                  setIsDeleting(false);
                }
              }
            }}
            disabled={isDeleting}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[14px] font-black transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={18} strokeWidth={2.5} />
            Pull Back to Active Bookings
          </button>
        </div>
      )}

      {/* Delete Booking Section */}
      {booking.status !== "DELETED" && (
        <div className="px-4 pt-2 pb-6 mt-2">
          {!isDeleteConfirmOpen ? (
            <button
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-white border border-red-200 text-red-600 rounded-xl text-[13px] font-bold hover:bg-red-50 hover:border-red-300 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
              Delete Booking
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm relative">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1"
                title="Cancel"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
              <div className="flex flex-col items-center text-center gap-2 mb-4">
                <div className="bg-red-100 p-2 rounded-full mb-1">
                  <AlertTriangle size={20} className="text-red-600" strokeWidth={2.5} />
                </div>
                <h3 className="text-red-900 font-black text-[15px]">Are you sure you want to delete this booking?</h3>
                <p className="text-red-700 font-medium text-[12px] px-2">
                  This will remove booking <strong>{booking.bookingId}</strong> for <strong>{normalizeCustomerName(booking.customerName)}</strong> from all active lists.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSoftDelete}
                  disabled={isDeleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg text-[13px] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isDeleting ? "Deleting..." : "Yes, Delete Booking"}
                </button>
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  disabled={isDeleting}
                  className="flex-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-bold py-2.5 rounded-lg text-[13px] transition-colors shadow-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Restore/Permanent Delete Section (for DELETED bookings) */}
      {booking.status === "DELETED" && (
        <div className="px-3 pt-2 pb-4 mt-2">
          {!isDeleteConfirmOpen ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleRestore}
                disabled={isDeleting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-50 text-green-700 border border-green-200 rounded-lg text-[13px] font-bold hover:bg-green-100 transition-colors shadow-sm disabled:opacity-50"
              >
                <RefreshCw size={16} strokeWidth={2.5} />
                Restore Booking
              </button>
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white border border-red-200 text-red-600 rounded-lg text-[13px] font-bold hover:bg-red-50 hover:border-red-300 transition-colors shadow-sm mt-2"
              >
                <Trash2 size={16} strokeWidth={2.5} />
                Delete Permanently
              </button>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm relative mt-2">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1"
                title="Cancel"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
              <div className="flex flex-col items-center text-center gap-2 mb-4">
                <div className="bg-red-100 p-2 rounded-full mb-1">
                  <AlertTriangle size={20} className="text-red-600" strokeWidth={2.5} />
                </div>
                <h3 className="text-red-900 font-black text-[15px]">Permanently delete this booking?</h3>
                <p className="text-red-700 font-medium text-[12px] px-2">
                  This will PERMANENTLY REMOVE booking <strong>{booking.bookingId}</strong> from the database. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePermanentDelete}
                  disabled={isDeleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg text-[13px] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {isDeleting ? "Deleting..." : "Delete Permanently"}
                </button>
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  disabled={isDeleting}
                  className="flex-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-bold py-2.5 rounded-lg text-[13px] transition-colors shadow-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Horizontal Name Sign Overlay */}
      {showNameSign && (
        <div
          className="fixed inset-0 z-[9999] w-full h-full bg-black flex items-center justify-center cursor-pointer overflow-hidden"
          onClick={() => {
            if (!isEditingFullScreen) setShowNameSign(false);
          }}
        >
          {/* Zoom controls at bottom */}
          {!isEditingFullScreen && (
            <div
              className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 z-[10000]"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setFontSizeScale(prev => Math.max(0.4, prev - 0.15))}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 text-white rounded-full flex items-center justify-center font-bold text-2xl transition-all shadow-md cursor-pointer select-none"
                title="Zoom Out"
              >
                −
              </button>
              <button
                onClick={() => setFontSizeScale(1.0)}
                className="text-white/60 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors px-2 py-1 cursor-pointer select-none"
                title="Reset"
              >
                Reset
              </button>
              <button
                onClick={() => setFontSizeScale(prev => Math.min(3.0, prev + 0.15))}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 text-white rounded-full flex items-center justify-center font-bold text-2xl transition-all shadow-md cursor-pointer select-none"
                title="Zoom In"
              >
                +
              </button>
            </div>
          )}

          <div className="absolute top-4 right-4 z-[10000]">
            {isEditingFullScreen ? (
              <button
                onClick={saveFullScreenName}
                disabled={isSavingFullScreen}
                className="text-gray-400 font-bold uppercase tracking-widest text-sm hover:text-white px-4 py-2"
              >
                {isSavingFullScreen ? "Saving..." : "Save"}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFullScreenName(normalizeCustomerName(booking.customerName || ""));
                  setIsEditingFullScreen(true);
                }}
                className="text-gray-700 opacity-50 hover:opacity-100 p-2"
                title="Edit Name"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              </button>
            )}
          </div>

          <div
            style={{ transform: `scale(${fontSizeScale})`, transition: 'transform 0.15s ease-out' }}
            className="flex items-center justify-center"
          >
            {isEditingFullScreen ? (
              <textarea
                autoFocus
                value={fullScreenName}
                onChange={(e) => setFullScreenName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent text-white font-black tracking-tighter text-center leading-none outline-none resize-none text-[20vw] rotate-90 md:rotate-0 w-[95vh] h-[95vw] md:w-[95vw] md:h-[95vh] overflow-hidden"
                style={{ display: 'flex', alignItems: 'center' }}
              />
            ) : (
              <div className="text-white font-black tracking-tighter text-center leading-none text-[20vw] rotate-90 md:rotate-0 max-w-[95vh] max-h-[95vw] md:max-w-[95vw] md:max-h-[95vh]">
                {normalizeCustomerName(booking.customerName)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   2. NEW RESERVATION
═══════════════════════════════════════════════ */
function NewReservationSection({ db, onCreated }: { db: any; onCreated: () => void }) {
  const empty = { customerName: "", bookingRef: "", email: "", phone: "", pickup: "", dropoff: "", airline: "", flight: "", date: "", time: "", passengers: "1", luggage: "1", vehicle: "economy", price: "", customerNotes: "", internalNotes: "", source: "admin" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const customRef = form.bookingRef ? form.bookingRef.trim() : "";
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const bookingId = customRef || `ER-${randomDigits}`;
      const now = new Date();
      const finalFlight = form.flight ? form.flight.trim() : "";

      const bookingData: any = {
        bookingId,
        bookingRef: bookingId,
        source: form.source || "admin",
        customerName: form.customerName ? form.customerName.trim() : "Guest",
        email: form.email ? form.email.trim() : "",
        phone: form.phone ? form.phone.trim() : "",
        flightNumber: finalFlight,
        flight: finalFlight,
        airline: form.airline ? form.airline.trim() : "",
        pickup: form.pickup ? form.pickup.trim() : "",
        dropoff: form.dropoff ? form.dropoff.trim() : "",
        date: form.date || "",
        time: form.time || "",
        vehicle: form.vehicle || "economy",
        price: Number(form.price) || 0,
        passengers: Number(form.passengers) || 1,
        luggage: Number(form.luggage) || 0,
        paymentStatus: "PAID",
        status: "confirmed",
        customerNotes: form.customerNotes || "",
        internalNotes: form.internalNotes || "",
        createdAt: now,
      };

      // 1. Direct Firestore write (instant, reliable, no server ADC dependency)
      await setDoc(doc(db, "bookings", bookingId), bookingData);

      // 2. Activity log
      try {
        await setDoc(doc(db, "activityLogs", `${bookingId}_created_${Date.now()}`), {
          timestamp: now,
          adminUser: "Admin",
          action: "Booking Created (Admin Manual)",
          bookingId,
        });
      } catch (logErr) {
        console.warn("Could not save activity log:", logErr);
      }

      // 3. Optional async email dispatch
      if (bookingData.email && bookingData.email.includes("@")) {
        fetch("/api/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, bookingData }),
        }).catch(err => console.warn("Async email dispatch skipped/failed:", err));
      }

      setSuccess(`Booking ${bookingId} created successfully!`);
      setForm(empty);
      setTimeout(() => { setSuccess(""); onCreated(); }, 2000);
    } catch (err: any) {
      alert("Error creating reservation: " + err.message);
    }
    setSaving(false);
  };

  const fieldClass = "w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-lg text-[15px] font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all";
  const labelClass = "block text-[12px] font-bold text-[#6B7280] uppercase tracking-wide mb-2";

  const field = (label: string, key: string, type = "text", req = true) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input type={type} className={fieldClass} value={(form as any)[key]} onChange={set(key)} required={req} />
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mb-1">New Reservation</h1>
      <p className="text-[#6B7280] text-[15px] font-medium mb-6">Create a manual booking on behalf of a customer.</p>

      {success && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-xl px-4 py-3.5 mb-6 font-bold shadow-sm">
          <CheckCircle2 size={20} strokeWidth={2.5} /> {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5 md:p-6 shadow-sm">
          <h2 className="font-black text-gray-900 mb-5 flex items-center gap-2 text-lg"><Users size={20} className="text-[#8B4513]" /> Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {field("📞 Full Name", "customerName")}
            {field("Reference Number", "bookingRef", "text", false)}
            {field("📞 Phone", "phone", "tel", false)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 md:p-6 shadow-sm">
          <h2 className="font-black text-gray-900 mb-5 flex items-center gap-2 text-lg"><MapPin size={20} className="text-[#8B4513]" /> Route</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {field("📍 Pickup Location", "pickup")}
            {field("🏁 Drop-off Location", "dropoff")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            {field("✈️ Airline", "airline", "text", false)}
            {field("✈️ Flight Number", "flight", "text", false)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 md:p-6 shadow-sm">
          <h2 className="font-black text-gray-900 mb-5 flex items-center gap-2 text-lg"><Calendar size={20} className="text-[#8B4513]" /> Journey Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {field("📅 Date", "date", "date")}
            {field("🕐 Time", "time", "time")}
            <div>
              <label className={labelClass}>👥 Passengers</label>
              <input type="number" min="1" max="16" className={fieldClass} value={form.passengers} onChange={set("passengers")} required />
            </div>
            <div>
              <label className={labelClass}>🧳 Luggage</label>
              <input type="number" min="0" max="16" className={fieldClass} value={form.luggage} onChange={set("luggage")} required />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <div>
              <label className={labelClass}>💶 Price (€)</label>
              <input type="number" min="0" step="0.01" className={fieldClass} placeholder="0.00" value={form.price} onChange={set("price")} required />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 md:p-6 shadow-sm">
          <h2 className="font-black text-gray-900 mb-5 text-lg">Notes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Customer Notes (visible to customer)</label>
              <textarea className={`${fieldClass} h-28 resize-none`} value={form.customerNotes} onChange={set("customerNotes")} />
            </div>
            <div>
              <label className={labelClass}>Internal Notes (admin only)</label>
              <textarea className={`${fieldClass} h-28 resize-none`} value={form.internalNotes} onChange={set("internalNotes")} />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="w-full md:w-auto py-3.5 px-8 bg-[#8B4513] text-white rounded-lg font-bold text-[16px] flex items-center justify-center gap-2 hover:bg-[#8B4513]/90 transition-colors shadow-sm disabled:opacity-60">
          <PlusCircle size={20} strokeWidth={2.5} /> {saving ? "Creating…" : "Create Reservation"}
        </button>
      </form>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   3. ACCOUNTS
═══════════════════════════════════════════════ */
function AccountsSection({ bookings }: { bookings: Booking[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

  if (!bookings || bookings.length === 0) {
    return <EmptyState title="No Customer Accounts" message="There are no customer accounts or bookings matching your selection." />;
  }

  const activeBookings = bookings.filter(b => b.status !== "cancelled");

  const uniqueBookings = Array.from(new Map(activeBookings.map(b => [b.bookingId, b])).values()) as Booking[];
  const customers: Customer[] = Object.values(
    uniqueBookings.reduce((acc: any, b: Booking) => {
      const emailValid = b.email && b.email !== "N/A" && b.email.trim() !== "";
      const phoneValid = b.phone && b.phone !== "N/A" && b.phone.trim() !== "";
      const key = (emailValid ? b.email : (phoneValid ? b.phone : b.customerName)) || "unknown";
      if (!acc[key]) {
        acc[key] = {
          email: b.email, name: b.customerName, phone: b.phone ?? "",
          bookings: [], totalSpent: 0, lastBookingDate: "",
        };
      }
      acc[key].bookings.push(b);
      acc[key].totalSpent += (parseFloat(String(b.price)) || 0);
      if (!acc[key].lastBookingDate || b.date > acc[key].lastBookingDate) acc[key].lastBookingDate = b.date;
      return acc;
    }, {})
  );

  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const repeatCustomers = customers.filter(c => c.bookings.length > 1).length;

  const filtered = customers.filter(c => {
    const s = search.toLowerCase();
    return !s || c.name?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s);
  });

  if (selected) {
    return (
      <div className="p-4 md:p-8 max-w-4xl">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-[#8B4513] font-bold text-[15px] mb-6 hover:underline">
          ← Back to Accounts
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{selected.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-[14px] font-bold text-[#6B7280]">
                <span className="flex items-center gap-1.5"><Mail size={20} />{selected.email}</span>
                {selected.phone && <span className="flex items-center gap-1.5"><Phone size={20} />{selected.phone}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-black text-[#8B4513]">€{selected.totalSpent.toFixed(2)}</div>
              <div className="text-[13px] font-bold text-[#6B7280] uppercase tracking-wide mt-0.5">Total spent</div>
            </div>
          </div>
        </div>
        <h2 className="font-black text-gray-900 text-lg mb-4">Booking History ({selected.bookings.length})</h2>
        <div className="space-y-3">
          {selected.bookings.map(b => {
            const conf = getStatusConfig(b.status);
            return (
              <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-black text-gray-900 text-[15px]">{b.bookingId}</div>
                  {(b.passengers || 0) > 0 && (
                    <div className="text-sm text-gray-500 flex items-center gap-1 mt-1 mb-1">
                      <Users size={14} /> {b.passengers}
                    </div>
                  )}
                  <div className="text-[14px] font-bold text-gray-600 truncate mt-0.5">{b.pickup} → {b.dropoff}</div>
                  <div className="text-[13px] font-medium text-gray-400 mt-1">{formatDate(b.date)} at {b.time}</div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end">
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wide ${conf.bg} ${conf.text}`}>{b.status}</span>
                  <div className="text-[16px] font-black text-gray-900 mt-2">€{(parseFloat(String(b.price)) || 0).toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mb-6">Accounts</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        {[
          { label: "Total Customers", value: customers.length, icon: <Users size={22} className="text-[#8B4513]" /> },
          { label: "Repeat Customers", value: repeatCustomers, icon: <RefreshCw size={22} className="text-purple-600" /> },
          { label: "Total Revenue", value: `€${totalRevenue.toFixed(2)}`, icon: <DollarSign size={22} className="text-green-600" /> },
          { label: "Avg. per Customer", value: `€${customers.length ? (totalRevenue / customers.length).toFixed(2) : "0.00"}`, icon: <TrendingUp size={22} className="text-orange-500" /> },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2">
            <div className="flex items-center justify-between mb-3">{s.icon}<span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide text-right leading-tight">{s.label}</span></div>
            <div className="text-2xl font-black text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="relative mb-6 w-full">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={2.5} />
        <input type="text" placeholder="Search by name or email…" className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[16px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all shadow-sm" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="block md:hidden space-y-3">
        {filtered.length === 0 && <div className="text-center py-10 text-gray-400 font-bold">No customers yet.</div>}
        {filtered.map(c => (
          <div key={c.email} className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black text-gray-900 text-[16px]">{c.name}</div>
              <div className="text-[13px] font-medium text-[#6B7280] truncate mt-0.5">{c.email}</div>
              {c.phone && <div className="text-[13px] font-medium text-gray-400">{c.phone}</div>}
              <div className="mt-2 flex items-center gap-2">
                <span className="bg-[#F8F9FA] border border-gray-200 text-gray-700 text-[11px] font-bold px-2 py-0.5 rounded-md uppercase">{c.bookings.length} bookings</span>
                <span className="text-[13px] font-black text-[#8B4513]">€{c.totalSpent.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={() => setSelected(c)} className="text-[#8B4513] shrink-0 p-2 bg-[#8B4513]/10 rounded-full">
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto w-full">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-[#F8F9FA] border-b border-gray-100">
            <tr className="text-[12px] uppercase text-[#6B7280] font-bold tracking-wider">
              <th className="px-5 py-4 text-left">Customer</th>
              <th className="px-5 py-4 text-left">Contact</th>
              <th className="px-5 py-4 text-left">Bookings</th>
              <th className="px-5 py-4 text-left">Total Spent</th>
              <th className="px-5 py-4 text-left">Last Booking</th>
              <th className="px-5 py-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400 font-bold">No customers yet.</td></tr>}
            {filtered.map(c => (
              <tr key={c.email} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4 font-black text-gray-900 text-[15px]">{c.name}</td>
                <td className="px-5 py-4">
                  <div className="text-gray-900 font-medium text-[14px]">{c.email}</div>
                  {c.phone && <div className="text-gray-500 font-medium text-[13px] mt-0.5">{c.phone}</div>}
                </td>
                <td className="px-5 py-4">
                  <span className="bg-[#F8F9FA] border border-gray-200 text-gray-800 text-[12px] font-bold px-2.5 py-1 rounded-md">{c.bookings.length}</span>
                </td>
                <td className="px-5 py-4 font-black text-gray-900 text-[15px]">€{c.totalSpent.toFixed(2)}</td>
                <td className="px-5 py-4 text-gray-500 font-medium text-[14px]">{formatDate(c.lastBookingDate)}</td>
                <td className="px-5 py-4">
                  <button onClick={() => setSelected(c)} className="text-[#8B4513] font-bold text-[14px] hover:underline flex items-center gap-1.5">
                    View Details <ArrowRight size={14} strokeWidth={2.5} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   4. ACCOUNT RANGE
═══════════════════════════════════════════════ */
function AccountRangeSection({ bookings }: { bookings: Booking[] }) {
  const today = new Date().toISOString().split("T")[0];
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);

  if (!bookings) {
    return <EmptyState title="No Financial Data" message="No booking range records could be retrieved." />;
  }

  const inRangeRaw = bookings.filter(b => b.date >= from && b.date <= to && b.status !== "cancelled");
  const inRange = Array.from(new Map(inRangeRaw.map(b => [b.bookingId, b])).values()) as Booking[];
  const totalRevenue = inRange.reduce((s, b) => s + (parseFloat(String(b.price)) || 0), 0);

  const fieldClass = "w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-[15px] font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all shadow-sm";

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mb-1">Account Range</h1>
      <p className="text-[#6B7280] text-[15px] font-medium mb-6">Financial summary for a selected date range.</p>

      <div className="flex flex-wrap items-end gap-4 mb-6 md:mb-8 bg-[#F8F9FA] rounded-xl border border-gray-100 p-5 shadow-sm">
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[11px] font-bold text-[#6B7280] uppercase tracking-wide mb-2">From</label>
          <input type="date" className={fieldClass} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[11px] font-bold text-[#6B7280] uppercase tracking-wide mb-2">To</label>
          <input type="date" className={fieldClass} value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 md:mb-8">
        {[
          { label: "Bookings", value: inRange.length, sub: "in range", color: "text-[#8B4513]" },
          { label: "Revenue", value: `€${totalRevenue.toFixed(2)}`, sub: "excl. cancelled", color: "text-green-600" },
          { label: "Avg. Price", value: `€${inRange.length ? (totalRevenue / inRange.length).toFixed(2) : "0.00"}`, sub: "per booking", color: "text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">{s.label}</div>
            <div className={`text-3xl md:text-4xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[13px] font-medium text-gray-400 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>



      {inRange.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto w-full">
          <div className="px-5 py-4 border-b border-gray-100 font-black text-gray-900 text-lg">Bookings in Range</div>
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-[#F8F9FA] text-[12px] uppercase text-[#6B7280] font-bold tracking-wider">
              <tr><th className="px-5 py-4 text-left">ID</th><th className="px-5 py-4 text-left">Customer</th><th className="px-5 py-4 text-left">Date</th><th className="px-5 py-4 text-left">Price</th><th className="px-5 py-4 text-left">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inRange.map(b => {
                const conf = getStatusConfig(b.status);
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-bold text-gray-900 text-[14px]">
                      <div>{b.bookingId}</div>
                      {(b.passengers || 0) > 0 && (
                        <div className="text-sm text-gray-500 flex items-center gap-1 mt-1 font-medium">
                          <Users size={14} /> {b.passengers}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-700">{normalizeCustomerName(b.customerName)}</td>
                    <td className="px-5 py-4 font-medium text-gray-500">{formatDate(b.date)}</td>
                    <td className="px-5 py-4 font-black text-gray-900 text-[15px]">€{b.price}</td>
                    <td className="px-5 py-4"><span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wide ${conf.bg} ${conf.text}`}>{b.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   5. GENERATE INVOICE
═══════════════════════════════════════════════ */
function GenerateInvoiceSection({ bookings, db }: { bookings: Booking[]; db: any }) {
  const [selectedId, setSelectedId] = useState("");
  const [vatPct, setVatPct] = useState(0);
  const [invoiceNum, setInvoiceNum] = useState("");
  const [generating, setGenerating] = useState(false);
  const [invoiceLang, setInvoiceLang] = useState<"en" | "es" | "ca">("en");

  const invT = {
    en: { invoice: "INVOICE", date: "Date:", billTo: "Bill To", bookingRef: "Booking Reference", desc: "Description", amount: "Amount", transfer: "Private Transfer", total: "Total", thanks: "Thank you for choosing Viator Booking Dispatch", pickup: "Pickup Location", dropoff: "Drop-off Location", at: "at", notSpecified: "Not Specified" },
    es: { invoice: "FACTURA", date: "Fecha:", billTo: "Facturar a", bookingRef: "Referencia de Reserva", desc: "Descripción", amount: "Importe", transfer: "Traslado Privado", total: "Total", thanks: "Gracias por elegir Viator Booking Dispatch", pickup: "Punto de Recogida", dropoff: "Destino", at: "a las", notSpecified: "No Especificado" },
    ca: { invoice: "FACTURA", date: "Data:", billTo: "Facturar a", bookingRef: "Referència de Reserva", desc: "Descripció", amount: "Import", transfer: "Trasllat Privat", total: "Total", thanks: "Gràcies per triar Viator Booking Dispatch", pickup: "Punt de Recollida", dropoff: "Destinació", at: "a les", notSpecified: "No Especificat" }
  };

  const cleanAddress = (address: any) => {
    if (!address) return "";
    const parts = String(address).split(',');
    if (parts.length > 2) {
      if (parts[0].length < 15 && parts[1]) {
        return `${parts[0].trim()}, ${parts[1].trim()}`;
      }
      return parts[0].trim();
    }
    return address;
  };

  const getAddress = (addr: any) => {
    const cleaned = cleanAddress(addr);
    if (!cleaned || cleaned === "Not Specified") return invT[invoiceLang].notSpecified;
    return cleaned;
  };

  const formatInvoiceDate = (d: string) => {
    if (!d) return "—";
    try {
      let dateObj;
      const parts = d.split('-');
      if (parts.length === 3) {
        dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      } else {
        dateObj = new Date(/\d{4}/.test(d) ? d : `${d} 2024`);
      }
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString(
          invoiceLang === 'ca' ? 'ca-ES' : invoiceLang === 'es' ? 'es-ES' : 'en-GB',
          { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }
        );
      }
    } catch { }
    return d;
  };

  if (!bookings || bookings.length === 0) {
    return <EmptyState title="No Bookings for Invoices" message="There are no bookings available to select from for invoice generation." />;
  }

  const booking = bookings.find(b => b.id === selectedId);
  const parsePrice = (priceStr: any) => {
    if (!priceStr) return 0;
    const cleaned = String(priceStr).replace(/[^\d.,]/g, '');
    let finalStr = cleaned;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      finalStr = cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
      finalStr = cleaned.replace(/,/g, '.');
    }
    return parseFloat(finalStr) || 0;
  };
  const base = parsePrice(booking?.price);
  const vatAmt = (base * vatPct) / 100;
  const total = base + vatAmt;
  const today = new Date().toLocaleDateString(
    invoiceLang === 'ca' ? 'ca-ES' : invoiceLang === 'es' ? 'es-ES' : 'en-GB'
  );

  const handleGenerate = async () => {
    if (!booking) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.bookingId,
          amount: total,
          email: booking.email,
          customerName: booking.customerName,
          status: "UNPAID",
          vatPct,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server returned ${res.status}: ${errText.slice(0, 150)}`);
      }
      const data = await res.json();
      setInvoiceNum(data.invoiceId);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setGenerating(false);
  };

  const handlePrint = async () => {
    const element = document.getElementById("invoice-preview");
    if (!element) {
      window.print();
      return;
    }
    try {
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      const opt: any = {
        margin: 0,
        filename: `Invoice_${invoiceNum}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF generation error:", err);
      window.print(); // fallback
    }
  };
  const fieldClass = "w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-lg text-[15px] font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all";

  return (
    <div className="p-4 md:p-8 max-w-3xl print:max-w-none print:w-full print:p-0 print:m-0">
      <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mb-1 print:hidden">Generate Invoice</h1>
      <p className="text-[#6B7280] text-[15px] font-medium mb-6 print:hidden">Select a booking to generate a printable invoice.</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:p-6 mb-6 print:hidden">
        <div className="grid grid-cols-1 gap-5 items-end">
          <div>
            <label className="block text-[11px] font-bold text-[#6B7280] uppercase tracking-wide mb-2">Select Booking</label>
            <select className={fieldClass} value={selectedId} onChange={e => { setSelectedId(e.target.value); setInvoiceNum(""); }}>
              <option value="">— Choose a booking —</option>
              {bookings.map(b => <option key={b.id} value={b.id}>{b.bookingId} — {normalizeCustomerName(b.customerName)} ({formatDate(b.date)})</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-5">
          <button onClick={handleGenerate} disabled={!booking || generating} className="py-3 px-6 bg-[#8B4513] text-white rounded-lg font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-[#8B4513]/90 transition-colors shadow-sm disabled:opacity-50">
            <FileText size={20} strokeWidth={2.5} /> {generating ? "Saving…" : invoiceNum ? "Re-generate" : "Generate Invoice"}
          </button>
          {invoiceNum && (
            <>
              <button onClick={handlePrint} className="py-3 px-6 bg-white border border-gray-200 text-gray-700 rounded-lg font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm">
                <Printer size={20} strokeWidth={2.5} /> Download PDF
              </button>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button onClick={() => setInvoiceLang("en")} className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${invoiceLang === "en" ? "bg-white shadow-sm text-[#8B4513]" : "text-gray-500 hover:text-gray-700"}`}>EN</button>
                <button onClick={() => setInvoiceLang("es")} className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${invoiceLang === "es" ? "bg-white shadow-sm text-[#8B4513]" : "text-gray-500 hover:text-gray-700"}`}>ES</button>
                <button onClick={() => setInvoiceLang("ca")} className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${invoiceLang === "ca" ? "bg-white shadow-sm text-[#8B4513]" : "text-gray-500 hover:text-gray-700"}`}>CA</button>
              </div>
              {booking?.phone && (
                <a href={`https://wa.me/${booking.phone.replace(/[^0-9+]/g, '')}?text=Hello ${normalizeCustomerName(booking.customerName)}, here is your invoice for booking ${booking.bookingId}: ${typeof window !== 'undefined' ? window.location.origin : ''}/invoice/${invoiceNum}`} target="_blank" rel="noopener noreferrer" className="py-3 px-6 bg-green-500 text-white rounded-lg font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-green-600 transition-colors shadow-sm">
                  Send via WhatsApp
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {booking && invoiceNum && (
        <div id="invoice-preview" className="bg-white rounded-xl border border-gray-200 p-8 md:p-12 print:shadow-none print:border-0 print:p-0">
          <div className="flex justify-between mb-10">
            <div>
              <img src="/ADMIN FAVICON AND APP LOGO.png?v=2" alt="Admin Logo" className="h-14 object-contain mix-blend-multiply border-none shadow-none bg-transparent -ml-2 mb-1" />
              <div className="font-bold text-gray-900 text-lg">Viator Bookings Dispatch</div>
              <div className="text-gray-500 font-medium text-[14px] mt-0.5">Email: alisoban1990@gmail.com</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-[#8B4513] tracking-tight">{invT[invoiceLang].invoice}</div>
              <div className="text-gray-900 font-bold text-lg mt-2">{invoiceNum}</div>
              <div className="text-gray-500 font-medium text-[14px] mt-0.5">{invT[invoiceLang].date} {today}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-10">
            <div>
              <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-widest mb-2">{invT[invoiceLang].billTo}</div>
              <div className="font-black text-gray-900 text-lg">{normalizeCustomerName(booking.customerName)}</div>
              <div className="text-gray-600 font-medium text-[15px] break-all mt-1">{booking.email}</div>
              {booking.phone && <div className="text-gray-600 font-medium text-[15px] mt-0.5">{booking.phone}</div>}
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-widest mb-2">{invT[invoiceLang].bookingRef}</div>
              <div className="font-black text-gray-900 text-lg">{booking.bookingId}</div>
              <div className="text-gray-600 font-medium text-[15px] mt-1">{formatInvoiceDate(booking.date)} {invT[invoiceLang].at} {booking.time}</div>
            </div>
          </div>

          <div className="overflow-x-auto w-full mb-8">
            <table className="w-full text-sm min-w-[300px]">
              <thead className="bg-[#F8F9FA] border-y border-gray-200">
                <tr className="text-[12px] uppercase text-[#6B7280] font-bold tracking-wider">
                  <th className="px-5 py-4 text-left">{invT[invoiceLang].desc}</th>
                  <th className="px-5 py-4 text-right">{invT[invoiceLang].amount}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-5 py-6">
                    <div className="font-black text-gray-900 text-[16px] mb-5">{invT[invoiceLang].transfer}</div>

                    <div className="flex flex-col gap-3 text-[14px] bg-[#F8F9FA] border border-gray-100 p-4 rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="bg-white p-1.5 rounded-full shadow-sm border border-gray-100 shrink-0 mt-0.5">
                          <MapPin size={14} className="text-[#8B4513]" strokeWidth={2.5} />
                        </div>
                        <div>
                          <span className="font-bold text-[#6B7280] block text-[10px] uppercase tracking-widest mb-0.5">{invT[invoiceLang].pickup}</span>
                          <span className="text-gray-800 font-medium leading-snug block">{getAddress(booking.pickup)}</span>
                        </div>
                      </div>

                      <div className="w-0.5 h-3 bg-gray-200 ml-[15px] my-[-6px]"></div>

                      <div className="flex items-start gap-3">
                        <div className="bg-white p-1.5 rounded-full shadow-sm border border-gray-100 shrink-0 mt-0.5">
                          <Navigation size={14} className="text-[#8B4513]" strokeWidth={2.5} />
                        </div>
                        <div>
                          <span className="font-bold text-[#6B7280] block text-[10px] uppercase tracking-widest mb-0.5">{invT[invoiceLang].dropoff}</span>
                          <span className="text-gray-800 font-medium leading-snug block">{getAddress(booking.dropoff)}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-6 text-right align-top">
                    <div className="font-black text-gray-900 text-[18px]">€{base.toFixed(2)}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-3">
              <div className="flex justify-between items-center font-black text-[#8B4513] bg-[#F0F5FF] border border-[#BFDBFE] px-5 py-4 rounded-xl text-xl shadow-sm">
                <span className="uppercase tracking-wide text-sm">{invT[invoiceLang].total}</span>
                <span className="text-2xl">€{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-16 text-center text-gray-400 font-medium text-[13px] border-t border-gray-100 pt-6">
            {invT[invoiceLang].thanks}
          </div>
        </div>
      )}
    </div>
  );
}
