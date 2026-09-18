"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, PlusCircle, Users, BarChart2, FileText,
  LogOut, Search, Printer, X, Phone, Mail, MapPin, Navigation,
  TrendingUp, DollarSign, CheckCircle2, RefreshCw, Eye, ClipboardList,
  CheckCheck, XCircle, Loader2, Copy, MessageCircle, ExternalLink, ArrowRight, Bell, Calendar, ArrowLeft, Globe, Car, AlertTriangle, Trash2,
  Camera, Upload, Image as ImageIcon
} from "lucide-react";

import { db, auth } from "@/lib/firebase";
import { signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut } from "firebase/auth";
import {
  collection, getDocs, doc, setDoc, updateDoc,
  query, orderBy, Timestamp, runTransaction, where, onSnapshot, deleteField, limit
} from "firebase/firestore";
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

/* ─── Types ─── */
type Section = "reservations" | "new" | "confirmed" | "completed" | "cancelled" | "accounts" | "range" | "invoice";
type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed" | "DELETED";
type Booking = {
  id: string; bookingId: string; customerName: string; email: string;
  phone?: string; pickup: string; dropoff: string; date: string; time: string;
  vehicle: string; status: BookingStatus; paymentStatus?: string; price: number; driver?: string; driverPrice?: string; driver2?: string; driver2Price?: string;
  passengers?: number; luggage?: number; customerNotes?: string;
  internalNotes?: string; source?: string; createdAt?: any;
  flight?: string; airline?: string; cruiseShip?: string;
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
};

const getStatusConfig = (status: string) => STATUS_CONFIG[normalizeStatus(status)] || { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };

const BOTTOM_NAV = [
  { id: "reservations", label: "Reservations", icon: Calendar },
] as const;

