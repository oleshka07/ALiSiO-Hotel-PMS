'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import './booking-v2.css';
// Exception: @bookings public API imports better-sqlite3 (server-only).
// translations.ts has zero server deps — safe to import from ui/ in 'use client' context.
// TODO: move translations to src/shared/ when creating that layer.
import type { BookingLang } from '@/modules/bookings/ui/translations';
import { BOOKING_LANG_LABELS, BOOKING_LANG_FLAGS, getBookingTranslations } from '@/modules/bookings/ui/translations';


// API base URL — configurable for subdomain deployment
const API_BASE = process.env.NEXT_PUBLIC_PMS_API_URL || '';

// ─── Types ────────────────────────────────────────────
interface UnitResult {
  id: string;
  name: string;
  code: string;
  beds: number;
  unitTypeId: string;
  typeName: string;
  typeCode: string;
  description: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  baseOccupancy: number;
  bedsSingle: number;
  bedsDouble: number;
  bedsSofa: number;
  hasPricing: boolean;
  avgPricePerNight: number;
  totalPrice: number;
  breakdown: { date: string; dayName: string; price: number; isWeekend: boolean }[];
  currency: string;
  extraPersonCharge: number;
  petAllowed: boolean;
  petCharge: number;
  amenities: { icon: string; name: string }[];
}

interface AvailabilityResponse {
  checkIn: string;
  checkOut: string;
  nights: number;
  units: UnitResult[];
  offerDiscount: { name: string; discountType: string; offerAmount: number } | null;
  certificate: { code: string; amount: number } | null;
}

interface ReserveResponse {
  success: boolean;
  reservationId: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPrice: number;
  originalPrice: number;
  offerDiscount: number;
  certificateDiscount: number;
  currency: string;
}

// ─── Helpers ──────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function formatDisplayDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { day: 'numeric', month: 'short' });
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('cs-CZ').format(n);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

// ─── Step labels ──────────────────────────────────────
const STEPS = [1, 2, 3, 4, 5] as const;