const SIDEBAR_NAV = [
  { id: "reservations", label: "Reservations", icon: LayoutDashboard },
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
function MobileBookingCard({ b, conf, setDetailBooking, zoomedBookingId, setZoomedBookingId, loggedInDriver }: any) {
  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 w-full transition-all flex flex-col gap-3.5 ${b.status?.toUpperCase() === 'CANCELLED'
        ? 'bg-red-50/80 hover:bg-red-100/80 border border-red-200 shadow-sm'
        : 'bg-white shadow-md border border-gray-100 hover:shadow-lg hover:border-gray-200'
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
                  className={`client-name-trigger cursor-zoom-in inline-block origin-left transition-all duration-300 ease-in-out font-black text-gray-900 text-[16px] tracking-tight
                    ${zoomedBookingId === b.id
                      ? "scale-[1.5] text-gray-900 font-bold bg-white border border-gray-200 shadow-xl px-2 py-0.5 rounded-lg z-50 relative cursor-zoom-out"
                      : ""
                    }`}
                >
                  {normalizeCustomerName(b.customerName)}
                </div>
              </div>
              <div className="text-[#6B7280] text-[12px] font-medium mt-0.5">{b.bookingId}</div>
              {(b.passengers || 0) > 0 && (
                <div className="text-[12px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 mt-1.5 shadow-sm border border-gray-200">
                  <Users size={14} /> {b.passengers}
                </div>
              )}
            </div>
            </div>
            
          </div>
          {/* Date & Time Row */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2 cursor-pointer bg-orange-50/70 border border-orange-100/50 px-3 py-1.5 rounded-lg" onClick={() => setDetailBooking(b)}>
            <Calendar size={15} className="text-[#8B4513] shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-black text-[#8B4513] tracking-tight">{formatDateTimeCombined(b.date, b.time, "en")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Route (Pickup -> Dropoff) ── */}
      <div className="border-t border-[#E5E7EB] pt-3">
        <div className="flex items-center gap-2 bg-gradient-to-r from-gray-50 to-white rounded-xl p-3 border border-gray-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] min-w-0" onClick={() => setDetailBooking(b)}>
          <MapPin size={15} className="text-[#8B4513] shrink-0" />
          <div className="text-[13px] font-black text-gray-900 truncate flex-1 min-w-0" title={cleanLocation(b.pickup)}>{cleanLocation(b.pickup)}</div>
          <div className="flex items-center justify-center shrink-0 mx-1 w-6 h-6 rounded-full bg-orange-50 border border-orange-100"><ArrowRight size={14} className="text-[#8B4513]" strokeWidth={3} /></div>
          <div className="text-[13px] font-black text-gray-900 truncate flex-1 min-w-0 text-right" title={cleanLocation(b.dropoff)}>{cleanLocation(b.dropoff)}</div>
        </div>
      </div>

      {/* ── Section 4: Driver Assignment ── */}
      <div className="border-t border-[#E5E7EB] pt-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Driver</span>
        </div>
        <div className="flex flex-col gap-1.5 w-full">
          {(() => {
            const driverName = loggedInDriver?.name?.trim().toLowerCase();
            const driverId = loggedInDriver?.driverId?.trim().toLowerCase();
            const isMeDriver1 = !!(
              (driverName && b.driver?.trim().toLowerCase() === driverName) ||
              (driverId && b.driver?.trim().toLowerCase() === driverId)
            );
            const isMeDriver2 = !!(
              (driverName && b.driver2?.trim().toLowerCase() === driverName) ||
              (driverId && b.driver2?.trim().toLowerCase() === driverId)
            );

            if (isMeDriver2) {
              return (
                <>
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200 h-8 flex-1 truncate">
                      <Users size={13} className="shrink-0 text-purple-600" />
                      <span className="truncate">You (2nd Driver): {b.driver2}</span>
                    </div>
                    {b.driver2Price && (
                      <div className="shrink-0 flex items-center justify-center bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200 text-purple-900 text-[12px] font-black h-8 shadow-sm">
                        <span>{"\u20AC"}{b.driver2Price}</span>
                      </div>
                    )}
                  </div>
                  {b.driver && (
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 text-gray-700 rounded-lg text-[11px] font-medium border border-gray-200 h-7 flex-1 truncate">
                        <Users size={12} className="shrink-0 text-gray-500" />
                        <span className="truncate">Co-driver: {b.driver}</span>
                      </div>
                    </div>
                  )}
                </>
              );
            }

            if (isMeDriver1) {
              return (
                <>
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-[#8B4513] rounded-lg text-[11px] font-bold border border-orange-100 h-8 flex-1 truncate">
                      <Users size={13} className="shrink-0" />
                      <span className="truncate">You: {b.driver}</span>
                    </div>
                    {b.driverPrice && (
                      <div className="shrink-0 flex items-center justify-center bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100 text-[#8B4513] text-[12px] font-black h-8 shadow-sm">
                        <span>{"\u20AC"}{b.driverPrice}</span>
                      </div>
                    )}
                  </div>
                  {b.driver2 && (
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 text-gray-700 rounded-lg text-[11px] font-medium border border-gray-200 h-7 flex-1 truncate">
                        <Users size={12} className="shrink-0 text-gray-500" />
                        <span className="truncate">Co-driver: {b.driver2}</span>
                      </div>
                    </div>
                  )}
                </>
              );
            }

            return (
              <>
                {b.driver ? (
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-[#8B4513] rounded-lg text-[11px] font-bold border border-orange-100 h-8 flex-1 truncate">
                      <Users size={13} className="shrink-0" />
                      <span className="truncate">{b.driver}</span>
                    </div>
                    {b.driverPrice && (
                      <div className="shrink-0 flex items-center justify-center bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100 text-[#8B4513] text-[12px] font-black h-8 shadow-sm">
                        <span>{"\u20AC"}{b.driverPrice}</span>
                      </div>
                    )}
                  </div>
                ) : !b.driver2 ? (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 text-gray-500 rounded-lg text-[11px] font-bold border border-gray-200 h-8 flex-1">
                    <Users size={13} className="shrink-0 text-gray-400" />
                    Not Assigned
                  </span>
                ) : null}

                {b.driver2 && (
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200 h-8 flex-1 truncate">
                      <Users size={13} className="shrink-0 text-purple-600" />
                      <span className="truncate">2nd: {b.driver2}</span>
                    </div>
                    {b.driver2Price && (
                      <div className="shrink-0 flex items-center justify-center bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200 text-purple-900 text-[12px] font-black h-8 shadow-sm">
                        <span>{"\u20AC"}{b.driver2Price}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TABLE ROW COMPONENT
═══════════════════════════════════════════════ */
function BookingTableRow({ b, setDetailBooking, updateStatus, zoomedBookingId, setZoomedBookingId, setBookings, loggedInDriver }: any) {
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
  const handleSave = async (e: any, updateObj: any, setEditState: any) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'bookings', b.id), updateObj);
      Object.assign(b, updateObj);
      if (setBookings) {
        setBookings((prev: Booking[]) => prev.map((bk: Booking) => bk.id === b.id ? { ...bk, ...updateObj } : bk));
      }
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

  const isCancelled = b.status?.toUpperCase() === 'CANCELLED';
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
            className={`client-name-trigger cursor-zoom-in inline-block origin-left transition-all duration-300 ease-in-out font-black text-gray-900 text-[15px]
              ${isZoomed
                ? "scale-[1.5] text-gray-900 font-bold bg-white border border-gray-200 shadow-xl px-2 py-0.5 rounded-lg z-50 relative cursor-zoom-out"
                : ""
              }`}
          >
            {normalizeCustomerName(b.customerName)}
          </div>
        </div>
        <div className="text-[#6B7280] text-[12px] font-medium mt-0.5">{b.bookingId}</div>
        {(b.passengers || 0) > 0 && (
          <div className="text-[12px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 mt-1.5 shadow-sm border border-gray-200">
            <Users size={14} /> {b.passengers}
          </div>
        )}
        <div className="mt-1.5" onClick={e => e.stopPropagation()}>
          <div className="flex flex-col gap-1 w-max">
            {(() => {
              const driverName = loggedInDriver?.name?.trim().toLowerCase();
              const driverId = loggedInDriver?.driverId?.trim().toLowerCase();
              const isMeDriver1 = !!(
                (driverName && b.driver?.trim().toLowerCase() === driverName) ||
                (driverId && b.driver?.trim().toLowerCase() === driverId)
              );
              const isMeDriver2 = !!(
                (driverName && b.driver2?.trim().toLowerCase() === driverName) ||
                (driverId && b.driver2?.trim().toLowerCase() === driverId)
              );

              if (isMeDriver2) {
                return (
                  <>
                    <div className="flex items-center gap-1 group/driver2 w-max">
                      <div className="flex items-center gap-2 w-full min-w-[140px] px-2 py-1 bg-purple-50 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200 truncate">
                        <Users size={13} className="shrink-0 text-purple-600" />
                        <span className="truncate">You (2nd Driver): {b.driver2}</span>
                      </div>
                      {b.driver2Price && (
                        <div className="shrink-0 flex items-center justify-center bg-purple-50 px-2 py-1 rounded-lg border border-purple-200 text-purple-900 text-[12px] font-black shadow-sm ml-2">
                          <span>{"\u20AC"}{b.driver2Price}</span>
                        </div>
                      )}
                    </div>
                    {b.driver && (
                      <div className="flex items-center gap-1 group/driver w-max">
                        <div className="flex items-center gap-2 w-full min-w-[140px] px-2 py-0.5 bg-gray-50 text-gray-700 rounded-lg text-[11px] font-medium border border-gray-200 truncate">
                          <Users size={12} className="shrink-0 text-gray-500" />
                          <span className="truncate">Co-driver: {b.driver}</span>
                        </div>
                      </div>
                    )}
                  </>
                );
              }

              if (isMeDriver1) {
                return (
                  <>
                    <div className="flex items-center gap-1 group/driver w-max">
                      <div className="flex items-center gap-2 w-full min-w-[140px] px-2 py-1 bg-orange-50 text-[#8B4513] rounded-lg text-[11px] font-bold border border-orange-100 truncate">
                        <Users size={13} className="shrink-0" />
                        <span className="truncate">You: {b.driver}</span>
                      </div>
                      {b.driverPrice && (
                        <div className="shrink-0 flex items-center justify-center bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 text-[#8B4513] text-[12px] font-black shadow-sm ml-2">
                          <span>{"\u20AC"}{b.driverPrice}</span>
                        </div>
                      )}
                    </div>
                    {b.driver2 && (
                      <div className="flex items-center gap-1 group/driver2 w-max">
                        <div className="flex items-center gap-2 w-full min-w-[140px] px-2 py-0.5 bg-gray-50 text-gray-700 rounded-lg text-[11px] font-medium border border-gray-200 truncate">
                          <Users size={12} className="shrink-0 text-gray-500" />
                          <span className="truncate">Co-driver: {b.driver2}</span>
                        </div>
                      </div>
                    )}
                  </>
                );
              }

              return (
                <>
                  {b.driver ? (
                    <div className="flex items-center gap-1 group/driver w-max">
                      <div className="flex items-center gap-2 w-full min-w-[140px] px-2 py-1 bg-orange-50 text-[#8B4513] rounded-lg text-[11px] font-bold border border-orange-100 truncate">
                        <Users size={13} className="shrink-0" />
                        <span className="truncate">{b.driver}</span>
                      </div>
                      {b.driverPrice && (
                        <div className="shrink-0 flex items-center justify-center bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 text-[#8B4513] text-[12px] font-black shadow-sm ml-2">
                          <span>{"\u20AC"}{b.driverPrice}</span>
                        </div>
                      )}
                    </div>
                  ) : !b.driver2 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[11px] font-bold border border-gray-200">
                      <Users size={12} /> Not Assigned
                    </span>
                  ) : null}

                  {b.driver2 && (
                    <div className="flex items-center gap-1 group/driver2 w-max">
                      <div className="flex items-center gap-2 w-full min-w-[140px] px-2 py-1 bg-purple-50 text-purple-900 rounded-lg text-[11px] font-bold border border-purple-200 truncate">
                        <Users size={13} className="shrink-0 text-purple-600" />
                        <span className="truncate">2nd: {b.driver2}</span>
                      </div>
                      {b.driver2Price && (
                        <div className="shrink-0 flex items-center justify-center bg-purple-50 px-2 py-1 rounded-lg border border-purple-200 text-purple-900 text-[12px] font-black shadow-sm ml-2">
                          <span>{"\u20AC"}{b.driver2Price}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
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
              <div className="text-gray-900 font-semibold text-[14px] truncate" title={cleanLocation(b.pickup)}>
                {cleanLocation(b.pickup)}
              </div>
              <div className="text-[#6B7280] font-medium text-[13px] truncate mt-1 flex items-center gap-1" title={cleanLocation(b.dropoff)}>
                <ArrowRight size={12} className="text-[#8B4513] shrink-0" strokeWidth={3} />
                {cleanLocation(b.dropoff)}
              </div>
            </div>
            <EditIcon onClick={(e: any) => { e.stopPropagation(); setIsEditingRoute(true); }} />
          </div>
        )}
      </td>

      <td className="px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold text-gray-900 text-[14px]">
                {formatDateDisplay(b.date, "en")}
              </div>
              <div className="text-[#8B4513] font-black text-[14px] mt-0.5">
                {formatTimeDisplay(b.time, "en")}
              </div>
            </div>
          </div>
      </td>



    </tr>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function DriverDashboard() {
  const [authed, setAuthed] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [driverIdInput, setDriverIdInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [loginMode, setLoginMode] = useState<"driver" | "admin">("driver");
  const [adminPassInput, setAdminPassInput] = useState("");
  const [loggedInDriver, setLoggedInDriver] = useState<Driver | null>(null);
  const [loginError, setLoginError] = useState("");
  const [section, setSection] = useState<string>("reservations");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [newBookingAlert, setNewBookingAlert] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

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
            console.log("New driver app version detected, showing warning...");
            setUpdateAvailable(true);
            clearInterval(interval);
          }
        }
      } catch (e) {
        // silently ignore
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

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

  const handleLogout = useCallback(() => {
    setAuthed(false);
    setLoggedInDriver(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("easyride_driver_token");
      localStorage.removeItem("easyride_driver_info");
    }
  }, []);

  useEffect(() => {
    let unsubscribe: () => void = () => {};

    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("easyride_driver_token");
      const storedInfo = localStorage.getItem("easyride_driver_info");

      if (storedToken === "authenticated") {
        if (storedInfo) {
          try {
            const driverObj = JSON.parse(storedInfo) as Driver;
            if (driverObj && driverObj.id) {
              setLoggedInDriver(driverObj);
              unsubscribe = onSnapshot(doc(db, "drivers", driverObj.id), (docSnap) => {
                if (!docSnap.exists()) {
                  console.warn("Driver document no longer exists in Firestore. Auto logging out...");
                  handleLogout();
                  setIsAuthLoading(false);
                  return;
                }
                const data = docSnap.data();
                if (data.status === "Disabled" || data.status === "Deleted") {
                  console.warn(`Driver status is '${data.status}'. Auto logging out...`);
                  handleLogout();
                  setIsAuthLoading(false);
                  return;
                }
                setLoggedInDriver({ id: docSnap.id, ...data } as Driver);
                setAuthed(true);
                setIsAuthLoading(false);
              }, (error) => {
                console.error("Driver doc listener error:", error);
                setAuthed(true);
                setIsAuthLoading(false);
              });
              return () => unsubscribe();
            }
          } catch (e) {
            console.error("Failed to parse driver session info:", e);
          }
        }
        setAuthed(true);
        setIsAuthLoading(false);
      } else {
        setAuthed(false);
        setIsAuthLoading(false);
      }
    } else {
      setIsAuthLoading(false);
    }

    return () => unsubscribe();
  }, [handleLogout]);

  // Realtime Bookings Listener for Drivers (Optimized to save database reads)
  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    let isInitial = true;

    const rawName = loggedInDriver?.name || "";
    const rawId = loggedInDriver?.driverId || "";
    const possibleNames = Array.from(new Set([
      rawName,
      rawId,
      rawName.trim(),
      rawId.trim(),
      rawName.toLowerCase(),
      rawId.toLowerCase(),
      rawName.toUpperCase(),
      rawId.toUpperCase()
    ].filter(Boolean))) as string[];

    const triggerAlertForBooking = (booking: Booking) => {
      console.log('🔔 New booking assigned to driver:', booking.bookingId);
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const notifTitle = '🟠 New Booking Assigned!';
        const notifOptions = {
          body: `${booking.customerName} - ${booking.date}`,
          icon: '/icon.png?v=12'
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
    };

    if (possibleNames.length > 0) {
      const map1 = new Map<string, Booking>();
      const map2 = new Map<string, Booking>();

      const syncAndSetDocs = () => {
        const merged = new Map<string, Booking>();
        map1.forEach((b, id) => merged.set(id, b));
        map2.forEach((b, id) => merged.set(id, b));

        const driverName = loggedInDriver?.name?.trim().toLowerCase();
        const driverId = loggedInDriver?.driverId?.trim().toLowerCase();

        const docs = Array.from(merged.values())
          .filter(b => b.status !== "pending_payment" && b.status !== "DELETED")
          .filter(b => {
            if (!loggedInDriver) return true; // Master Admin testing mode
            const bDriver = (b.driver || "").trim().toLowerCase();
            const bDriver2 = (b.driver2 || "").trim().toLowerCase();
            const isD1 = (driverName && bDriver === driverName) || (driverId && bDriver === driverId);
            const isD2 = (driverName && bDriver2 === driverName) || (driverId && bDriver2 === driverId);
            return isD1 || isD2;
          });

        console.log('Bookings received from DB for driver (1st & 2nd):', docs.length);
        docs.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
        setBookings(docs);
        setFetchError(null);
        setLoading(false);
      };

      const q1 = query(collection(db, "bookings"), where("driver", "in", possibleNames.slice(0, 10)));
      const q2 = query(collection(db, "bookings"), where("driver2", "in", possibleNames.slice(0, 10)));

      const unsub1 = onSnapshot(
        q1,
        (snapshot) => {
          if (!isInitial) {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const booking = change.doc.data() as Booking;
                const bDriver = (booking.driver || "").trim().toLowerCase();
                const bDriver2 = (booking.driver2 || "").trim().toLowerCase();
                const driverName = loggedInDriver?.name?.trim().toLowerCase();
                const driverId = loggedInDriver?.driverId?.trim().toLowerCase();
                const isForThisDriver = !loggedInDriver || 
                  (driverName && (bDriver === driverName || bDriver2 === driverName)) || 
                  (driverId && (bDriver === driverId || bDriver2 === driverId));
                if (isForThisDriver) {
                  triggerAlertForBooking(booking);
                }
              }
            });
          }
          map1.clear();
          snapshot.docs.forEach(d => map1.set(d.id, { id: d.id, ...d.data() } as Booking));
          syncAndSetDocs();
        },
        (error) => {
          console.error("Firestore onSnapshot error (driver1):", error);
          setFetchError(error.message || "Failed to fetch bookings.");
          setLoading(false);
        }
      );

      const unsub2 = onSnapshot(
        q2,
        (snapshot) => {
          if (!isInitial) {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                if (map1.has(change.doc.id)) return; // Avoid duplicate chime if in both
                const booking = change.doc.data() as Booking;
                const bDriver = (booking.driver || "").trim().toLowerCase();
                const bDriver2 = (booking.driver2 || "").trim().toLowerCase();
                const driverName = loggedInDriver?.name?.trim().toLowerCase();
                const driverId = loggedInDriver?.driverId?.trim().toLowerCase();
                const isForThisDriver = !loggedInDriver || 
                  (driverName && (bDriver === driverName || bDriver2 === driverName)) || 
                  (driverId && (bDriver === driverId || bDriver2 === driverId));
                if (isForThisDriver) {
                  triggerAlertForBooking(booking);
                }
              }
            });
          }
          map2.clear();
          snapshot.docs.forEach(d => map2.set(d.id, { id: d.id, ...d.data() } as Booking));
          syncAndSetDocs();
        },
        (error) => {
          console.error("Firestore onSnapshot error (driver2):", error);
          setFetchError(error.message || "Failed to fetch bookings.");
          setLoading(false);
        }
      );

      const initialTimer = setTimeout(() => { isInitial = false; }, 1500);

      return () => {
        clearTimeout(initialTimer);
        unsub1();
        unsub2();
      };
    } else {
      const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(100));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const rawDocs = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as Booking))
            .filter(b => b.status !== "pending_payment" && b.status !== "DELETED");

          console.log('Bookings received from DB (admin mode):', rawDocs.length);
          rawDocs.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });
          setBookings(rawDocs);
          setFetchError(null);
          setLoading(false);

          if (!isInitial) {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const booking = change.doc.data() as Booking;
                triggerAlertForBooking(booking);
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
      return () => unsubscribe();
    }
  }, [authed, loggedInDriver, playBeep]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (loginMode === "admin") {
      if (adminPassInput === "admin123" || adminPassInput === "taxisbarcelona24") {
        if (typeof window !== "undefined") {
          localStorage.setItem("easyride_admin_token", "authenticated");
        }
        window.location.href = "/admin-dashboard";
      } else {
        setLoginError("Invalid Admin Password");
      }
      return;
    }

    const trimmedId = driverIdInput.trim().toUpperCase();
    const trimmedPin = pinInput.trim();

    // Special Master Admin testing credentials only (must enter BOTH ID 'ADMIN' and PIN 'ADMIN123')
    if (trimmedId === "ADMIN" && trimmedPin === "ADMIN123") {
      setAuthed(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("easyride_driver_token", "authenticated");
      }
      return;
    }

    try {
      const snap = await getDocs(collection(db, "drivers"));
      const searchId = trimmedId.toLowerCase();
      
      const driverDoc = snap.docs.find(d => {
        const data = d.data();
        return (data.driverId || "").trim().toLowerCase() === searchId || (data.name || "").trim().toLowerCase() === searchId;
      });

      if (!driverDoc) {
        setLoginError("Invalid Driver Name/ID or PIN");
        return;
      }
      const driverData = { id: driverDoc.id, ...driverDoc.data() } as Driver;

      if (driverData.status === "Disabled" || driverData.status === "Deleted") {
        setLoginError("Driver account is disabled or deleted");
        return;
      }

      if (driverData.pin !== trimmedPin) {
        setLoginError("Invalid Driver Name/ID or PIN");
        return;
      }

      setLoggedInDriver(driverData);
      setAuthed(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("easyride_driver_token", "authenticated");
        localStorage.setItem("easyride_driver_info", JSON.stringify(driverData));
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setLoginError(err.message || "Failed to log in. Please check your Driver ID and PIN.");
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
        {updateAvailable && (
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center border-t-4 border-[#8B4513] animate-in zoom-in duration-300">
              <AlertTriangle className="w-12 h-12 text-[#8B4513] mx-auto mb-4" />
              <h2 className="text-xl font-black text-gray-900 mb-2">New Update Available!</h2>
              <p className="text-gray-600 text-[14px] font-medium mb-6 leading-relaxed">A new driver app version is ready. Update now to refresh your homescreen logo and latest features.</p>
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
                className="w-full bg-[#8B4513] hover:bg-[#723910] text-white font-black py-3 rounded-lg text-sm shadow-md transition-all active:scale-95"
              >
                Update App Now
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full">
          <img src="/driver-icon.png?v=28" alt="BCN Drivers Logo" className="h-24 w-24 rounded-2xl object-contain mx-auto mb-4 shadow-md border-2 border-amber-500/20 p-1 bg-white" />
          <h1 className="text-2xl font-black text-center text-gray-900 mb-1">
            BCN Drivers Portal
          </h1>
          <p className="text-center text-[#6B7280] text-xs mb-6 font-medium">
            {loginMode === "driver" ? "Enter Driver ID & 4-Digit PIN to access" : "Enter Admin Password to access"}
          </p>

          {loginError && (
            <div className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold p-3 rounded-lg mb-4 text-center">
              {loginError}
            </div>
          )}

          {loginMode === "driver" ? (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Driver Name or ID</label>
                <input
                  type="text"
                  placeholder="e.g. demo"
                  className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all uppercase"
                  value={driverIdInput}
                  onChange={e => setDriverIdInput(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">4-Digit PIN</label>
                <input
                  type="password"
                  placeholder="****"
                  maxLength={4}
                  pattern="\d{4}"
                  className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all tracking-[0.4em]"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Admin Password</label>
                <input
                  type="password"
                  placeholder="Enter password"
                  className="w-full px-4 py-3 bg-[#F8F9FA] border border-gray-200 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8B4513]/20 focus:border-[#8B4513] transition-all"
                  value={adminPassInput}
                  onChange={e => setAdminPassInput(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <button type="submit" className="w-full py-3.5 bg-[#8B4513] text-white rounded-xl font-bold text-[15px] hover:bg-[#8B4513]/90 transition-colors shadow-sm">
            Access Dashboard
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
          loggedInDriver={loggedInDriver}
        />
      );
    }
    if (section === "reservations") {
      return (
        <ReservationsSection
          bookings={bookings}
          loading={loading}
          onRefresh={() => { }}
          setBookings={setBookings}
          loggedInDriver={loggedInDriver}
        />
      );
    }

  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] print:bg-white flex flex-col md:flex-row overflow-hidden print:overflow-visible font-sans" suppressHydrationWarning>

      {updateAvailable && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center border-t-4 border-[#8B4513] animate-in zoom-in duration-300">
            <AlertTriangle className="w-12 h-12 text-[#8B4513] mx-auto mb-4" />
            <h2 className="text-xl font-black text-gray-900 mb-2">New Update Available!</h2>
            <p className="text-gray-600 text-[14px] font-medium mb-6 leading-relaxed">A new driver app version is ready. Update now to refresh your homescreen logo and latest features.</p>
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
              className="w-full bg-[#8B4513] hover:bg-[#723910] text-white font-black py-3 rounded-lg text-sm shadow-md transition-all active:scale-95"
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

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-100 flex-col shrink-0 shadow-sm z-10 print:hidden">
        <div className="flex items-center justify-center gap-2 px-6 py-5 border-b border-gray-100 flex-col">
          <img src="/driver-icon.png?v=28" alt="BCN Drivers Logo" className="h-16 max-w-[160px] rounded-xl object-contain shadow-sm border border-amber-500/20 p-1 bg-white" />
          <span className="font-black text-gray-900 text-lg tracking-tight mt-1">BCN Drivers</span>
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
        <div className="px-6 py-4 border-t border-gray-100 bg-[#F8F9FA]/50">
          <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Logged in Driver</div>
          <div className="text-[15px] font-black text-[#111111] truncate mt-0.5" suppressHydrationWarning>
            {loggedInDriver?.name || loggedInDriver?.driverId || "Driver"}
          </div>
          
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-8 py-6 text-[#6B7280] hover:text-red-600 transition-colors text-[15px] border-t border-gray-100 font-bold"
        >
          <LogOut size={20} strokeWidth={2} /> Sign out
        </button>
      </aside>

      <div className="md:hidden flex items-center justify-between bg-white px-3 py-2 shrink-0 z-40 sticky top-0 border-b border-gray-100 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <img src="/driver-icon.png?v=28" alt="BCN Drivers Logo" className="h-9 w-9 rounded-lg object-contain shadow-xs border border-amber-500/20 p-0.5 bg-white shrink-0" />
          <div className="flex flex-col">
            <span className="font-black text-gray-900 text-sm tracking-tight leading-tight">BCN Drivers</span>
            <span className="text-[10px] font-bold text-gray-500">Driver Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all shadow-sm active:scale-95 shrink-0"
            title="Refresh dashboard"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg transition-colors active:bg-red-100 shadow-sm shrink-0"
          >
            <LogOut size={12} strokeWidth={2.5} /> Logout
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 md:pb-0 print:w-full print:block print:p-0 print:m-0 print:overflow-visible print:bg-white">
        {fetchError && (
          <div className="p-4 m-4 bg-red-50 border-l-4 border-red-500 text-red-700">
            <h3 className="font-bold">Error Fetching Data</h3>
            <p>{fetchError}</p>
            <p className="text-sm mt-2 opacity-80">This typically happens if Firebase environment variables are missing on the production deployment. Check Render environment variables for NEXT_PUBLIC_FIREBASE_PROJECT_ID.</p>
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

function ReservationsSection({ bookings, loading, onRefresh, setBookings, defaultFilter, sourceFilter, loggedInDriver }: {
  bookings: Booking[]; loading: boolean; onRefresh: () => void; setBookings: any; defaultFilter?: string; sourceFilter?: string; loggedInDriver?: Driver | null;
}) {
  const [filter, setFilter] = useState(defaultFilter === "confirmed" ? "current" : (defaultFilter ?? "current"));
  const [search, setSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState("ALL");
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [mobileDeleteConfirm, setMobileDeleteConfirm] = useState<Booking | null>(null);

  if (!bookings) {
    return <EmptyState title="No bookings data" message="We couldn't retrieve any booking data. Please check your database connection or try reloading." />;
  }

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [preset, setPreset] = useState<string>("full");
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

  const filtered = bookings.filter(b => {
    // Map status strings flexibly: "NEW" (Bokun/Viator imports) means the same as "confirmed"
    const statusStr = b.status as string;
    const isCancelled = statusStr === "cancelled" || statusStr === "CANCELLED" || statusStr === "CANCELED";
    const isDeleted = statusStr === "DELETED" || statusStr === "deleted";
    const matchFilter = (filter === "ALL" && !isCancelled && !isDeleted)
      || (filter === "current" && (statusStr === "confirmed" || statusStr === "pending_payment" || statusStr === "NEW" || statusStr === "new" || statusStr === "PENDING" || statusStr === "pending"))
        || (filter === "pending" && (statusStr === "confirmed" || statusStr === "pending_payment" || statusStr === "NEW" || statusStr === "new" || statusStr === "PENDING" || statusStr === "pending"))
      || (filter === "completed" && (statusStr === "completed" || statusStr === "COMPLETED"))
      || (filter === "past" && (statusStr === "confirmed" || statusStr === "completed" || statusStr === "COMPLETED" || statusStr === "NEW" || statusStr === "new" || statusStr === "PENDING" || statusStr === "pending"))
        || (filter === "cancelled" && isCancelled)
      || (filter === "deleted" && isDeleted)
      || (b.status === filter && !isDeleted && !isCancelled);
    const matchSource = !sourceFilter || b.source === sourceFilter;

    const s = search.toLowerCase();
    const matchSearch = !s || b.bookingId?.toLowerCase().includes(s)
      || b.customerName?.toLowerCase().includes(s)
      || b.email?.toLowerCase().includes(s)
      || b.driver?.toLowerCase().includes(s)
      || b.driver2?.toLowerCase().includes(s);

    const matchDriverFilter = driverFilter === "ALL"
      ? true
      : (driverFilter === "UNASSIGNED" ? (!b.driver && !b.driver2) : (b.driver === driverFilter || b.driver2 === driverFilter));

    // Parse time strings like "7:00 AM", "14:30" into total minutes (24h)
    const parseBookingTime = (t: string): number | null => {
      if (!t) return null;
      const ampm = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t.trim());
      if (ampm) {
        let h = parseInt(ampm[1], 10);
        const m = parseInt(ampm[2], 10);
        if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0;
        if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        return h * 60 + m;
      }
      const hhmm = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
      if (hhmm) return parseInt(hhmm[1], 10) * 60 + parseInt(hhmm[2], 10);
      return null;
    };

    const isBookingInPast = (bDate: Date, timeStr: string): boolean => {
      const now = new Date();
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);
      const bD = new Date(bDate);
      bD.setHours(0, 0, 0, 0);
      if (bD < todayMidnight) return true;
      if (bD > todayMidnight) return false;
      
      const bookingMins = parseBookingTime(timeStr);
      if (bookingMins !== null) {
        const nowMins = now.getHours() * 60 + now.getMinutes();
        return nowMins >= bookingMins;
      }
      return false;
    };

    let matchDate = true;
    const bDate = parseDateForSort(b.date);

    if (filter === "current") {
      if (bDate) {
        const bD = new Date(bDate);
        bD.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (bD < today) {
          matchDate = false; // Hide bookings older than today
        }
      } else {
        matchDate = true;
      }
    } else if (filter === "pending") {
      if (bDate) {
        const bD = new Date(bDate);
        bD.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (bD < today) matchDate = false;
      }
    } else if (filter === "past") {
      if (bDate) {
        const bD = new Date(bDate);
        bD.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (bD >= today && b.status !== "completed") matchDate = false;
      } else {
        matchDate = false;
      }
    } else if (startDate || endDate) {
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

    const timeA = a.time || "";
    const timeB = b.time || "";
    return effectiveSortOrder === "asc" ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
  });

  const updateStatus = async (id: string, status: string) => {
    try { await updateDoc(doc(db, "bookings", id), { status }); } catch { }
    setBookings((prev: Booking[]) => prev.map(b => b.id === id ? { ...b, status: status as BookingStatus } : b));
  };


  const totalEarnings = bookings.reduce((sum, b) => {
    const s = (b.status || '').toLowerCase();
    if (s !== 'cancelled' && s !== 'deleted') {
      const isDriver2 = loggedInDriver && (
        (b.driver2 && loggedInDriver.name && b.driver2.toLowerCase() === loggedInDriver.name.toLowerCase()) ||
        (b.driver2 && loggedInDriver.id && b.driver2 === loggedInDriver.id)
      );
      const rawPrice = isDriver2 ? (b.driver2Price || b.driverPrice || '') : (b.driverPrice || '');
      const dp = parseFloat(rawPrice.toString().replace(/[^\d.]/g, ''));
      return sum + (isNaN(dp) ? 0 : dp);
    }
    return sum;
  }, 0);

  return (
    <div className="p-4 md:p-8">
      {/* Booking Detail Modal */}
      {detailBooking && (
        <BookingDetailModal
          booking={detailBooking}
          onClose={() => setDetailBooking(null)}
          loggedInDriver={loggedInDriver}
        />
      )}

      {/* Mobile Delete Confirm */}
      {mobileDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setMobileDeleteConfirm(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900 mb-1">Delete Booking?</h3>
            <p className="text-sm text-gray-500 mb-1">{normalizeCustomerName(mobileDeleteConfirm.customerName)}</p>
            <p className="text-xs text-gray-400 mb-5">{mobileDeleteConfirm.bookingId}</p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
                onClick={() => setMobileDeleteConfirm(null)}
              >Cancel</button>
              <button
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm"
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, 'bookings', mobileDeleteConfirm.id), {
                      status: 'DELETED',
                      deletedAt: Timestamp.now(),
                      deletedBy: auth.currentUser?.email || 'driver'
                    });
                    setBookings((prev: Booking[]) => prev.map(b => b.id === mobileDeleteConfirm.id ? { ...b, status: 'DELETED' as BookingStatus } : b));
                  } catch { alert('Failed to delete'); }
                  setMobileDeleteConfirm(null);
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Reservations</h1>
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

      {/* Total Earnings Small Stat Card */}
      <div className="mb-6">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/70 p-3.5 px-4 rounded-xl shadow-sm inline-flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500/15 rounded-lg flex items-center justify-center text-amber-800 font-bold shrink-0">
            <DollarSign size={20} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={13} className="text-amber-600" /> Total Earnings
            </p>
            <p className="text-xl font-black text-gray-900 leading-tight">
              €{totalEarnings.toFixed(2)}
            </p>
          </div>
        </div>
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

      {/* Driver Controls Panel */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
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

      {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-6">
        {["ALL", "current", "pending", "past"].map(f => (
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
            {f === "current" ? "Current" : (f === "pending" ? "Pending" : (f === "past" ? "Past" : f.replace("_", " ")))}
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
                  <div className="bg-[#8B4513] text-white px-4 py-2 font-black text-[15px] uppercase tracking-wide rounded-lg shadow-sm mt-6 mb-2 sticky top-[135px] z-10 flex items-center gap-2">
                    <Calendar size={16} strokeWidth={3} />
                    {bDate}
                  </div>
                )}
                <MobileBookingCard
                  b={b}
                  conf={conf}
                  setDetailBooking={setDetailBooking}
                  updateStatus={updateStatus}
                  zoomedBookingId={zoomedBookingId}
                  setZoomedBookingId={setZoomedBookingId}
                  setBookings={setBookings}
                  onDeleteClick={() => setMobileDeleteConfirm(b)}
                  loggedInDriver={loggedInDriver}
                />
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


            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400 font-bold">Loading…</td></tr>}
            {!loading && sorted.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400 font-bold">No bookings found.</td></tr>}
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
                        <td colSpan={4} className="bg-[#8B4513] text-white px-5 py-2.5 font-black text-[14px] uppercase tracking-wide">
                          <div className="flex items-center gap-2">
                            <Calendar size={16} strokeWidth={3} />
                            <span>{bDate}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <BookingTableRow
                      key={b.id}
                      b={b}
                      setDetailBooking={setDetailBooking}
                      updateStatus={updateStatus}
                      zoomedBookingId={zoomedBookingId}
                      setZoomedBookingId={setZoomedBookingId}
                      loggedInDriver={loggedInDriver}
                    />
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
function BookingDetailModal({ booking, onClose, loggedInDriver }: { booking: Booking; onClose: () => void; loggedInDriver?: Driver | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showNameSign, setShowNameSign] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(normalizeCustomerName(booking.customerName || ""));
  const [isSavingName, setIsSavingName] = useState(false);
  const [fontSizeScale, setFontSizeScale] = useState(1.0);

  // Editable address/date/time states
  const [isEditingPickup, setIsEditingPickup] = useState(false);
  const [editedPickup, setEditedPickup] = useState(booking.pickup || "");
  const [isEditingDropoff, setIsEditingDropoff] = useState(false);
  const [editedDropoff, setEditedDropoff] = useState(booking.dropoff || "");
  const [isEditingDateTime, setIsEditingDateTime] = useState(false);
  const [editedDate, setEditedDate] = useState(booking.date || "");
  const [editedTime, setEditedTime] = useState(booking.time || "");
  const [isEditingPassengers, setIsEditingPassengers] = useState(false);
  const [editedPassengers, setEditedPassengers] = useState(booking.passengers ? String(booking.passengers) : "1");
  const [isEditingCruiseShip, setIsEditingCruiseShip] = useState(false);
  const [editedCruiseShip, setEditedCruiseShip] = useState(booking.cruiseShip || "");
  const [isEditingDisembarkTime, setIsEditingDisembarkTime] = useState(false);
  const [editedDisembarkTime, setEditedDisembarkTime] = useState(booking.disembarkTime || "");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editedPhone, setEditedPhone] = useState(booking.phone || "");
  const [isSavingField, setIsSavingField] = useState(false);
  // Delete State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSoftDelete = async () => {
    setIsDeleting(true);
    try {
      const ref = doc(db, 'bookings', booking.id);
      await updateDoc(ref, {
        status: "DELETED",
        deletedAt: Timestamp.now(),
        deletedBy: auth.currentUser?.email || "admin"
      });
      // Optimistic update
      Object.assign(booking, {
        status: "DELETED",
        deletedAt: Timestamp.now(),
        deletedBy: auth.currentUser?.email || "admin"
      });
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      console.error("Failed to delete booking", error);
      alert("Failed to delete booking");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    setIsDeleting(true);
    try {
      const ref = doc(db, 'bookings', booking.id);
      await updateDoc(ref, {
        status: "cancelled", // Defaulting to cancelled so they can review it
        deletedAt: deleteField(),
        deletedBy: deleteField()
      });
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      console.error("Failed to restore booking", error);
      alert("Failed to restore booking");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePermanentDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/delete`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to permanently delete");
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      console.error("Failed to permanently delete booking", error);
      alert("Failed to permanently delete booking");
    } finally {
      setIsDeleting(false);
    }
  };

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
    <div className="flex flex-col py-0.5">
      <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0">{label}</span>
      <div className="flex items-center justify-between mb-1">
        {children ?? <span className="text-xs font-bold text-black leading-snug break-words pr-2">{value || "—"}</span>}
        {copyKey && value && (
          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(value, copyKey); }} className="text-[#6B7280] hover:text-[#8B4513] transition-colors shrink-0" title="Copy">
            {copied === copyKey ? <CheckCircle2 size={12} className="text-green-500" /> : <ClipboardList size={12} />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] w-full h-full bg-white flex flex-col" onClick={e => e.stopPropagation()}>

      {/* Top Bar with Back Arrow */}
      <div className="flex items-center px-4 py-3 border-b border-gray-200 shrink-0 bg-white shadow-sm">
        <button onClick={onClose} className="px-3 py-2 -ml-1 bg-gray-100 text-gray-900 hover:bg-[#8B4513] hover:text-white rounded-lg transition-colors flex items-center gap-2 border border-gray-200 hover:border-[#8B4513]">
          <ArrowLeft size={18} strokeWidth={2.5} />
          <span className="font-bold text-[14px]">Back to Dashboard</span>
        </button>
      </div>

      {/* Blue Header */}
      <div className="bg-[#8B4513] px-3 py-2 flex flex-col shrink-0 text-white shadow-md z-10">
        <div className="flex items-start justify-between">
          <span className="text-sm font-bold leading-none tracking-tight pt-1">RES# {booking.bookingId}</span>
        </div>
        <div className="text-xs font-medium mt-1 opacity-95">{normalizeCustomerName(booking.customerName)}</div>
      </div>

      {/* Scrollable Body */}
      <div className="overflow-y-auto flex-1 bg-white pb-16">

        {/* DRIVER ASSIGNMENT */}
        <div className="px-3 py-1">
          <div className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider mb-1 mt-2">DRIVER ASSIGNMENT</div>
          <div className="flex flex-col py-0.5 bg-gray-50 rounded-lg p-2 mb-2 border border-gray-100">
            {(() => {
              const driverName = loggedInDriver?.name?.trim().toLowerCase();
              const driverId = loggedInDriver?.driverId?.trim().toLowerCase();
              const isMeDriver1 = !!(
                (driverName && booking.driver?.trim().toLowerCase() === driverName) ||
                (driverId && booking.driver?.trim().toLowerCase() === driverId)
              );
              const isMeDriver2 = !!(
                (driverName && booking.driver2?.trim().toLowerCase() === driverName) ||
                (driverId && booking.driver2?.trim().toLowerCase() === driverId)
              );

              if (isMeDriver2) {
                return (
                  <>
                    <span className="text-[9px] text-purple-800 uppercase tracking-wider mb-1 font-bold">YOUR ASSIGNMENT (2ND DRIVER)</span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-900 rounded-lg text-[13px] font-bold border border-purple-200 flex-1 truncate shadow-sm">
                        <Users size={16} strokeWidth={2.5} className="shrink-0 text-purple-600" />
                        <span className="truncate text-[14px] font-black">You: {booking.driver2}</span>
                      </div>
                    </div>
                    {booking.driver && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 block">CO-DRIVER</span>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 rounded-lg text-[12px] font-medium border border-gray-200 shadow-sm">
                          <Users size={14} className="shrink-0 text-gray-400" />
                          <span className="truncate">{booking.driver}</span>
                        </div>
                      </div>
                    )}
                  </>
                );
              }

              if (isMeDriver1) {
                return (
                  <>
                    <span className="text-[9px] text-amber-800 uppercase tracking-wider mb-1 font-bold">YOUR ASSIGNMENT (1ST DRIVER)</span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-[#8B4513] rounded-lg text-[13px] font-bold border border-orange-200 flex-1 truncate shadow-sm">
                        <Users size={16} strokeWidth={2.5} className="shrink-0 text-[#8B4513]" />
                        <span className="truncate text-[14px] font-black">You: {booking.driver}</span>
                      </div>
                    </div>
                    {booking.driver2 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 block">CO-DRIVER</span>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 rounded-lg text-[12px] font-medium border border-gray-200 shadow-sm">
                          <Users size={14} className="shrink-0 text-gray-400" />
                          <span className="truncate">{booking.driver2}</span>
                        </div>
                      </div>
                    )}
                  </>
                );
              }

              return (
                <>
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0">ASSIGNED DRIVER</span>
                  <div className="flex items-center justify-between mt-1">
                    {booking.driver ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg text-[13px] font-bold border border-gray-200 flex-1 truncate shadow-sm">
                        <Users size={16} strokeWidth={2.5} className="shrink-0 text-gray-500" />
                        <span className="truncate text-[14px] font-black">{booking.driver}</span>
                      </div>
                    ) : !booking.driver2 ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-500 rounded-lg text-[13px] font-bold border border-gray-200 flex-1 truncate shadow-sm">
                        <Users size={16} strokeWidth={2.5} className="shrink-0 text-gray-400" />
                        <span className="truncate text-[14px] font-black">Not Assigned</span>
                      </div>
                    ) : null}
                  </div>
                  {booking.driver2 && (
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-900 rounded-lg text-[13px] font-bold border border-purple-200 flex-1 truncate shadow-sm">
                        <Users size={16} strokeWidth={2.5} className="shrink-0 text-purple-600" />
                        <span className="truncate text-[14px] font-black">2nd Driver: {booking.driver2}</span>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* PICKUP INFORMATION */}
        <div className="px-3 py-1">
          <div className="text-[12px] font-black bg-[#8B4513] text-white uppercase tracking-wider mb-3 mt-4 px-3 py-2 w-full rounded-md shadow-sm">PICKUP INFORMATION</div>

          {/* Editable Pickup */}
          <div className="flex flex-col py-0.5">
            <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0">PICKUP ADDRESS</span>
            <div className="flex items-center justify-between mb-1 gap-1">
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
                  <span className="text-xs font-bold text-black leading-snug break-words pr-2 flex-1">{booking.pickup || '—'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <ModalEditBtn onClick={() => setIsEditingPickup(true)} />
                    {booking.pickup && (
                      <button onClick={(e) => { e.stopPropagation(); copyToClipboard(booking.pickup, 'pickup'); }} className="text-[#6B7280] hover:text-[#8B4513] transition-colors p-1" title="Copy">
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
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider">DATE</span>
                    <input type="date" value={editedDate} onChange={e => setEditedDate(e.target.value)}
                      className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white mt-0.5" />
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider">TIME</span>
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
                  <Row label="DATE" value={formatDate(booking.date)} />
                </div>
                <div className="flex items-start justify-between">
                  <div className="flex-1"><Row label="TIME" value={booking.time} /></div>
                  <ModalEditBtn onClick={() => setIsEditingDateTime(true)} />
                </div>
              </>
            )}
          </div>

          {/* Editable Passengers */}
          <div className="flex flex-col py-1">
            <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">PASSENGERS</span>
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
                  <span className="text-xs font-bold text-black leading-snug break-words pr-2 flex-1">
                    {booking.passengers ? String(booking.passengers) : "1"}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <ModalEditBtn onClick={() => setIsEditingPassengers(true)} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Special Requirements */}
          {(booking.childSeatRequired || booking.wheelchairAccessRequired || booking.petsAllowed) && (
            <div className="flex flex-col py-0.5 mt-1">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">SPECIAL REQUIREMENTS</span>
              <div className="flex flex-wrap gap-1">
                {booking.childSeatRequired && <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">Child Seat</span>}
                {booking.wheelchairAccessRequired && <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">Wheelchair Access</span>}
                {booking.petsAllowed && <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold">Pets Allowed</span>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2">
            {(booking.bookingType === 'cruise_arrival' || booking.bookingType === 'cruise_departure' || booking.cruiseShip || isEditingCruiseShip) && (
              <>
                {/* Editable Cruise Ship */}
                <div className="flex flex-col py-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">CRUISE SHIP</span>
                  <div className="flex items-center justify-between gap-1">
                    {isEditingCruiseShip ? (
                      <div className="flex-1 flex flex-col gap-1">
                        <input
                          type="text"
                          placeholder="e.g. Holland America"
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
                            {isSavingField ? '...' : 'Save'}
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
                        <span className="text-xs font-bold text-black leading-snug break-words pr-2 flex-1">
                          {booking.cruiseShip || "—"}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <ModalEditBtn onClick={() => setIsEditingCruiseShip(true)} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Editable Disembark Time */}
                <div className="flex flex-col py-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">DISEMBARK TIME</span>
                  <div className="flex items-center justify-between gap-1">
                    {isEditingDisembarkTime ? (
                      <div className="flex-1 flex flex-col gap-1">
                        <input
                          type="text"
                          placeholder="e.g. 7:30"
                          value={editedDisembarkTime}
                          onChange={e => setEditedDisembarkTime(e.target.value)}
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && saveField({ disembarkTime: editedDisembarkTime.trim() }, () => setIsEditingDisembarkTime(false))}
                          className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => saveField({ disembarkTime: editedDisembarkTime.trim() }, () => setIsEditingDisembarkTime(false))}
                            disabled={isSavingField}
                            className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                          >
                            {isSavingField ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setIsEditingDisembarkTime(false); setEditedDisembarkTime(booking.disembarkTime || ''); }}
                            className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-black leading-snug break-words pr-2 flex-1">
                          {booking.disembarkTime || "—"}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <ModalEditBtn onClick={() => setIsEditingDisembarkTime(true)} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {(booking.airline || booking.flight || (!booking.cruiseShip && !booking.bookingType?.includes('cruise'))) && (
              <>
                <Row label="AIRLINE" value={booking.airline || " "} />
                <Row label="FLIGHT" value={booking.flight || " "} />
                {booking.flightArrivalTime && <Row label="ARRIVAL TIME" value={booking.flightArrivalTime} />}
                {booking.flightDepartureTime && <Row label="DEPARTURE TIME" value={booking.flightDepartureTime} />}
              </>
            )}
          </div>
        </div>

        <div className="h-[1px] bg-gray-100 mx-3 my-1" />

        {/* DROPOFF INFORMATION */}
        <div className="px-3 py-1">
          <div className="text-[12px] font-black bg-[#8B4513] text-white uppercase tracking-wider mb-3 mt-4 px-3 py-2 w-full rounded-md shadow-sm">DROPOFF INFORMATION</div>

          {/* Editable Dropoff */}
          <div className="flex flex-col py-0.5">
            <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0">DROP OFF ADDRESS</span>
            <div className="flex items-center justify-between mb-1 gap-1">
              {isEditingDropoff ? (
                <div className="flex-1 flex flex-col gap-1">
                  <input type="text" value={editedDropoff} onChange={e => setEditedDropoff(e.target.value)} autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveField({ dropoff: editedDropoff }, () => setIsEditingDropoff(false))}
                    className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white" />
                  <div className="flex gap-1">
                    <button onClick={() => saveField({ dropoff: editedDropoff }, () => setIsEditingDropoff(false))} disabled={isSavingField}
                      className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50">
                      {isSavingField ? '...' : 'Save'}
                    </button>
                    <button onClick={() => { setIsEditingDropoff(false); setEditedDropoff(booking.dropoff || ''); }}
                      className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-xs font-bold text-black leading-snug break-words pr-2 flex-1">{booking.dropoff || '—'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <ModalEditBtn onClick={() => setIsEditingDropoff(true)} />
                    {booking.dropoff && (
                      <a href={mapsLink(booking.dropoff)} target="_blank" rel="noopener noreferrer" className="text-[#6B7280] hover:text-[#8B4513] shrink-0 p-1" title="Open in Maps">
                        <MapPin size={12} strokeWidth={2.5} />
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="h-[1px] bg-gray-100 mx-3 my-1" />

        {/* CUSTOMER INFORMATION */}
        <div className="px-3 py-1 pb-2">
          <div className="text-[12px] font-black bg-[#8B4513] text-white uppercase tracking-wider mb-3 mt-4 px-3 py-2 w-full rounded-md shadow-sm">CUSTOMER INFORMATION</div>

          <div className="flex flex-col py-0.5">
            <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0">CUSTOMER NAME</span>
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
                  className="text-xs font-bold text-[#8B4513] text-left uppercase tracking-wide flex-1 break-words py-1 active:opacity-70"
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

          {/* Editable Phone */}
          <div className="flex flex-col py-0.5">
            <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0">PHONE</span>
            <div className="flex items-center justify-between mb-1 gap-1">
              {isEditingPhone ? (
                <div className="flex-1 flex flex-col gap-1">
                  <input
                    type="tel"
                    value={editedPhone}
                    onChange={e => setEditedPhone(e.target.value)}
                    autoFocus
                    placeholder="e.g. +34 600 000 000"
                    onKeyDown={e => e.key === 'Enter' && saveField({ phone: editedPhone.trim() }, () => setIsEditingPhone(false))}
                    className="w-full text-xs font-bold text-gray-900 border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-[#8B4513] bg-white"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => saveField({ phone: editedPhone.trim() }, () => setIsEditingPhone(false))}
                      disabled={isSavingField}
                      className="text-[10px] font-bold bg-[#8B4513] text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                    >
                      {isSavingField ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setIsEditingPhone(false); setEditedPhone(booking.phone || ''); }}
                      className="text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-xs font-bold text-black truncate flex-1">{booking.phone || "—"}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <ModalEditBtn onClick={() => setIsEditingPhone(true)} />
                    {booking.phone && (
                      <>
                        <a href={`tel:${booking.phone}`} className="text-[#6B7280] hover:text-green-600 transition-colors" title="Call">
                          <Phone size={12} strokeWidth={2.5} />
                        </a>
                        <a href={whatsappLink(booking.phone)} target="_blank" rel="noopener noreferrer" className="text-[#6B7280] hover:text-green-500 transition-colors" title="WhatsApp">
                          <MessageCircle size={12} strokeWidth={2.5} />
                        </a>
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(booking.phone!, "phone"); }} className="text-[#6B7280] hover:text-[#8B4513] transition-colors" title="Copy">
                          {copied === "phone" ? <CheckCircle2 size={12} className="text-green-500" /> : <ClipboardList size={12} />}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <Row label="BOOKING REF" value={booking.bookingId} copyKey="ref" />

          {booking.customerNotes && (
            <div className="flex flex-col py-0.5 mt-3">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">CUSTOMER NOTES & REQS</span>
              <div className="bg-yellow-50 text-yellow-900 text-[11px] font-medium p-2.5 rounded-md whitespace-pre-wrap leading-relaxed border border-yellow-200 shadow-sm">
                {booking.customerNotes}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Full-Screen Horizontal Name Sign Overlay */}
      {showNameSign && (
        <div
          className="fixed inset-0 z-[9999] w-full h-full bg-black flex flex-col items-center justify-center cursor-pointer overflow-hidden select-none"
          onClick={() => {
            if (!isEditingFullScreen) setShowNameSign(false);
          }}
        >
          {/* Top Logo on Greeting Sign */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[10000] flex items-center justify-center max-w-[320px] max-h-20 px-5 py-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl">
            <img src="/driver-icon.png?v=28" alt="Greeting Logo" className="max-h-12 max-w-[280px] object-contain" />
          </div>

          {/* Controls at bottom */}
          {!isEditingFullScreen && (
            <div
              className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-[10000] bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/15 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setFontSizeScale(prev => Math.max(0.4, prev - 0.15))}
                className="w-10 h-10 bg-white/10 hover:bg-white/25 active:bg-white/40 border border-white/20 text-white rounded-full flex items-center justify-center font-bold text-xl transition-all shadow-md cursor-pointer select-none"
                title="Zoom Out"
              >
                −
              </button>
              <button
                onClick={() => setFontSizeScale(1.0)}
                className="text-white/70 hover:text-white text-[11px] font-bold uppercase tracking-wider transition-colors px-2 py-1 cursor-pointer select-none"
                title="Reset Size"
              >
                Reset
              </button>
              <button
                onClick={() => setFontSizeScale(prev => Math.min(3.0, prev + 0.15))}
                className="w-10 h-10 bg-white/10 hover:bg-white/25 active:bg-white/40 border border-white/20 text-white rounded-full flex items-center justify-center font-bold text-xl transition-all shadow-md cursor-pointer select-none"
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