// ─── Main Component ──────────────────────────────────
export default function BookingPage() {
  // ─── State ──────
  const [lang, setLang] = useState<BookingLang>('uk');
  const t = useMemo(() => getBookingTranslations(lang), [lang]);

  // Language dropdown
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [step, setStep] = useState(1);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  // Calendar navigation
  const [today] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [calMonthOffset, setCalMonthOffset] = useState(0);

  // Coupon / Certificate
  const [promoInput, setPromoInput] = useState('');
  const [certInput, setCertInput] = useState('');
  const [offerApplied, setOfferApplied] = useState('');
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Step 2 — Availability + Cart
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);

  // Pre-select unit from query param
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const uId = params.get('unitId');
      if (uId) setSelectedUnit(uId);
    }
  }, []);
  const [cardAdults, setCardAdults] = useState(2);
  const [cardChildren, setCardChildren] = useState(0);
  const [cardHasPet, setCardHasPet] = useState(false);

  // Step 3 — Guest info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 4 — Services
  const [saunaDate, setSaunaDate] = useState<string | null>(null);
  const [saunaStartHour, setSaunaStartHour] = useState(14);
  const [saunaHours, setSaunaHours] = useState(2);
  const [saunaBroom, setSaunaBroom] = useState(0);
  const [saunaAdded, setSaunaAdded] = useState(false);
  const [breakfastItems, setBreakfastItems] = useState<Record<string, number>>({});
  const [breakfastAdded, setBreakfastAdded] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [showSaunaPopup, setShowSaunaPopup] = useState(false);
  const [saunaPrice, setSaunaPrice] = useState(600);
  const [broomPrice, setBroomPrice] = useState(300);
  const [bookedSlots, setBookedSlots] = useState<any[]>([]);
  // Tub (Чан)
  const [showTubPopup, setShowTubPopup] = useState(false);
  const [tubDate, setTubDate] = useState<string | null>(null);
  const [tubStartHour, setTubStartHour] = useState(14);
  const [tubHours, setTubHours] = useState(2);
  const [tubAdded, setTubAdded] = useState(false);
  const [tubPrice, setTubPrice] = useState(600);
  const [tubBookedSlots, setTubBookedSlots] = useState<any[]>([]);
  // Late checkout / Early checkin
  const [lateCheckout, setLateCheckout] = useState(false);
  const [earlyCheckin, setEarlyCheckin] = useState(false);
  const [lateCheckoutPrice, setLateCheckoutPrice] = useState(500);
  const [earlyCheckinPrice, setEarlyCheckinPrice] = useState(500);

  // Step 5 — Success
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);
  const [redirectingToPayment, setRedirectingToPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | null>(null);
  const [purchasedServices, setPurchasedServices] = useState<any[]>([]);

  // Widget mode: siteId injected by BookingWidget wrapper
  const siteId = typeof window !== 'undefined' ? (window as any).__BOOKING_SITE_ID__ || '' : '';
  const widgetSlug = typeof window !== 'undefined' ? (window as any).__BOOKING_SITE_SLUG__ || '' : '';
  const thankYouUrl = typeof window !== 'undefined' ? (window as any).__BOOKING_THANK_YOU_URL__ || '' : '';
  const isWidget = !!siteId;

  // Whether step 4 has any services to show
  const [hasServices, setHasServices] = useState(true); // default true until checked

  // Calendar: booked days from Hostex (fetched per visible months)
  const [bookedDays, setBookedDays] = useState<Set<string>>(new Set());


  // Handle return from Teya payment (room or services checkout)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const successId = params.get('success');
    const pStatus = params.get('payment_status');
    const kind = (params.get('payment_kind') || 'room') as 'room' | 'services';

    const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname);

    if (!successId || (pStatus !== 'success' && pStatus !== 'cancel')) return;

    (async () => {
      let ctxSrv: any = null;
      try {
        const r = await fetch(`${API_BASE}/api/booking/reservation?id=${encodeURIComponent(successId)}`);
        if (r.ok) ctxSrv = await r.json();
      } catch { /* ignore */ }

      let ctxCache: any = null;
      try {
        const saved = sessionStorage.getItem('booking-return-ctx');
        if (saved) ctxCache = JSON.parse(saved);
      } catch { /* ignore */ }

      const resSrv = ctxSrv?.reservation;
      setReservation({
        success: true,
        reservationId: successId,
        unitName: resSrv?.unit_name || ctxCache?.unitName || '',
        checkIn: resSrv?.check_in || ctxCache?.checkIn || '',
        checkOut: resSrv?.check_out || ctxCache?.checkOut || '',
        nights: resSrv?.nights || ctxCache?.nights || 0,
        totalPrice: resSrv?.total_price || ctxCache?.totalPrice || 0,
        originalPrice: resSrv?.total_price || ctxCache?.totalPrice || 0,
        offerDiscount: 0,
        certificateDiscount: 0,
        currency: 'CZK',
      });

      const ci = resSrv?.check_in || ctxCache?.checkIn;
      const co = resSrv?.check_out || ctxCache?.checkOut;
      if (ci) setCheckIn(ci);
      if (co) setCheckOut(co);

      if (Array.isArray(ctxSrv?.services)) setPurchasedServices(ctxSrv.services);

      if (pStatus === 'success') {
        setPaymentStatus('success');
        // Fire purchase pixel event
        window.dispatchEvent(new CustomEvent('bk:purchase', {
          detail: {
            reservationId: successId,
            value: ctxSrv?.reservation?.total_price || ctxCache?.totalPrice || 0,
            currency: 'CZK',
            kind,
          }
        }));
        // Step 6 = success screen (after payment confirmed)
        setStep(6);
        // If thank_you_url is set — redirect parent after short delay
        const tyUrl = (window as any).__BOOKING_THANK_YOU_URL__;
        if (tyUrl) {
          setTimeout(() => {
            try { window.parent.location.href = tyUrl; } catch { window.location.href = tyUrl; }
          }, 3000);
        }
      } else {
        setPaymentStatus('failed');
        setStep(5); // back to payment step
      }
      cleanUrl();

    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile summary
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ─── Fetch booked dates for calendar ──────
  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const months = [
          new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1),
          new Date(today.getFullYear(), today.getMonth() + calMonthOffset + 1, 1),
        ].map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);

        const booked = new Set<string>();
        const currentSiteId = typeof window !== 'undefined' ? (window as any).__BOOKING_SITE_ID__ || '' : '';

        await Promise.all(months.map(async (month) => {
          const params = new URLSearchParams({ month });
          if (currentSiteId) params.set('siteId', currentSiteId);
          const res = await fetch(`${API_BASE}/api/widget/calendar?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            for (const day of data.days || []) {
              if (day.status === 'booked') booked.add(day.date);
            }
          }
        }));

        setBookedDays(booked);
      } catch { /* silent — calendar is decorative, doesn't break booking */ }
    };
    fetchCalendar();
  }, [calMonthOffset, today]);


  // ─── Derived ──────
  const calMonths = useMemo(() => {
    const m1 = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1);
    const m2 = new Date(today.getFullYear(), today.getMonth() + calMonthOffset + 1, 1);
    return [
      { year: m1.getFullYear(), month: m1.getMonth() },
      { year: m2.getFullYear(), month: m2.getMonth() },
    ];
  }, [today, calMonthOffset]);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / 86400000);
  }, [checkIn, checkOut]);

  const selectedUnitData = useMemo(() => {
    if (!availability || !selectedUnit) return null;
    return availability.units.find(u => u.id === selectedUnit) || null;
  }, [availability, selectedUnit]);

  // Service totals
  const saunaTotal = useMemo(() => {
    if (!saunaAdded) return 0;
    return saunaPrice * saunaHours + broomPrice * saunaBroom;
  }, [saunaAdded, saunaPrice, saunaHours, broomPrice, saunaBroom]);

  const breakfastTotal = useMemo(() => {
    if (!breakfastAdded) return 0;
    return menuItems.reduce((sum, item) => sum + (item.price || 0) * (breakfastItems[item.id] || 0), 0);
  }, [breakfastAdded, menuItems, breakfastItems]);

  const tubTotal = useMemo(() => {
    if (!tubAdded) return 0;
    return tubPrice * tubHours;
  }, [tubAdded, tubPrice, tubHours]);

  const toggleServicesTotal = useMemo(() => {
    return (lateCheckout ? lateCheckoutPrice : 0) + (earlyCheckin ? earlyCheckinPrice : 0);
  }, [lateCheckout, lateCheckoutPrice, earlyCheckin, earlyCheckinPrice]);

  // Extra person charge: if adults > baseOccupancy, charge per extra person per night
  const extraPersonTotal = useMemo(() => {
    if (!selectedUnitData) return 0;
    const extraGuests = Math.max(0, cardAdults - selectedUnitData.baseOccupancy);
    return extraGuests * (selectedUnitData.extraPersonCharge || 0) * nights;
  }, [selectedUnitData, cardAdults, nights]);

  const petTotal = useMemo(() => {
    if (!selectedUnitData || !cardHasPet) return 0;
    return selectedUnitData.petCharge || 0;
  }, [selectedUnitData, cardHasPet]);

  const servicesTotal = useMemo(() => saunaTotal + breakfastTotal + tubTotal + toggleServicesTotal, [saunaTotal, breakfastTotal, tubTotal, toggleServicesTotal]);

  const totalWithDiscount = useMemo(() => {
    if (!selectedUnitData) return 0;
    let total = selectedUnitData.totalPrice + extraPersonTotal + petTotal;
    if (availability?.offerDiscount) {
      const pd = availability.offerDiscount;
      if (pd.discountType === 'percentage') {
        total -= Math.round(total * pd.offerAmount / 100);
      } else {
        total -= pd.offerAmount;
      }
    }
    if (availability?.certificate?.amount) {
      total -= availability.certificate.amount;
    }
    total += servicesTotal;
    return Math.max(0, total);
  }, [selectedUnitData, availability, servicesTotal, extraPersonTotal, petTotal]);

  const stepLabels = useMemo(() => [t.step1, t.step2, t.step3, t.step4, t.step5], [t]);

  // ─── Calendar Day Click ──────
  const handleDayClick = useCallback((dateStr: string) => {
    const clickedDate = parseDate(dateStr);
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    if (clickedDate < todayStart) return;

    if (!checkIn || (checkIn && checkOut) || !selectingCheckOut) {
      setCheckIn(dateStr);
      setCheckOut(null);
      setSelectingCheckOut(true);
      setAvailability(null);
      setSelectedUnit(null);
    } else {
      if (clickedDate <= parseDate(checkIn!)) {
        setCheckIn(dateStr);
        setCheckOut(null);
      } else {
        setCheckOut(dateStr);
        setSelectingCheckOut(false);
      }
    }
  }, [checkIn, checkOut, selectingCheckOut, today]);

  // ─── Check Availability ──────
  const fetchAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setLoadingAvail(true);
    setError(null);
    try {
      const params = new URLSearchParams({ checkIn, checkOut });
      if (offerApplied) params.set('couponCode', offerApplied);
      if (certInput) params.set('certificateCode', certInput);
      const res = await fetch(`${API_BASE}/api/booking/availability?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setAvailability(data);
    } catch {
      setError(t.errorOccurred);
    }
    setLoadingAvail(false);
  }, [checkIn, checkOut, offerApplied, certInput, t]);

  // ─── Apply Coupon ──────
  const applyCoupon = useCallback(async () => {
    if (!promoInput.trim()) return;
    setOfferApplied(promoInput.trim());
    setPromoMessage({ type: 'success', text: t.offerApplied });
  }, [promoInput, t]);

  // ─── Navigation ──────
  const goToStep = useCallback((targetStep: number) => {
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToStep2 = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    await fetchAvailability();
    goToStep(2);
  }, [checkIn, checkOut, fetchAvailability, goToStep]);

  const goToStep3 = useCallback(() => {
    if (!selectedUnit) return;
    goToStep(3);
  }, [selectedUnit, goToStep]);

  const fetchServices = useCallback(async (ciParam?: string, coParam?: string) => {
    const ci = ciParam || checkIn;
    const co = coParam || checkOut;
    if (!ci || !co) return;
    setServicesLoading(true);
    try {
      // If widget mode with siteId — load site_services list first to check if any exist
      const currentSiteId = (window as any).__BOOKING_SITE_ID__ || '';
      if (currentSiteId) {
        const listRes = await fetch(`${API_BASE}/api/booking/services?siteId=${encodeURIComponent(currentSiteId)}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          const has = listData.hasServices === true && listData.services?.length > 0;
          setHasServices(has);
          (window as any).__BOOKING_HAS_SERVICES__ = has;
          if (!has) {
            setServicesLoading(false);
            return; // skip loading individual services — step 4 will be skipped
          }
        }
      } else {
        // Desktop mode: always has services
        (window as any).__BOOKING_HAS_SERVICES__ = true;
      }


      const siteParam = (window as any).__BOOKING_SITE_ID__ ? `&siteId=${encodeURIComponent((window as any).__BOOKING_SITE_ID__)}` : '';
      // Fetch breakfast menu items
      const bRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_breakfast&checkIn=${ci}&checkOut=${co}${siteParam}`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setMenuItems(bData.menuItems || []);
      }
      // Fetch sauna details + booked slots
      const sRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_sauna&checkIn=${ci}&checkOut=${co}${siteParam}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSaunaPrice(sData.price || 600);
        setBookedSlots(sData.bookedSlots || []);
        if (sData.addons?.length) {
          setBroomPrice(sData.addons[0]?.price || 300);
        }
      }
      // Fetch tub details + booked slots
      const tRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_tub&checkIn=${ci}&checkOut=${co}${siteParam}`);
      if (tRes.ok) {
        const tData = await tRes.json();
        setTubPrice(tData.price || 600);
        setTubBookedSlots(tData.bookedSlots || []);
      }
      // Fetch late checkout price
      const lcRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_late_checkout&checkIn=${ci}&checkOut=${co}${siteParam}`);
      if (lcRes.ok) {
        const lcData = await lcRes.json();
        setLateCheckoutPrice(lcData.price || 500);
      }
      const ecRes = await fetch(`${API_BASE}/api/booking/services?serviceId=svc_early_checkin&checkIn=${ci}&checkOut=${co}${siteParam}`);
      if (ecRes.ok) {
        const ecData = await ecRes.json();
        setEarlyCheckinPrice(ecData.price || 500);
      }
    } catch { /* silent */ }
    setServicesLoading(false);
    if (ci && !saunaDate) setSaunaDate(ci);
    if (ci && !tubDate) setTubDate(ci);
  }, [checkIn, checkOut, saunaDate, tubDate, siteId]);

  // ─── Submit Booking (Step 3: create reservation, then go to services or payment step) ──────
  const submitBooking = useCallback(async () => {
    if (!checkIn || !checkOut || !selectedUnit || !firstName || !lastName || !phone) return;
    setSubmitting(true);
    setError(null);
    try {
      const currentSiteId = siteId || '';
      
      const params = new URLSearchParams(window.location.search);
      const utmParams: Record<string, string> = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ttclid'].forEach(key => {
        const val = params.get(key);
        if (val) utmParams[key] = val;
      });
      const widgetSessionId = params.get('widget_session_id') || (typeof window !== 'undefined' ? window.sessionStorage.getItem('alisio_sid') : undefined);

      const res = await fetch(`${API_BASE}/api/booking/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: selectedUnit,
          checkIn,
          checkOut,
          adults: cardAdults,
          children: cardChildren,
          hasPet: cardHasPet,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          couponCode: offerApplied || undefined,
          certificateCode: certInput || undefined,
          siteId: currentSiteId || undefined,
          utmParams,
          lang,
          widgetSessionId: widgetSessionId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json() as ReserveResponse;
      setReservation(data);

      try {
        sessionStorage.setItem('booking-return-ctx', JSON.stringify({
          reservationId: data.reservationId,
          unitName: data.unitName,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          nights: data.nights,
          totalPrice: data.totalPrice,
        }));
      } catch { /* private mode — ok */ }

      // Load services and decide: go to step 4 if site has services, else skip to 5
      await fetchServices(data.checkIn, data.checkOut);
      // hasServices state is updated inside fetchServices
      // Use a short delay so state flush completes
      setStep(prev => {
        // hasServices may still be stale — read from window global set by fetchServices
        const skip = (window as any).__BOOKING_SITE_ID__ && !(window as any).__BOOKING_HAS_SERVICES__;
        return skip ? 5 : 4;
      });
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
    }
    setSubmitting(false);
  }, [checkIn, checkOut, selectedUnit, cardAdults, cardChildren, cardHasPet, firstName, lastName, email, phone, offerApplied, certInput, t, fetchServices]);

  // ─── Submit Payment (Step 5: create Teya checkout) ──────
  const submitPayment = useCallback(async () => {
    const resId = reservation?.reservationId;
    if (!resId) return;
    setRedirectingToPayment(true);
    setError(null);
    try {
      const currentSlug = (window as any).__BOOKING_SITE_SLUG__ || '';
      const currentSiteId = (window as any).__BOOKING_SITE_ID__ || '';
      const returnBase = currentSlug ? `/w/${currentSlug}` : '/booking';
      const returnPath = `${returnBase}?success=${resId}&payment_kind=room`;

      const payRes = await fetch(`${API_BASE}/api/booking/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: reservation?.totalPrice ?? 0,
          currency: 'CZK',
          description: `Booking ${resId} — ${reservation?.unitName}`,
          reservation_id: resId,
          site_id: currentSiteId || undefined,
          return_path: returnPath,
        }),
      });
      if (payRes.ok) {
        const payData = await payRes.json();
        if (payData.session_url) {
          window.dispatchEvent(new CustomEvent('bk:navigate', { detail: { to: 'payment' } }));
          window.location.href = payData.session_url;
          return;
        }
      }
      throw new Error('Payment session creation failed');
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
      setRedirectingToPayment(false);
    }
  }, [reservation, t]);

  // ─── Submit Services (Step 4: write services + second Teya checkout) ──────

  const submitServices = useCallback(async () => {
    const resId = reservation?.reservationId;
    if (!resId) return;
    const nothingPicked = !saunaAdded && !tubAdded && !breakfastAdded && !lateCheckout && !earlyCheckin;
    if (nothingPicked) { setStep(5); return; }

    setSubmitting(true);
    setError(null);
    try {
      const post = (body: any) => fetch(`${API_BASE}/api/booking/services`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (saunaAdded && saunaDate) {
        try {
          await post({
            action: 'book-slots', serviceId: 'svc_sauna',
            date: saunaDate, startHour: saunaStartHour, hours: saunaHours,
            persons: cardAdults, reservationId: resId,
            addons: saunaBroom > 0 ? [{ id: 'addon_broom', quantity: saunaBroom }] : [],
          });
        } catch { /* non-fatal */ }
      }
      if (tubAdded && tubDate) {
        try {
          await post({
            action: 'book-slots', serviceId: 'svc_tub',
            date: tubDate, startHour: tubStartHour, hours: tubHours,
            persons: cardAdults, reservationId: resId,
          });
        } catch { /* non-fatal */ }
      }
      if (breakfastAdded) {
        const items = Object.entries(breakfastItems)
          .filter(([, qty]) => qty > 0)
          .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
        if (items.length > 0) {
          try {
            await post({
              action: 'book-breakfast', reservationId: resId,
              items,
              // Breakfast is served the morning AFTER check-in (guest arrives afternoon)
              serviceDate: (() => {
                const d = new Date(checkIn + 'T00:00:00');
                d.setDate(d.getDate() + 1);
                return d.toISOString().split('T')[0];
              })(),
            });
          } catch { /* non-fatal */ }
        }
      }
      if (lateCheckout) {
        try { await post({ action: 'book-toggle', serviceId: 'svc_late_checkout', reservationId: resId }); } catch { /* */ }
      }
      if (earlyCheckin) {
        try { await post({ action: 'book-toggle', serviceId: 'svc_early_checkin', reservationId: resId }); } catch { /* */ }
      }

      // All services written — go to payment step (step 5 shows breakdown + Pay button)
      goToStep(5);
    } catch (e: any) {
      setError(e?.message || t.errorOccurred);
    }
    setSubmitting(false);
  }, [reservation, saunaAdded, saunaDate, saunaStartHour, saunaHours, saunaBroom, tubAdded, tubDate, tubStartHour, tubHours, breakfastAdded, breakfastItems, lateCheckout, earlyCheckin, cardAdults, checkIn, t, goToStep]);


  // ─── Reset ──────
  const resetForm = useCallback(() => {
    setStep(1);
    setCheckIn(null);
    setCheckOut(null);
    setSelectingCheckOut(false);
    setAdults(2);
    setChildren(0);
    setPromoInput('');
    setCertInput('');
    setOfferApplied('');
    setPromoMessage(null);
    setAvailability(null);
    setSelectedUnit(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setReservation(null);
    setError(null);
    setCalMonthOffset(0);
    setPurchasedServices([]);
    try { sessionStorage.removeItem('booking-return-ctx'); } catch { /* */ }
    // Service state
    setSaunaDate(null);
    setSaunaStartHour(14);
    setSaunaHours(2);
    setSaunaBroom(0);
    setSaunaAdded(false);
    setBreakfastItems({});
    setBreakfastAdded(false);
    setMenuItems([]);
    // Payment state
    setRedirectingToPayment(false);
    setPaymentStatus(null);
  }, []);

  // ─── Render Calendar Month ──────
  const renderMonth = (year: number, month: number) => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const todayStr = fmtDate(today);

    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`e-${i}`} className="booking-cal-day empty" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateObj = parseDate(dateStr);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const isPast = dateObj < todayStart;
      const isToday = dateStr === todayStr;

      let rangeClass = '';
      if (checkIn && dateStr === checkIn) rangeClass = 'range-start';
      if (checkOut && dateStr === checkOut) rangeClass += ' range-end';
      if (checkIn && checkOut && dateStr > checkIn && dateStr < checkOut) rangeClass = 'in-range';

      const isBooked = bookedDays.has(dateStr);

      cells.push(
        <button
          key={d}
          className={`booking-cal-day ${isPast ? 'past' : ''} ${isBooked ? 'booked' : ''} ${isToday && !isBooked ? 'today' : ''} ${rangeClass}`}
          onClick={() => !isPast && !isBooked && handleDayClick(dateStr)}
          disabled={isPast || isBooked}
          type="button"
        >
          {d}
        </button>
      );
    }

    return cells;
  };

  // ─── Sidebar Content (reused for desktop & mobile) ──────
  const renderSidebarContent = () => (
    <>
      {/* Choice Summary */}
      <div className="booking-sidebar-card">
        <div className="booking-sidebar-title">{t.yourChoice}</div>

        {checkIn && checkOut ? (
          <div className="booking-sidebar-dates">
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkIn}</div>
              <div className="booking-sidebar-value">{formatDisplayDate(checkIn, lang)}</div>
            </div>
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkOut}</div>
              <div className="booking-sidebar-value">{formatDisplayDate(checkOut, lang)}</div>
            </div>
          </div>
        ) : (
          <div className="booking-sidebar-dates">
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkIn}</div>
              <div className="booking-sidebar-value" style={{ color: 'var(--bk-text-muted)' }}>—</div>
            </div>
            <div className="booking-sidebar-date-col">
              <div className="booking-sidebar-label">{t.checkOut}</div>
              <div className="booking-sidebar-value" style={{ color: 'var(--bk-text-muted)' }}>—</div>
            </div>
          </div>
        )}

        <div className="booking-sidebar-location">
          <span className="booking-sidebar-location-icon">🏕️</span>
          QA Glamping
        </div>
      </div>

      {/* House Summary */}
      <div className="booking-sidebar-card">
        <div className="booking-sidebar-unit-title">
          <span>{t.yourHouse}</span>
          {selectedUnitData && (
            <button
              className="booking-sidebar-unit-delete"
              onClick={() => setSelectedUnit(null)}
              type="button"
            >
              🗑
            </button>
          )}
        </div>

        {selectedUnitData ? (
          <>
            <div className="booking-sidebar-unit-info">
              <div className="booking-sidebar-unit-thumb">🏕️</div>
              <div className="booking-sidebar-unit-details">
                <div className="booking-sidebar-unit-name">{selectedUnitData.name}</div>
                <div className="booking-sidebar-unit-meta">
                  👥 {selectedUnitData.baseOccupancy} {t.guests} · 🏕️ QA Glamping
                </div>
              </div>
              <div className="booking-sidebar-unit-price-label">
                {formatPrice(selectedUnitData.totalPrice)} Kč
              </div>
            </div>

            <div className="booking-sidebar-guests">
              👥 {adults} {t.adults.toLowerCase()}{children > 0 ? `, ${children} ${t.children.toLowerCase()}` : ''}
              {cardHasPet && ' · 🐾'}
            </div>

            {/* Extra person charge */}
            {extraPersonTotal > 0 && (
              <div style={{ padding: '6px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>+{adults - selectedUnitData.baseOccupancy} {t.extraPersonCharge}</span>
                <strong>+{formatPrice(extraPersonTotal)} Kč</strong>
              </div>
            )}

            {/* Pet charge */}
            {petTotal > 0 && (
              <div style={{ padding: '6px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>🐾 {t.petCheckbox}</span>
                <strong>+{formatPrice(petTotal)} Kč</strong>
              </div>
            )}

            {/* Services in sidebar */}
            {saunaAdded && (
              <div style={{ padding: '8px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>🧖 {t.saunaTitle}</div>
                <div style={{ color: 'var(--bk-text-muted)' }}>
                  {saunaDate && formatShortDate(saunaDate, lang)} · {String(saunaStartHour).padStart(2, '0')}:00–{String(saunaStartHour + saunaHours).padStart(2, '0')}:00
                </div>
                <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatPrice(saunaTotal)} Kč</div>
              </div>
            )}
            {tubAdded && (
              <div style={{ padding: '8px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>🛁 {t.tubTitle}</div>
                <div style={{ color: 'var(--bk-text-muted)' }}>
                  {tubDate && formatShortDate(tubDate, lang)} · {String(tubStartHour).padStart(2, '0')}:00–{String(tubStartHour + tubHours).padStart(2, '0')}:00
                </div>
                <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatPrice(tubTotal)} Kč</div>
              </div>
            )}
            {breakfastAdded && breakfastTotal > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>🍳 {t.breakfastTitle}</div>
                <div style={{ fontWeight: 600, textAlign: 'right' }}>{formatPrice(breakfastTotal)} Kč</div>
              </div>
            )}
            {lateCheckout && (
              <div style={{ padding: '6px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>🕐 {t.lateCheckoutTitle}</span>
                <strong>{formatPrice(lateCheckoutPrice)} Kč</strong>
              </div>
            )}
            {earlyCheckin && (
              <div style={{ padding: '6px 12px', background: 'var(--bk-bg)', borderRadius: 'var(--bk-radius-xs)', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>🕛 {t.earlyCheckinTitle}</span>
                <strong>{formatPrice(earlyCheckinPrice)} Kč</strong>
              </div>
            )}

            <div className="booking-sidebar-total-row">
              <div className="booking-sidebar-total-details">
                {nights} {t.nightsWord(nights)}, {adults} {t.adults.toLowerCase()}
                {servicesTotal > 0 && ` + ${t.additionalServices.toLowerCase()}`}
              </div>
              <div className="booking-sidebar-total-amount">
                <span className="booking-sidebar-total-currency">Kč</span>
                {formatPrice(totalWithDiscount)}
              </div>
              <div className="booking-sidebar-total-note">{t.including}</div>
            </div>
          </>
        ) : (
          <div className="booking-sidebar-placeholder">
            <span className="booking-sidebar-placeholder-icon">ⓘ</span>
            {t.housePlaceholder}
          </div>
        )}
      </div>
    </>
  );

  // ─── Render ──────
  return (
    <div className={`booking-page ${isWidget ? 'is-widget' : ''}`}>
      {/* ═══ Header ═══ */}
      {!isWidget && (
        <header className="booking-header">
          <div className="booking-logo">
            <div className="booking-logo-icon">Q</div>
            <span>{t.brandName}</span>
          </div>
          <div className="booking-header-right">
            <div className="booking-social-links">
              <a className="booking-social-link" href="#" aria-label="Instagram">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
              </a>
              <a className="booking-social-link" href="#" aria-label="Telegram">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
              </a>
              <a className="booking-social-link" href="#" aria-label="Facebook">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" /></svg>
              </a>
            </div>
            <div className="booking-lang-dropdown" ref={langRef}>
              <button
                className="booking-lang-trigger"
                onClick={() => setLangOpen(o => !o)}
                type="button"
              >
                <span className="booking-lang-flag">{BOOKING_LANG_FLAGS[lang]}</span>
                <span className="booking-lang-code">{lang.toUpperCase()}</span>
                <span className="booking-lang-chevron">{langOpen ? '▲' : '▼'}</span>
              </button>
              {langOpen && (
                <div className="booking-lang-menu">
                  {(Object.keys(BOOKING_LANG_LABELS) as BookingLang[]).map(l => (
                    <button
                      key={l}
                      className={`booking-lang-option ${lang === l ? 'active' : ''}`}
                      onClick={() => { setLang(l); setLangOpen(false); }}
                      type="button"
                    >
                      <span className="booking-lang-flag">{BOOKING_LANG_FLAGS[l]}</span>
                      <span>{BOOKING_LANG_LABELS[l]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* ═══ Stepper ═══ */}
      {step < 6 && (
        <div className="booking-stepper">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`booking-step-item ${step === s ? 'active' : ''} ${step > s ? 'completed' : ''}`}
            >
              {i > 0 && <div className={`booking-step-line ${step > s ? 'completed' : ''}`} />}
              <div className="booking-step-circle">
                {step > s ? '✓' : s}
              </div>
              <div
                className="booking-step-label"
                onClick={() => step > s && goToStep(s)}
              >
                {stepLabels[i]}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Main Layout ═══ */}
      <div className="booking-layout">
        {/* ─── Left Sidebar (visible on desktop only) ─── */}
        {step < 6 && (
          <aside className="booking-sidebar">
            {renderSidebarContent()}
          </aside>
        )}

        {/* ─── Center Content ─── */}
        <main className="booking-main">
          {/* Mobile Cart Toggle */}
          {step < 6 && step > 1 && (
            <button
              className="booking-mobile-summary-toggle"
              onClick={() => setMobileCartOpen(true)}
              type="button"
            >
              <span>{t.bookingDetails}</span>
              <span>{selectedUnitData ? `${formatPrice(totalWithDiscount)} Kč` : '—'}</span>
            </button>
          )}

          {/* ═══════ STEP 1: Your Choice (Dates) ═══════ */}
          {step === 1 && (
            <div className="booking-fade-in">
              <div className="booking-content-card">
                {/* Date Summary Bar */}
                <div className="booking-field" style={{ marginBottom: 16 }}>
                  <label className="booking-field-label">{t.dates} <span className="booking-field-required">*</span></label>
                  <div className="booking-dates-bar">
                    <div className={`booking-dates-bar-item ${!checkIn && !selectingCheckOut ? 'active' : ''}`}>
                      <div className="booking-dates-bar-label">{t.checkIn}</div>
                      <div className={`booking-dates-bar-value ${!checkIn ? 'placeholder' : ''}`}>
                        {checkIn ? formatDisplayDate(checkIn, lang) : t.selectCheckIn}
                      </div>
                    </div>
                    <div className={`booking-dates-bar-item ${checkIn && selectingCheckOut ? 'active' : ''}`}>
                      <div className="booking-dates-bar-label">{t.checkOut}</div>
                      <div className={`booking-dates-bar-value ${!checkOut ? 'placeholder' : ''}`}>
                        {checkOut ? formatDisplayDate(checkOut, lang) : t.selectCheckOut}
                      </div>
                    </div>
                    {nights > 0 && (
                      <div className="booking-duration-badge">
                        <div>
                          <div className="booking-duration-badge-label">{t.duration}</div>
                          <div style={{ fontWeight: 600 }}>{nights} {t.nightsWord(nights)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Calendar Navigation */}
                <div className="booking-cal-nav">
                  <button
                    className="booking-cal-nav-btn"
                    onClick={() => setCalMonthOffset(o => Math.max(0, o - 1))}
                    disabled={calMonthOffset === 0}
                    type="button"
                  >
                    ‹
                  </button>
                  <div className="booking-cal-months-label">
                    <span>{t.monthNames[calMonths[0].month]} {calMonths[0].year}</span>
                    <span>{t.monthNames[calMonths[1].month]} {calMonths[1].year}</span>
                  </div>
                  <button
                    className="booking-cal-nav-btn"
                    onClick={() => setCalMonthOffset(o => o + 1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>

                {/* Calendar */}
                <div className="booking-calendars">
                  {calMonths.map(({ year, month }) => (
                    <div key={`${year}-${month}`} className="booking-cal-month">
                      <div className="booking-cal-weekdays">
                        {[1, 2, 3, 4, 5, 6, 0].map(d => (
                          <div key={d} className={`booking-cal-weekday ${d === 0 || d === 6 ? 'weekend' : ''}`}>
                            {t.dayNamesShort[d]}
                          </div>
                        ))}
                      </div>
                      <div className="booking-cal-grid">
                        {renderMonth(year, month)}
                      </div>
                    </div>
                  ))}
                </div>



                {/* Coupon & Certificate */}
                <div className="booking-codes-row">
                  <div className="booking-code-input-group">
                    <input
                      className="booking-code-input"
                      placeholder={t.couponCode}
                      value={promoInput}
                      onChange={e => { setPromoInput(e.target.value); setPromoMessage(null); }}
                    />
                    <button className="booking-code-btn" onClick={applyCoupon} type="button">{t.apply}</button>
                  </div>
                  <div className="booking-code-input-group">
                    <input
                      className="booking-code-input"
                      placeholder={t.certificateCode}
                      value={certInput}
                      onChange={e => setCertInput(e.target.value)}
                    />
                    <button className="booking-code-btn" onClick={() => { }} type="button">{t.apply}</button>
                  </div>
                </div>

                {promoMessage && (
                  <div className={`booking-alert ${promoMessage.type}`} style={{ marginTop: 12 }}>
                    <span className="booking-alert-icon">{promoMessage.type === 'success' ? '✓' : '✗'}</span>
                    {promoMessage.text}
                  </div>
                )}
              </div>

              {/* Nav Bar (sticky on mobile) */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" disabled type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep2}
                  disabled={!checkIn || !checkOut || nights < 1}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>
            </div>
          )}

          {/* ═══════ STEP 2: House Selection ═══════ */}
          {step === 2 && (
            <div className="booking-fade-in">
              {/* Multi-house info tooltip */}
              <div className="booking-multi-house-info">
                <span className="booking-multi-house-info-icon">ℹ</span>
                {t.multiHouseInfo}
              </div>

              {loadingAvail ? (
                <div className="booking-loading">
                  <div className="booking-spinner" />
                </div>
              ) : availability && availability.units.length > 0 ? (
                <div>
                  {availability.units.map(unit => {
                    const isExpanded = expandedUnit === unit.id;
                    const isSelected = selectedUnit === unit.id;
                    const extraGuests = Math.max(0, cardAdults - unit.baseOccupancy);
                    const dynamicExtra = extraGuests * (unit.extraPersonCharge || 0) * nights;
                    const dynamicPet = cardHasPet ? (unit.petCharge || 0) : 0;
                    const dynamicTotal = unit.totalPrice + dynamicExtra + dynamicPet;

                    // Generate adult options for dropdown
                    const adultOptions = [];
                    for (let i = 1; i <= unit.maxAdults; i++) {
                      const extra = Math.max(0, i - unit.baseOccupancy);
                      const label = extra > 0
                        ? `${i} ${t.adultsCount} +${formatPrice(extra * (unit.extraPersonCharge || 0))} Kč`
                        : `${i} ${t.adultsCount}`;
                      adultOptions.push({ value: i, label });
                    }

                    return (
                      <div
                        key={unit.id}
                        className={`booking-house-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                      >
                        {/* Photo */}
                        <div className="booking-house-photo-container">
                          <div className="booking-house-photo-placeholder">🏕️</div>
                        </div>

                        {/* Info — collapsed view */}
                        <div className="booking-house-info">
                          <div className="booking-house-name">{unit.name}</div>
                          <div className="booking-house-specs">
                            <div className="booking-house-spec">
                              <span className="booking-house-spec-icon">👥</span>
                              {t.totalFor} {unit.baseOccupancy} {t.guests} (+{unit.maxAdults - unit.baseOccupancy})
                            </div>
                            <div className="booking-house-spec">
                              <span className="booking-house-spec-icon">🏕️</span>
                              QA Glamping
                            </div>
                          </div>

                          {/* Description text like ULIS */}
                          {unit.description && (
                            <p className="booking-house-desc">{unit.description}</p>
                          )}

                          {/* Pet-friendly note on card */}
                          {unit.petAllowed && (
                            <div className="booking-house-pet-note">
                              <span>{t.petFriendly}</span>
                              <span className="booking-house-pet-note-sub">{t.petFriendlyDesc} — {formatPrice(unit.petCharge)} Kč</span>
                            </div>
                          )}

                          <div className="booking-house-pricing">
                            {!unit.hasPricing && (
                              <div className="booking-house-stub-badge">⚠ {t.stubPricing}</div>
                            )}
                            {!isExpanded && (
                              <>
                                <div className="booking-house-price">
                                  <span className="booking-house-price-currency">Kč</span>
                                  <span className="booking-house-price-amount">{formatPrice(unit.totalPrice)}</span>
                                </div>
                                {!isSelected ? (
                                  <button
                                    className="booking-house-add-btn"
                                    onClick={() => {
                                      setExpandedUnit(unit.id);
                                      setCardAdults(unit.baseOccupancy);
                                      setCardChildren(0);
                                      setCardHasPet(false);
                                    }}
                                    type="button"
                                  >
                                    {`${t.addHouse} +`}
                                  </button>
                                ) : (
                                  <button className="booking-house-add-btn selected" type="button" disabled>
                                    ✓ {t.selectedHouse}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* ─── Expanded details (ULIS-style) ─── */}
                        {isExpanded && (
                          <div className="booking-house-expanded">
                            {/* Amenities */}
                            {unit.amenities && unit.amenities.length > 0 && (
                              <div className="booking-house-amenities">
                                <div className="booking-house-section-title">{t.amenitiesTitle}</div>
                                <div className="booking-house-amenities-grid">
                                  {unit.amenities.map((a: { icon: string; name: string }, i: number) => (
                                    <span key={i} className="booking-house-amenity">{a.name}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Guest selection — 3 columns like ULIS */}
                            <div className="booking-house-guests-row">
                              <div className="booking-house-guest-field">
                                <label><span className="bh-field-icon">👥</span> {t.adultsCount} *</label>
                                <select
                                  value={cardAdults}
                                  onChange={e => setCardAdults(Number(e.target.value))}
                                  className="booking-house-select"
                                >
                                  {adultOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="booking-house-guest-field">
                                <label><span className="bh-field-icon">🧒</span> {t.childrenCount}</label>
                                <select
                                  value={cardChildren}
                                  onChange={e => setCardChildren(Number(e.target.value))}
                                  className="booking-house-select"
                                >
                                  {Array.from({ length: unit.maxChildren + 1 }, (_, i) => (
                                    <option key={i} value={i}>{i} {t.childrenCount.toLowerCase()}</option>
                                  ))}
                                </select>
                              </div>
                              {unit.petAllowed && (
                                <div className="booking-house-guest-field">
                                  <label><span className="bh-field-icon">🐾</span> {t.petPresence}</label>
                                  <label className="booking-house-pet-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={cardHasPet}
                                      onChange={e => setCardHasPet(e.target.checked)}
                                    />
                                    <span>{t.petCheckbox}</span>
                                  </label>
                                </div>
                              )}
                            </div>

                            {/* Charge notes — like ULIS */}
                            <div className="booking-house-charge-notes">
                              {unit.extraPersonCharge > 0 && (
                                <div className="booking-house-charge-note">+ {formatPrice(unit.extraPersonCharge)} Kč {t.extraPersonCharge}</div>
                              )}
                              {unit.petAllowed && (
                                <div className="booking-house-charge-note">+ {formatPrice(unit.petCharge)} Kč {t.petFriendlyDesc.split('.')[0].toLowerCase()}</div>
                              )}
                            </div>

                            {/* Price + actions — like ULIS */}
                            <div className="booking-house-expanded-footer">
                              <div className="booking-house-expanded-actions">
                                <button
                                  className="booking-btn-outline"
                                  onClick={() => setExpandedUnit(null)}
                                  type="button"
                                >
                                  {t.closeCard}
                                </button>
                                <button
                                  className="booking-house-add-btn"
                                  onClick={() => {
                                    setSelectedUnit(unit.id);
                                    setAdults(cardAdults);
                                    setChildren(cardChildren);
                                    setExpandedUnit(null);
                                  }}
                                  type="button"
                                >
                                  {t.bookHouse}
                                </button>
                              </div>
                              <div className="booking-house-dynamic-price">
                                {nights} {t.nightsWord(nights)}, {cardAdults} {t.adultsCount.toLowerCase()}
                                {cardHasPet && `, 1 🐾`}
                                <div className="booking-house-dynamic-total">
                                  <span className="booking-house-price-currency">Kč</span>
                                  <span className="booking-house-price-amount">{formatPrice(dynamicTotal)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="booking-no-avail">
                  <div className="booking-no-avail-icon">🏠</div>
                  <h3>{t.noAvailability}</h3>
                  <p>{t.noAvailabilityDesc}</p>
                </div>
              )}

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}

              {/* Nav Bar (sticky on mobile) */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" onClick={() => goToStep(1)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={goToStep3}
                  disabled={!selectedUnit}
                  type="button"
                >
                  {t.next} ›
                </button>
              </div>
            </div>
          )}

          {/* ═══════ STEP 3: Personal Info ═══════ */}
          {step === 3 && (
            <div className="booking-fade-in">
              <div className="booking-content-card">
                {/* Name Row */}
                <div className="booking-form-row">
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.firstName} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder={t.firstName}
                    />
                  </div>
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.lastName} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder={t.lastName}
                    />
                  </div>
                </div>

                {/* Phone & Email */}
                <div className="booking-form-row">
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.phone} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+420..."
                    />
                  </div>
                  <div className="booking-field">
                    <label className="booking-field-label">
                      {t.email} <span className="booking-field-required">*</span>
                    </label>
                    <input
                      className="booking-field-input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="example@gmail.com"
                    />
                  </div>
                </div>

                <p className="booking-terms">{t.agreeTerms}</p>
              </div>

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}

              {/* Nav Bar (sticky on mobile) — final Pay action on Step 3 */}
              <div className="booking-nav-bar sticky-mobile">
                <button className="booking-btn-back" onClick={() => goToStep(2)} type="button">
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={submitBooking}
                  disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim()}
                  type="button"
                >
                  {submitting ? t.processing : `${t.payAndConfirm} ›`}
                </button>
              </div>
            </div>
          )}

          {/* ═══════ STEP 4: Upsell services (after room payment) ═══════ */}
          {step === 4 && (
            <div className="booking-fade-in">
              <div className="booking-alert success booking-confirmed-banner">
                <span className="booking-alert-icon">✓</span>
                <div>
                  <strong>{t.bookingConfirmedTitle}</strong>
                  <div style={{ fontSize: 13, marginTop: 2, color: 'var(--bk-text-muted)' }}>
                    {t.bookingConfirmedDesc}
                  </div>
                </div>
              </div>

              {servicesLoading ? (
                <div className="booking-loading"><div className="booking-spinner" /></div>
              ) : (
                <>
                  {/* ─── SAUNA CARD ─── */}
                  <div className={`svc-card ${saunaAdded ? 'added' : ''}`}>
                    <div className="svc-card-photo">🧖</div>
                    <div className="svc-card-body">
                      <h3 className="svc-card-title">{t.saunaTitle}</h3>
                      <div className="svc-card-meta">
                        <span className="svc-card-meta-item">👥 {t.saunaPersons}</span>
                        <span className="svc-card-meta-item">⏱ {t.saunaMinHours}</span>
                      </div>
                      <p className="svc-card-desc">{t.saunaDesc}</p>
                      <div className="svc-card-footer">
                        <div className="svc-card-price">
                          <span className="svc-card-price-currency">Kč</span>
                          {formatPrice(saunaPrice)}
                          <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--bk-text-muted)' }}>/{t.saunaPerHour}</span>
                        </div>
                        <button
                          className={`svc-card-add-btn ${saunaAdded ? 'added' : ''}`}
                          onClick={() => {
                            if (saunaAdded) {
                              setShowSaunaPopup(true);
                            } else {
                              setShowSaunaPopup(true);
                            }
                          }}
                          type="button"
                        >
                          {saunaAdded ? `✓ ${t.editService}` : `${t.saunaAddToBooking} +`}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sauna added badge */}
                  {saunaAdded && saunaDate && (
                    <div className="svc-added-badge">
                      <span>🧖</span>
                      <span>
                        {formatDisplayDate(saunaDate, lang)}, {String(saunaStartHour).padStart(2, '0')}:00 — {String(saunaStartHour + saunaHours).padStart(2, '0')}:00
                        {saunaBroom > 0 && ` · 🧹 ×${saunaBroom}`}
                        · <strong>{formatPrice(saunaTotal)} Kč</strong>
                      </span>
                      <button className="svc-added-badge-remove" onClick={() => { setSaunaAdded(false); setSaunaHours(2); setSaunaBroom(0); }} type="button" title={t.removeService}>✕</button>
                    </div>
                  )}

                  {/* ─── SAUNA POPUP MODAL ─── */}
                  {showSaunaPopup && (
                    <div className="svc-popup-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSaunaPopup(false); }}>
                      <div className="svc-popup">
                        <div className="svc-popup-header">
                          <h3 className="svc-popup-title">🧖 {t.saunaTitle}</h3>
                          <button className="svc-popup-close" onClick={() => setShowSaunaPopup(false)} type="button">✕</button>
                        </div>
                        <div className="svc-popup-body">
                          {/* Date selection */}
                          <div className="svc-popup-section">
                            <div className="svc-popup-section-label">{t.saunaDate}</div>
                            <div className="svc-popup-dates">
                              {checkIn && checkOut && (() => {
                                const dates: string[] = [];
                                const start = parseDate(checkIn);
                                const end = parseDate(checkOut);
                                for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                                  dates.push(fmtDate(d));
                                }
                                return dates.map(ds => (
                                  <button
                                    key={ds}
                                    className={`svc-popup-date ${saunaDate === ds ? 'active' : ''}`}
                                    onClick={() => setSaunaDate(ds)}
                                    type="button"
                                  >
                                    {formatDisplayDate(ds, lang)}
                                  </button>
                                ));
                              })()}
                            </div>
                          </div>

                          {/* Time slot grid */}
                          <div className="svc-popup-section">
                            <div className="svc-popup-section-label">{t.selectTime}</div>
                            <div className="svc-popup-slots">
                              {Array.from({ length: 12 }, (_, i) => i + 10).map(h => {
                                const isBooked = bookedSlots.some(
                                  (s: any) => s.date === saunaDate && s.start_time === `${String(h).padStart(2, '0')}:00`
                                );
                                const isSelected = h === saunaStartHour;
                                const isInRange = h > saunaStartHour && h < saunaStartHour + saunaHours;
                                return (
                                  <button
                                    key={h}
                                    className={`svc-popup-slot ${isBooked ? 'booked' : ''} ${isSelected ? 'selected' : ''} ${isInRange ? 'in-range' : ''}`}
                                    onClick={() => { if (!isBooked) setSaunaStartHour(h); }}
                                    disabled={isBooked}
                                    type="button"
                                  >
                                    {String(h).padStart(2, '0')}:00
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Hours & Broom counters */}
                          <div className="svc-popup-section">
                            <div className="svc-popup-counters">
                              <div className="svc-popup-counter">
                                <div className="svc-popup-counter-label">{t.saunaHours}</div>
                                <div className="booking-guest-btns">
                                  <button className="booking-counter-btn" onClick={() => setSaunaHours(h => Math.max(2, h - 1))} disabled={saunaHours <= 2} type="button">−</button>
                                  <span className="booking-counter-value">{saunaHours}</span>
                                  <button className="booking-counter-btn" onClick={() => setSaunaHours(h => Math.min(6, h + 1))} disabled={saunaHours >= 6} type="button">+</button>
                                </div>
                                <div className="svc-popup-counter-sub">{t.saunaMinHours}</div>
                              </div>
                              <div className="svc-popup-counter">
                                <div className="svc-popup-counter-label">{t.saunaBroom} 🧹</div>
                                <div className="booking-guest-btns">
                                  <button className="booking-counter-btn" onClick={() => setSaunaBroom(b => Math.max(0, b - 1))} disabled={saunaBroom <= 0} type="button">−</button>
                                  <span className="booking-counter-value">{saunaBroom}</span>
                                  <button className="booking-counter-btn" onClick={() => setSaunaBroom(b => Math.min(5, b + 1))} disabled={saunaBroom >= 5} type="button">+</button>
                                </div>
                                <div className="svc-popup-counter-sub">{formatPrice(broomPrice)} Kč</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Popup footer */}
                        <div className="svc-popup-footer">
                          <div className="svc-popup-total">
                            <div className="svc-popup-total-label">{t.totalLabel}</div>
                            <div className="svc-popup-total-amount">
                              {formatPrice(saunaPrice * saunaHours + broomPrice * saunaBroom)} Kč
                            </div>
                          </div>
                          <div className="svc-popup-actions">
                            <button className="svc-popup-btn-close" onClick={() => setShowSaunaPopup(false)} type="button">{t.closePopup}</button>
                            <button
                              className="svc-popup-btn-book"
                              onClick={() => {
                                setSaunaAdded(true);
                                setShowSaunaPopup(false);
                              }}
                              type="button"
                            >
                              {t.bookService}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── BREAKFAST SECTION ─── */}
                  <div className="breakfast-section">
                    <h3 className="breakfast-section-title">🍳 {t.myDishes}</h3>
                    <div className="breakfast-info">
                      <span className="breakfast-info-icon">ℹ️</span>
                      <span>{t.breakfastInfo}</span>
                    </div>

                    {menuItems.length > 0 ? (
                      <div className="breakfast-grid">
                        {menuItems.map(item => {
                          const localizedName = lang === 'en' ? item.nameEn : lang === 'cs' ? item.nameCs : lang === 'de' ? item.nameDe : item.name;
                          const qty = breakfastItems[item.id] || 0;
                          return (
                            <div key={item.id} className="breakfast-card">
                              <div className="breakfast-card-photo">
                                <div className="breakfast-card-time">08:45 — 12:30</div>
                                {item.id === 'mi_breakfast_1' ? '🥞' : item.id === 'mi_breakfast_2' ? '🍳' : '🥣'}
                              </div>
                              <div className="breakfast-card-body">
                                <div className="breakfast-card-name">{localizedName || item.name}</div>
                                <div className="breakfast-card-row">
                                  <span className="breakfast-card-weight">{item.weight || '350 г'}</span>
                                  <span className="breakfast-card-price">
                                    {formatPrice(item.price)}
                                    <span className="breakfast-card-price-currency"> Kč</span>
                                  </span>
                                </div>
                                {qty === 0 ? (
                                  <button
                                    className="breakfast-want-btn"
                                    onClick={() => {
                                      setBreakfastItems(prev => ({ ...prev, [item.id]: 1 }));
                                      setBreakfastAdded(true);
                                    }}
                                    type="button"
                                  >
                                    {t.wantButton}
                                  </button>
                                ) : (
                                  <div className="breakfast-counter">
                                    <button
                                      className="booking-counter-btn"
                                      onClick={() => {
                                        const newQty = qty - 1;
                                        setBreakfastItems(prev => ({ ...prev, [item.id]: newQty }));
                                        // Check if any items remain
                                        const remaining = Object.entries({ ...breakfastItems, [item.id]: newQty }).filter(([, v]) => (v as number) > 0);
                                        if (remaining.length === 0) setBreakfastAdded(false);
                                      }}
                                      type="button"
                                    >−</button>
                                    <span className="booking-counter-value">{qty}</span>
                                    <button
                                      className="booking-counter-btn"
                                      onClick={() => setBreakfastItems(prev => ({ ...prev, [item.id]: Math.min(20, qty + 1) }))}
                                      disabled={qty >= 20}
                                      type="button"
                                    >+</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--bk-text-muted)', fontSize: 13 }}>{t.servicesEmpty}</p>
                    )}
                  </div>

                  {/* ─── TUB (ЧАН) SECTION ─── */}
                  <div className="svc-card" style={{ marginTop: 16 }}>
                    <div className="svc-card-photo">
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)', fontSize: 64 }}>
                        🛁
                      </div>
                    </div>
                    <div className="svc-card-body">
                      <h3 className="svc-card-title">{t.tubTitle}</h3>
                      <div className="svc-card-meta">
                        <span>👥 {t.saunaPersons}</span>
                        <span>⏱ {t.saunaMinHours}</span>
                      </div>
                      <p className="svc-card-desc">{t.tubDesc}</p>
                      <div className="svc-card-price">
                        <span className="svc-card-price-currency">Kč</span>
                        <span className="svc-card-price-amount">{formatPrice(tubPrice)}</span>
                        <span className="svc-card-price-unit">{t.tubPerHour}</span>
                      </div>
                      {tubAdded ? (
                        <div className="svc-added-badge">
                          <span>✓ {t.tubTitle}</span>
                          <button className="svc-added-badge-remove" onClick={() => { setTubAdded(false); setTubHours(2); }} type="button">✕</button>
                        </div>
                      ) : (
                        <button className="svc-card-btn" onClick={() => { setShowTubPopup(true); if (checkIn) setTubDate(checkIn); }} type="button">
                          {t.tubAddToBooking} +
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tub Popup Modal */}
                  {showTubPopup && (
                    <div className="svc-popup-overlay" onClick={() => setShowTubPopup(false)}>
                      <div className="svc-popup" onClick={e => e.stopPropagation()}>
                        <button className="svc-popup-close" onClick={() => setShowTubPopup(false)} type="button">✕</button>
                        <h3 className="svc-popup-title">🛁 {t.tubTitle}</h3>

                        {/* Date pills */}
                        <div className="svc-popup-section">
                          <div className="svc-popup-section-title">{t.saunaDate}</div>
                          <div className="svc-popup-date-pills">
                            {checkIn && checkOut && (() => {
                              const dates: string[] = [];
                              const c = new Date(parseDate(checkIn));
                              const end = parseDate(checkOut);
                              while (c < end) { dates.push(fmtDate(c)); c.setDate(c.getDate() + 1); }
                              return dates.map(d => (
                                <button
                                  key={d}
                                  className={`svc-popup-date-pill ${tubDate === d ? 'active' : ''}`}
                                  onClick={() => setTubDate(d)}
                                  type="button"
                                >
                                  {formatShortDate(d, lang)}
                                </button>
                              ));
                            })()}
                          </div>
                        </div>

                        {/* Time slots */}
                        <div className="svc-popup-section">
                          <div className="svc-popup-section-title">{t.selectTime}</div>
                          <div className="svc-popup-time-grid">
                            {Array.from({ length: 12 }, (_, i) => 10 + i).map(hour => {
                              const isBooked = tubBookedSlots.some((s: any) => s.date === tubDate && s.start_time === `${String(hour).padStart(2, '0')}:00`);
                              const isSelected = hour >= tubStartHour && hour < tubStartHour + tubHours;
                              return (
                                <button
                                  key={hour}
                                  className={`svc-popup-time-slot ${isSelected ? 'selected' : ''} ${isBooked ? 'booked' : ''}`}
                                  onClick={() => !isBooked && setTubStartHour(hour)}
                                  disabled={isBooked}
                                  type="button"
                                >
                                  {String(hour).padStart(2, '0')}:00
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Hours counter */}
                        <div className="svc-popup-counters">
                          <div className="svc-popup-counter">
                            <div className="svc-popup-counter-label">{t.saunaHours}</div>
                            <div className="svc-popup-counter-controls">
                              <button className="svc-popup-counter-btn" onClick={() => setTubHours(h => Math.max(2, h - 1))} type="button">−</button>
                              <span className="svc-popup-counter-value">{tubHours}</span>
                              <button className="svc-popup-counter-btn" onClick={() => setTubHours(h => Math.min(6, h + 1))} type="button">+</button>
                            </div>
                            <div className="svc-popup-counter-note">{t.saunaMinHours}</div>
                          </div>
                        </div>

                        {/* Popup footer */}
                        <div className="svc-popup-footer">
                          <div className="svc-popup-total">
                            <div className="svc-popup-total-label">{t.totalLabel}</div>
                            <div className="svc-popup-total-amount">
                              {formatPrice(tubPrice * tubHours)} Kč
                            </div>
                          </div>
                          <div className="svc-popup-actions">
                            <button className="svc-popup-btn-close" onClick={() => setShowTubPopup(false)} type="button">{t.closePopup}</button>
                            <button
                              className="svc-popup-btn-book"
                              onClick={() => {
                                setTubAdded(true);
                                setShowTubPopup(false);
                              }}
                              type="button"
                            >
                              {t.bookService}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── LATE CHECKOUT / EARLY CHECKIN ─── */}
                  <div className={`svc-toggle-card ${lateCheckout ? 'active' : ''}`}>
                    <div className="svc-toggle-info">
                      <span className="svc-toggle-icon">🕐</span>
                      <div className="svc-toggle-text">
                        <h4>{t.lateCheckoutTitle}</h4>
                        <p>{t.lateCheckoutDesc}</p>
                      </div>
                    </div>
                    <span className="svc-toggle-price">{formatPrice(lateCheckoutPrice)} Kč</span>
                    <button
                      className={`svc-toggle-switch ${lateCheckout ? 'on' : ''}`}
                      onClick={() => setLateCheckout(v => !v)}
                      type="button"
                      aria-label={t.lateCheckoutTitle}
                    />
                  </div>

                  <div className={`svc-toggle-card ${earlyCheckin ? 'active' : ''}`}>
                    <div className="svc-toggle-info">
                      <span className="svc-toggle-icon">🕛</span>
                      <div className="svc-toggle-text">
                        <h4>{t.earlyCheckinTitle}</h4>
                        <p>{t.earlyCheckinDesc}</p>
                      </div>
                    </div>
                    <span className="svc-toggle-price">{formatPrice(earlyCheckinPrice)} Kč</span>
                    <button
                      className={`svc-toggle-switch ${earlyCheckin ? 'on' : ''}`}
                      onClick={() => setEarlyCheckin(v => !v)}
                      type="button"
                      aria-label={t.earlyCheckinTitle}
                    />
                  </div>

                  {/* Services Total */}
                  {servicesTotal > 0 && (
                    <div className="booking-alert info" style={{ marginTop: 8 }}>
                      <span className="booking-alert-icon">💰</span>
                      {t.serviceTotal}: <strong>{formatPrice(servicesTotal)} Kč</strong>
                    </div>
                  )}

                </>
              )}

              {error && (
                <div className="booking-alert error" style={{ marginTop: 16 }}>
                  <span className="booking-alert-icon">✗</span>
                  {error}
                </div>
              )}

              {/* Nav Bar (sticky on mobile) — Skip vs Confirm services */}
              <div className="booking-nav-bar sticky-mobile">
                <button
                  className="booking-btn-back"
                  onClick={() => goToStep(5)}
                  type="button"
                >
                  {t.skipToThankYou}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={submitServices}
                  disabled={submitting || (!saunaAdded && !tubAdded && !breakfastAdded && !lateCheckout && !earlyCheckin)}
                  type="button"
                >
                  {submitting ? t.processing : `${t.confirmServices} ›`}
                </button>
              </div>
            </div>
          )}


          {/* ═══════ STEP 5: Payment Breakdown ═══════ */}
          {step === 5 && (
            <div className="booking-fade-in">
              <div className="booking-content-card">
                <h2 style={{ fontFamily: 'var(--bk-font-heading, Fraunces, serif)', marginBottom: 4 }}>
                  {t.paymentTitle || 'Оплата'}
                </h2>
                <p style={{ color: 'var(--bk-ink-2, #5A5A5A)', fontSize: 13, marginBottom: 20 }}>
                  {t.paymentSubtitle || 'Перевірте суму і перейдіть до оплати'}
                </p>

                {/* Breakdown */}
                <div className="booking-success-details">
                  {reservation?.unitName && (
                    <div className="booking-success-detail-row">
                      <span>{t.houseName}</span>
                      <span>{reservation.unitName}</span>
                    </div>
                  )}
                  {checkIn && (
                    <div className="booking-success-detail-row">
                      <span>{t.checkIn}</span>
                      <span>{formatShortDate(checkIn, lang)}</span>
                    </div>
                  )}
                  {checkOut && (
                    <div className="booking-success-detail-row">
                      <span>{t.checkOut}</span>
                      <span>{formatShortDate(checkOut, lang)}</span>
                    </div>
                  )}
                  {(reservation?.nights ?? 0) > 0 && (
                    <div className="booking-success-detail-row">
                      <span>{t.nights}</span>
                      <span>{reservation?.nights}</span>
                    </div>
                  )}
                  {(reservation?.offerDiscount ?? 0) > 0 && (
                    <div className="booking-success-detail-row">
                      <span>{t.discount}</span>
                      <span style={{ color: 'var(--bk-accent)' }}>-{formatPrice(reservation!.offerDiscount)} Kč</span>
                    </div>
                  )}
                  {servicesTotal > 0 && (
                    <div className="booking-success-detail-row">
                      <span>{t.serviceTotal}</span>
                      <span>{formatPrice(servicesTotal)} Kč</span>
                    </div>
                  )}
                  <div className="booking-success-detail-row" style={{ borderTop: '1px solid var(--bk-line, #EAEAE4)', paddingTop: 8, marginTop: 4 }}>
                    <span><strong>{t.total}</strong></span>
                    <span><strong>{formatPrice((reservation?.totalPrice ?? 0) + servicesTotal)} Kč</strong></span>
                  </div>
                </div>

                {error && (
                  <div className="booking-alert error" style={{ marginTop: 16 }}>
                    <span className="booking-alert-icon">✗</span>
                    {error}
                  </div>
                )}
              </div>

              <div className="booking-nav-bar sticky-mobile">
                <button
                  className="booking-btn-back"
                  onClick={() => goToStep(4)}
                  type="button"
                >
                  ‹ {t.back}
                </button>
                <button
                  className="booking-btn-next"
                  onClick={submitPayment}
                  disabled={redirectingToPayment || !reservation}
                  type="button"
                  id="widget-pay-button"
                >
                  {redirectingToPayment
                    ? t.redirectingToPayment
                    : `💳 ${t.payNow || 'Оплатити'}`}
                </button>
              </div>
            </div>
          )}


          {/* ═══════ STEP 6: Success ═══════ */}
          {step === 6 && (
            <div className="booking-fade-in booking-success">
              {/* Payment cancelled/failed */}
              {paymentStatus === 'failed' && (
                <>
                  <div className="booking-success-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>✗</div>
                  <h2>{t.paymentFailed}</h2>
                  <p>{t.paymentFailedDesc}</p>
                  <button className="booking-btn-next" onClick={resetForm} type="button" style={{ marginTop: 16 }}>
                    {t.tryAgain}
                  </button>
                </>
              )}
              {/* Payment success or tentative booking */}
              {paymentStatus !== 'failed' && reservation && (
                <>
                  <div className="booking-success-icon">✓</div>
                  <h2>{paymentStatus === 'success' ? t.paymentSuccess : t.bookingSuccess}</h2>
                  <p>{paymentStatus === 'success' ? t.paymentSuccessDesc : t.bookingSuccessDesc}</p>
                  <p style={{ color: 'var(--bk-accent)', fontWeight: 600, fontSize: 13 }}>
                    {t.weWillContact}
                  </p>

                  <div className="booking-success-id">
                    {t.bookingId}: <strong>{reservation.reservationId}</strong>
                  </div>

                  {reservation.unitName && (
                    <div className="booking-success-details">
                      <div className="booking-success-detail-row">
                        <span>{t.houseName}</span>
                        <span>{reservation.unitName}</span>
                      </div>
                      <div className="booking-success-detail-row">
                        <span>{t.checkIn}</span>
                        <span>{formatShortDate(reservation.checkIn, lang)}</span>
                      </div>
                      <div className="booking-success-detail-row">
                        <span>{t.checkOut}</span>
                        <span>{formatShortDate(reservation.checkOut, lang)}</span>
                      </div>
                      <div className="booking-success-detail-row">
                        <span>{t.nights}</span>
                        <span>{reservation.nights}</span>
                      </div>
                      {reservation.offerDiscount > 0 && (
                        <div className="booking-success-detail-row">
                          <span>{t.discount}</span>
                          <span style={{ color: 'var(--bk-accent)' }}>−{formatPrice(reservation.offerDiscount)} Kč</span>
                        </div>
                      )}
                      <div className="booking-success-detail-row">
                        <span><strong>{t.total}</strong></span>
                        <span><strong>{formatPrice(reservation.totalPrice)} Kč</strong></span>
                      </div>
                    </div>
                  )}

                  {purchasedServices.length > 0 && (
                    <div className="booking-purchased-services">
                      <div className="booking-purchased-services-title">{t.purchasedServicesTitle}</div>
                      <ul>
                        {purchasedServices.map((s) => (
                          <li key={s.id}>
                            <span>{s.service_name || s.service_id}</span>
                            <strong>{formatPrice(s.total_price || 0)} Kč</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button className="booking-btn-next" onClick={resetForm} type="button" style={{ marginTop: 16 }}>
                    {t.backToStart}
                  </button>
                </>
              )}

              {/* Redirecting to payment overlay */}
              {redirectingToPayment && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 40, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>💳</div>
                  <h2>{t.redirectingToPayment}</h2>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ═══ Mobile Cart Overlay ═══ */}
      {mobileCartOpen && (
        <div className="booking-mobile-summary-overlay" onClick={() => setMobileCartOpen(false)}>
          <div className="booking-mobile-summary-content" onClick={e => e.stopPropagation()}>
            <button className="booking-mobile-summary-close" onClick={() => setMobileCartOpen(false)} type="button">
              ‹ {t.back}
            </button>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      {!isWidget && (
        <footer className="booking-footer">
          © {new Date().getFullYear()} {t.brandName} · {t.poweredBy}
        </footer>
      )}
    </div>
  );
}
