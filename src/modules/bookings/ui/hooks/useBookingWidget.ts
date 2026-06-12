import React from 'react';
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { BookingLang } from '../translations';
import { getBookingTranslations } from '../translations';
import type { UnitResult, AvailabilityResponse, ReserveResponse, DesignConfig } from '../types';
import { fmtDate, parseDate, formatPrice } from '../utils';
import { v3Locales } from '../locales';

const API_BASE = process.env.NEXT_PUBLIC_PMS_API_URL || '';

export interface BookingWidgetParams {
  siteId?: string; siteSlug?: string; thankYouUrl?: string;
  design?: DesignConfig; isPreview?: boolean; initialLang?: BookingLang;
}

export function useBookingWidget({ siteId, siteSlug, thankYouUrl, design, isPreview, initialLang }: BookingWidgetParams) {
  const [isMounted, setIsMounted] = useState(false);
  const [lang, setLang] = useState<BookingLang>(initialLang || 'uk');
  const t = useMemo(() => getBookingTranslations(lang), [lang]);
  const v3t = useMemo(() => v3Locales[lang] || v3Locales.uk, [lang]);
  const [step, setStep] = useState(1);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [calOpen, setCalOpen] = useState(false);
  const [busyDates, setBusyDates] = useState<Set<string>>(new Set());
  const [partialDates, setPartialDates] = useState<Set<string>>(new Set());
  const [socialProof, setSocialProof] = useState<{ viewers: number; lastBooking?: string } | null>(null);
  const [waitlistStatus, setWaitlistStatus] = useState<'none' | 'submitting' | 'success'>('none');
  const [nextAvailable, setNextAvailable] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [unitInfo, setUnitInfo] = useState<UnitResult | null>(null);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [extraCouponCode, setExtraCouponCode] = useState('');
  const [extraCouponApplied, setExtraCouponApplied] = useState<{ code: string; offerType: string; offerAmount: number; description?: string } | null>(null);
  const [extraCouponError, setExtraCouponError] = useState('');
  const [applyingExtraCoupon, setApplyingExtraCoupon] = useState(false);
  const [showExtraOffer, setShowExtraOffer] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [offerApplied, setOfferApplied] = useState<{ code: string; offerType: string; offerAmount: number; description?: string; bundle?: any } | null>(null);
  const [offerError, setOfferError] = useState('');
  const [applyingOffer, setApplyingOffer] = useState(false);
  const [isHiddenBundle, setIsHiddenBundle] = useState(false);
  const [siteConfig, setSiteConfig] = useState<any>(null);
  const [siteDesign, setSiteDesign] = useState<DesignConfig | null>(null);
  const [siteCurrency, setSiteCurrency] = useState('Kc');
  const [siteThankYouUrl, setSiteThankYouUrl] = useState(thankYouUrl || '');
  const [services, setServices] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [resolvedUtmParams, setResolvedUtmParams] = useState<Record<string, string>>({});

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const nights = useMemo(() => { if (!checkIn || !checkOut) return 0; return Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / 86400000); }, [checkIn, checkOut]);
  const getOccupancyString = (u: any) => { const upTo = t.upTo || '\u0434\u043e'; if (u.maxChildren > 0) return `${upTo} ${u.maxAdults} ${t.adults.toLowerCase()} (+${u.maxChildren} ${t.children.toLowerCase()})`; return `${upTo} ${u.maxAdults || u.maxOccupancy} ${t.guestsShort}`; };

  // ── postMessage UTM resolution for cross-origin iframes ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ttclid'];

    // First, try reading from own URL (works when script-tag embedded or same-origin)
    const ownParams = new URLSearchParams(window.location.search);
    const ownUtm: Record<string, string> = {};
    for (const key of UTM_KEYS) { const v = ownParams.get(key); if (v) ownUtm[key] = v; }
    if (Object.keys(ownUtm).length > 0) {
      setResolvedUtmParams(ownUtm);
      return; // already have UTMs, no need for postMessage
    }

    // If inside an iframe, request UTMs from the parent via postMessage
    if (window.parent !== window) {
      const handleMessage = (e: MessageEvent) => {
        if (e.data?.source === 'alisio-parent' && e.data?.event === 'utm_params') {
          const utm: Record<string, string> = {};
          for (const key of UTM_KEYS) { const v = e.data.utm?.[key]; if (v) utm[key] = v; }
          setResolvedUtmParams(utm);
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);
      // Send the request to parent
      window.parent.postMessage({ source: 'alisio-widget', event: 'request_utm' }, '*');
      // Cleanup listener after 5s (parent may not have the script installed)
      const cleanup = setTimeout(() => window.removeEventListener('message', handleMessage), 5000);
      return () => { window.removeEventListener('message', handleMessage); clearTimeout(cleanup); };
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const payStatus = params.get('payment_status'); const resId = params.get('res_id');
    if (payStatus === 'success' && resId) {
      fetch(`${API_BASE}/api/booking/reservation?id=${resId}`).then(r => r.json()).then(data => {
        if (data.reservation) { setReservation({ ...data.reservation, reservationId: data.reservation.id, unitName: data.reservation.unit_name, totalPrice: data.reservation.total_price }); if (data.services) { const sIds = new Set<string>(); data.services.forEach((s: any) => sIds.add(s.service_id)); setSelectedServiceIds(sIds); } setStep(6); }
      }).catch(e => console.error(e));
    }
    const uId = params.get('unitId'); if (uId) setSelectedUnitId(uId);
    const getBrowserLang = () => { if (typeof navigator !== 'undefined' && navigator.language) { const bl = navigator.language.slice(0,2).toLowerCase(); if (['uk','en','cs','de'].includes(bl)) return bl; } return null; };
    let l = params.get('lang') || (window as any).__BOOKING_LANG__ || initialLang || getBrowserLang() || null;
    if (l) { const sl = l.slice(0,2).toLowerCase(); if (['uk','en','cs','de'].includes(sl)) setLang(sl as BookingLang); }
    const urlIn = params.get('checkin') || params.get('check_in'); const urlOut = params.get('checkout') || params.get('check_out');
    if (urlIn) setCheckIn(urlIn); if (urlOut) setCheckOut(urlOut);
    const urlAdults = params.get('adults'); const urlKids = params.get('kids');
    if (urlAdults) setAdults(parseInt(urlAdults,10)||2); if (urlKids) setKids(parseInt(urlKids,10)||0);
    const urlOffer = params.get('offer') || params.get('couponCode') || params.get('couponcode'); if (urlOffer) { setCouponCode(urlOffer); setShowOffer(true); }
    const urlBundle = params.get('bundle') || params.get('bundleId'); if (urlBundle) { setCouponCode(urlBundle); setIsHiddenBundle(true); setShowOffer(true); }
    const saved = localStorage.getItem('alisio_guest_data'); if (saved) { try { const g = JSON.parse(saved); setFirstName(g.firstName||''); setLastName(g.lastName||''); setEmail(g.email||''); setPhone(g.phone||''); } catch {} }
    const v = Math.floor(Math.random()*6)+3; const hours = Math.floor(Math.random()*12)+1;
    setSocialProof({ viewers: v, lastBooking: hours < 5 ? `${hours} ${hours===1 ? v3t.agoHour : v3t.agoHours}` : `45 ${v3t.agoMinutes}` });
  }, []);

  useEffect(() => { if (!isMounted || !siteSlug || isPreview) return; (async () => { try { const res = await fetch(`${API_BASE}/api/booking/site-config?slug=${siteSlug}`); const data = await res.json(); if (data.id) { setSiteConfig(data); if (data.design) setSiteDesign(data.design); if (data.currency) setSiteCurrency(data.currency); if (data.config?.thank_you_url) setSiteThankYouUrl(data.config.thank_you_url); if (data.returnUrl && !data.config?.thank_you_url) setSiteThankYouUrl(data.returnUrl); // Notify embed.v2.js on parent page about analytics config if (typeof window !== 'undefined' && window.parent !== window) { window.parent.postMessage({ source: 'alisio-widget', event: 'analytics_config', fbPixelId: data.fbPixelId || null, ga4Id: data.ga4Id || null, tiktokPixelId: data.tiktokPixelId || null, returnUrl: data.returnUrl || null }, '*'); } } } catch(e) { console.error(e); } })(); }, [isMounted, siteSlug, isPreview]);

  useEffect(() => {
    if (step === 6 && !isPreview) {
      const rId = reservation?.reservationId || '';
      const val = reservation?.totalPrice || 0;
      const eventId = `booking_${rId || Date.now()}`;
      // Fire purchase postMessage to embed.v2.js on parent page (handles pixel events there)
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ source: 'alisio-widget', event: 'purchase', reservationId: rId, value: val, currency: 'CZK', eventId }, '*');
      }
      if (siteThankYouUrl) {
        const timer = setTimeout(() => { const sep = siteThankYouUrl.includes('?') ? '&' : '?'; const rId2 = reservation?.reservationId || ''; const url = `${siteThankYouUrl}${sep}payment_status=success${rId2 ? `&reservation_id=${encodeURIComponent(rId2)}` : ''}`; if (window.parent !== window) { window.parent.location.href = url; } else { window.location.href = url; } }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [step, siteThankYouUrl, isPreview, reservation]);

  useEffect(() => { if (!isMounted) return; (async () => { const rSiteId = siteId || siteConfig?.id; if (!rSiteId) return; setLoadingServices(true); try { const url = new URL(`${API_BASE}/api/booking/services`, window.location.origin); url.searchParams.set('siteId', rSiteId); const res = await fetch(url.toString()); const data = await res.json(); if (data.services) setServices(data.services); } catch(e) { console.error(e); } setLoadingServices(false); })(); }, [isMounted, siteId, siteSlug, siteConfig]);

  useEffect(() => { if (!isMounted || !selectedUnitId || unitInfo) return; (async () => { try { const d = new Date(); const ci = fmtDate(d); const co = fmtDate(new Date(d.getTime()+86400000)); const p = new URLSearchParams({ checkIn: ci, checkOut: co }); if (siteId) p.set('siteId', siteId); if (siteSlug) p.set('siteSlug', siteSlug); const res = await fetch(`${API_BASE}/api/booking/availability?${p.toString()}`); if (res.ok) { const data = await res.json(); const unit = data.units?.find((u: UnitResult) => u.id === selectedUnitId); if (unit) setUnitInfo(unit); } } catch(e) { console.error(e); } })(); }, [isMounted, selectedUnitId, siteId, unitInfo]);

  useEffect(() => { if (!isMounted) return; if (selectedUnitId && checkIn && checkOut && !availability && !loadingAvail) fetchAvailability(checkIn, checkOut); }, [isMounted, selectedUnitId, availability, loadingAvail, checkIn, checkOut]);

  useEffect(() => { if (!isMounted) return; const sendResize = () => { const el = document.getElementById('alisio-widget-v3'); if (!el) return; const height = Math.ceil(el.getBoundingClientRect().height); if (height <= 0) return; const msg = { type: 'resize', height, val: height, h: height, source: 'alisio-widget' }; window.parent.postMessage(msg, '*'); if (window.parent !== window.top) window.top?.postMessage(msg, '*'); }; const interval = setInterval(sendResize, 500); sendResize(); return () => clearTimeout(interval); }, [isMounted]);

  useEffect(() => { if (!isMounted) return; (async () => { try { const fetchMonth = async (offset: number) => { const date = new Date(today.getFullYear(), today.getMonth()+offset, 1); const monthStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; const p = new URLSearchParams({ month: monthStr }); if (siteId) p.set('siteId', siteId); if (siteSlug) p.set('siteSlug', siteSlug); if (selectedUnitId) p.set('unitId', selectedUnitId); const urlParams = new URLSearchParams(window.location.search); const rp = urlParams.get('ratePlanId') || urlParams.get('ratePlan'); if (rp) p.set('ratePlanId', rp); const res = await fetch(`${API_BASE}/api/widget/calendar?${p.toString()}`); return res.json(); }; const [d1, d2] = await Promise.all([fetchMonth(calMonthOffset), fetchMonth(calMonthOffset+1)]); const busy = new Set<string>(); const partial = new Set<string>(); [d1,d2].forEach(data => { if (data?.days) data.days.forEach((d: any) => { if (d.status==='booked') busy.add(d.date); if (d.status==='partial') partial.add(d.date); }); }); setBusyDates(busy); setPartialDates(partial); } catch(e) { console.error(e); } })(); }, [calMonthOffset, isMounted, siteId, siteSlug, selectedUnitId]);

  const displayUnits = useMemo(() => { if (!availability?.units) return []; if (offerApplied?.bundle?.applied_listings?.length > 0) return availability.units.filter(u => offerApplied!.bundle.applied_listings.includes(u.id)); return availability.units; }, [availability, offerApplied]);
  const selectedUnit = useMemo(() => { if (!selectedUnitId) return null; if (availability) return displayUnits.find(u => u.id === selectedUnitId) || unitInfo; return unitInfo; }, [availability, selectedUnitId, unitInfo, displayUnits]);
  const totalWithDiscount = useMemo(() => {
    // ── Package with fixed price: no need to wait for selectedUnit ──
    if (offerApplied?.offerType === 'package' && offerApplied.bundle) {
      const bundleBase = offerApplied.bundle.price ?? 0;
      let servicesTotal = 0;
      const guestsCount = adults + kids || 1;
      const inclGuests = offerApplied.bundle.base_guests || selectedUnit?.baseOccupancy || 2;
      const extraG = Math.max(0, guestsCount - inclGuests);
      const included = offerApplied.bundle.included_services || [];
      services.forEach(s => {
        if (selectedServiceIds.has(s.id)) {
          const bSvc = included.find((inc: any) => inc.service_id === s.id);
          servicesTotal += bSvc?.isIncluded ? (s.price || 0) * extraG : (s.price || 0) * guestsCount;
        }
      });
      if (extraCouponApplied) {
        let base = bundleBase;
        if (extraCouponApplied.offerType === 'fixed_price' || extraCouponApplied.offerType === 'fixed_amount') base -= extraCouponApplied.offerAmount;
        else if (extraCouponApplied.offerType === 'percentage') base = Math.round(base * (1 - extraCouponApplied.offerAmount / 100));
        return Math.max(0, base) + servicesTotal;
      }
      return Math.max(0, bundleBase) + servicesTotal;
    }

    if (!selectedUnit) return 0;
    const extraGuests = Math.max(0, adults - selectedUnit.baseOccupancy);
    const extraCharge = extraGuests * (selectedUnit.extraPersonCharge || 0) * nights;
    let base = selectedUnit.totalPrice + extraCharge; let servicesTotal = 0; const guestsCount = adults + kids || 1;
    if (offerApplied) { if (offerApplied.offerType === 'fixed_price' || offerApplied.offerType === 'fixed_amount') base -= offerApplied.offerAmount; else if (offerApplied.offerType === 'percentage') base = Math.round(base*(1-offerApplied.offerAmount/100)); }
    if (base < 0) base = 0;
    if (extraCouponApplied) {
      if (extraCouponApplied.offerType === 'fixed_price' || extraCouponApplied.offerType === 'fixed_amount') base -= extraCouponApplied.offerAmount; else if (extraCouponApplied.offerType === 'percentage') base = Math.round(base*(1-extraCouponApplied.offerAmount/100));
    }
    if (base < 0) base = 0;
    services.forEach(s => { if (selectedServiceIds.has(s.id)) servicesTotal += (s.price||0)*guestsCount; });
    return base + servicesTotal;
  }, [selectedUnit, adults, kids, nights, services, selectedServiceIds, offerApplied, extraCouponApplied]);

  const totalWithoutDiscount = useMemo(() => {
    if (!selectedUnit) return 0;
    const extraGuests = Math.max(0, adults - selectedUnit.baseOccupancy);
    const extraCharge = extraGuests * (selectedUnit.extraPersonCharge || 0) * nights;
    const base = selectedUnit.totalPrice + extraCharge;
    let servicesTotal = 0; const guestsCount = adults + kids || 1;
    services.forEach(s => { if (selectedServiceIds.has(s.id)) servicesTotal += (s.price||0)*guestsCount; });
    return base + servicesTotal;
  }, [selectedUnit, adults, nights, services, selectedServiceIds]);

  const fetchAvailability = useCallback(async (ci: string, co: string) => {
    if (isPreview) { setLoadingAvail(true); await new Promise(r => setTimeout(r,800)); const mock: AvailabilityResponse = { checkIn: ci, checkOut: co, nights: Math.round((parseDate(co).getTime()-parseDate(ci).getTime())/86400000), units: [{ id:'mock-1', name:'Premium Glamping Tent', code:'P1', beds:2, unitTypeId:'t1', typeName:'Tent', typeCode:'T', description:'Beautiful tent', maxAdults:2, maxChildren:1, maxOccupancy:3, baseOccupancy:2, avgPricePerNight:2500, totalPrice:5000, currency:'Kc', extraPersonCharge:500, petAllowed:true, petCharge:200, photos:[], amenities:[] }] }; setAvailability(mock); setLoadingAvail(false); return mock; }
    setLoadingAvail(true);
    try { const p = new URLSearchParams({ checkIn: ci, checkOut: co }); if (siteId) p.set('siteId', siteId); if (siteSlug) p.set('siteSlug', siteSlug); const res = await fetch(`${API_BASE}/api/booking/availability?${p.toString()}`); if (res.ok) { const data = await res.json(); setAvailability(data); setLoadingAvail(false); if (data.units?.length === 0) findNextAvailable(co); return data; } } catch(e) { console.error(e); }
    setLoadingAvail(false); return null;
  }, [siteId, siteSlug]);

  const findNextAvailable = async (co: string) => { try { const res = await fetch(`${API_BASE}/api/widget/calendar?month=${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}${siteId?`&siteId=${siteId}`:''}${siteSlug?`&siteSlug=${siteSlug}`:''}`); const data = await res.json(); if (data.days) { const next = data.days.find((d: any) => d.status==='available' && d.date > co); if (next) setNextAvailable(next.date); } } catch(e) { console.error(e); } };

  const joinWaitlist = async () => { if (!email || !checkIn || !checkOut) return; setWaitlistStatus('submitting'); try { await fetch(`${API_BASE}/api/booking/waitlist`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ siteId, checkIn, checkOut, email, phone, name:`${firstName} ${lastName}` }) }); setWaitlistStatus('success'); } catch(e) { console.error(e); } };

  const handleDayClick = (dateStr: string) => { const clicked = parseDate(dateStr); if (clicked < today) return; if (dateStr === checkIn && !checkOut) { setCheckIn(null); setSelectingCheckOut(false); return; } if (checkIn && checkOut && (dateStr === checkIn || dateStr === checkOut)) { setCheckIn(null); setCheckOut(null); setSelectingCheckOut(false); return; } if (!checkIn || (checkIn && checkOut) || !selectingCheckOut) { setCheckIn(dateStr); setCheckOut(null); setSelectingCheckOut(true); } else { if (clicked <= parseDate(checkIn!)) { setCheckIn(dateStr); setCheckOut(null); } else { setCheckOut(dateStr); setSelectingCheckOut(false); fetchAvailability(checkIn!, dateStr); } } };

  const goToStep = (s: number) => {
    if (s === 4) {
      s = step === 5 ? 3 : 5;
    }
    if (s===2 && (displayUnits.length===1 || (selectedUnitId && step===3))) {
      setStep(step===3 ? 1 : 3);
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    if (s===4 && services.length===0 && !loadingServices) {
      setStep(step===5 ? 3 : 5);
      window.scrollTo({top:0,behavior:'smooth'});
    } else {
      setStep(s);
      window.scrollTo({top:0,behavior:'smooth'});
    }
    if (typeof window !== 'undefined' && window.parent !== window) setTimeout(() => window.parent.postMessage({source:'alisio-widget',event:'resize',height:document.body.scrollHeight},'*'), 100);
  };

  const resolvedSiteId = siteId || siteConfig?.id || '';

  const handleApplyOffer = useCallback(async (codeToApply?: string | React.MouseEvent) => {
    const code = (typeof codeToApply === 'string' ? codeToApply : couponCode).trim().toUpperCase(); if (!code) return;
    const sId = siteId || siteConfig?.id || siteSlug || ''; setApplyingOffer(true); setOfferError('');
    try { const uId = selectedUnitId || ''; const res = await fetch(`${API_BASE}/api/booking/activate?code=${encodeURIComponent(code)}&unitId=${uId}&siteId=${sId}`); const data = await res.json();
      if (data.valid) { setOfferApplied({ code: data.code, offerType: data.discount_type, offerAmount: data.offer_amount, description: data.description, bundle: data.bundle ? { ...data.bundle, included_services: data.bundle.included_services?.map((inc: any) => ({ service_id: inc.service_id, isIncluded: inc.free })) } : undefined }); setShowOffer(false);
        if (data.discount_type==='package' && data.bundle?.included_services) { const ns = new Set(selectedServiceIds); data.bundle.included_services.forEach((inc: any) => { if (inc.free || inc.isIncluded) ns.add(inc.service_id); }); setSelectedServiceIds(ns); }
        if (data.discount_type==='package' && data.bundle?.applied_listings?.length===1) setSelectedUnitId(data.bundle.applied_listings[0]);
      } else { setOfferApplied(null); setOfferError(data.error || 'Invalid code'); }
    } catch { setOfferError('Server error'); } finally { setApplyingOffer(false); }
  }, [couponCode, siteId, siteSlug, siteConfig, selectedUnitId, selectedServiceIds]);

  const handleApplyExtraOffer = useCallback(async (codeToApply?: string | React.MouseEvent) => {
    const code = (typeof codeToApply === 'string' ? codeToApply : extraCouponCode).trim().toUpperCase(); if (!code) return;
    const sId = siteId || siteConfig?.id || siteSlug || ''; setApplyingExtraCoupon(true); setExtraCouponError('');
    try { const uId = selectedUnitId || ''; const res = await fetch(`${API_BASE}/api/booking/activate?code=${encodeURIComponent(code)}&unitId=${uId}&siteId=${sId}`); const data = await res.json();
      if (data.valid && data.discount_type !== 'package') {
        if (offerApplied?.offerType === 'package' && offerApplied.bundle?.allowed_promo_codes?.includes(data.code)) {
            setExtraCouponApplied({ code: data.code, offerType: data.discount_type, offerAmount: data.offer_amount, description: data.description }); setShowExtraOffer(false);
        } else {
            setExtraCouponError('Цей промокод не діє разом з обраним пакетом');
        }
      } else { setExtraCouponApplied(null); setExtraCouponError(data.error || 'Invalid code'); }
    } catch { setExtraCouponError('Server error'); } finally { setApplyingExtraCoupon(false); }
  }, [extraCouponCode, siteId, siteSlug, siteConfig, selectedUnitId, offerApplied]);

  useEffect(() => { if (!isMounted) return; if (couponCode && !offerApplied && !applyingOffer && !offerError && !!(siteId||siteSlug)) handleApplyOffer(couponCode); }, [isMounted, couponCode, offerApplied, siteId, siteSlug]);

  const submitBooking = async () => {
    if (!checkIn || !checkOut || !selectedUnitId || !firstName || !lastName || !phone) { setError(v3t.errorReq); return; }
    if (isPreview) { setSubmitting(true); await new Promise(r => setTimeout(r,1000)); setReservation({ success:true, reservationId:'MOCK-123', unitName:selectedUnit?.name||'Mock', checkIn, checkOut, nights, totalPrice:totalWithDiscount, currency:'Kc' }); setSubmitting(false); goToStep(4); return; }
    setSubmitting(true);
    try { 
      // Use pre-resolved UTM params (captured via postMessage or own URL on mount)
      const utmParams = resolvedUtmParams;

      const res = await fetch(`${API_BASE}/api/booking/reserve`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ unitId:selectedUnitId, checkIn, checkOut, adults, children:kids, firstName, lastName, email, phone, siteId:siteId||undefined, couponCode:offerApplied?.code||undefined, extraCouponCode:extraCouponApplied?.code||undefined, currency:availability?.units.find(u=>u.id===selectedUnitId)?.currency||siteCurrency||'CZK', utmParams }) });
      if (res.ok) { 
        const data = await res.json(); 
        setReservation(data); 
        
        if (data.testEmailStatus) {
          console.log('[ALiSiO Widget] Test email status:', data.testEmailStatus);
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ 
                source: 'alisio-widget', 
                event: 'test_email_status', 
                status: data.testEmailStatus, 
                reservationId: data.reservationId 
              }, '*');
            }
          } catch(e) { console.error('Failed to postMessage:', e); }
        }
        
        if (data.totalPrice === 0 && data.thankYouUrl) {
          try {
            if (window.top) window.top.location.href = data.thankYouUrl;
            else window.location.href = data.thankYouUrl;
          } catch {
            window.location.href = data.thankYouUrl;
          }
          return;
        }

        // If reservation is fully paid / free package, and a thankYouUrl is provided, we can redirect directly or go to step 4
        // However, we just go to step 4 (Success page). If there's a thankYouUrl, step 4 will handle the redirect, 
        // OR we let startPayment handle the redirect. Since it's unpaid at this moment, they must go to step 4 or startPayment.
        goToStep(4); 
      } else { 
        const err = await res.json(); 
        if (res.status===409) { 
          setError(null); alert(t.datesConflict || 'Die gew\u00e4hlten Termine sind leider nicht mehr verf\u00fcgbar.'); setCheckIn(null); setCheckOut(null); setSelectedUnitId(null); setAvailability(null); goToStep(1); 
        } else setError(err.error||'Failed to book'); 
      }
    } catch { setError('Connection error'); }
    setSubmitting(false); if (typeof window!=='undefined') localStorage.setItem('alisio_guest_data', JSON.stringify({firstName,lastName,email,phone}));
  };

  const toggleService = async (id: string) => {
    setSelectedServiceIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    if (reservation?.reservationId && !isPreview) { try { await fetch(`${API_BASE}/api/booking/services`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'book-toggle', serviceId:id, reservationId:reservation.reservationId, siteSlug, quantity:adults+kids||1 }) }); } catch(e) { console.error(e); } }
  };

  const startPayment = async () => {
    if (!reservation) return;
    if (isPreview) { setSubmitting(true); await new Promise(r=>setTimeout(r,1000)); setSubmitting(false); goToStep(6); return; }
    if (!siteSlug) { goToStep(6); return; }
    setSubmitting(true);
    try {
      // ── Prefer thank-you URL from reservation response (most reliable) → siteThankYouUrl state → parent page URL ──
      // reservation.thankYouUrl is returned directly from /api/booking/reserve so it's always correct,
      // avoiding the race condition where siteThankYouUrl state may not be populated yet.
      let retPath = (reservation as any).thankYouUrl || siteThankYouUrl || '';
      if (!retPath) {
        try { retPath = (window.top as any).location.href.split('?')[0]; } catch { retPath = window.location.href.split('?')[0]; }
      }
      const sep = retPath.includes('?') ? '&' : '?';
      retPath += `${sep}res_id=${reservation.reservationId}&payment_status=success`;

      const res = await fetch(`${API_BASE}/api/booking/checkout-session`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ reservation_id:reservation.reservationId, site_slug:siteSlug, return_path:retPath }) });
      if (res.status===403) { goToStep(6); setSubmitting(false); return; }
      const data = await res.json();
      if (data.already_paid) {
        goToStep(6);
      } else if (data.session_url) {
        try {
          // Use an anchor tag click to force top navigation, which works around iOS/Iframe limitations
          const a = document.createElement('a');
          a.href = data.session_url;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
        } catch {
          window.location.href = data.session_url;
        }
      } else setError(data.error||'Payment failed');
    } catch { setError('Payment gateway error'); }
    setSubmitting(false);
  };

  const activeDesign = isPreview ? (design || siteDesign) : (siteDesign || design);
  const dynamicStyles = useMemo(() => { const d = activeDesign; if (!d) return {}; const s: any = {}; if (d.primary_color) { s['--moss']=d.primary_color; s['--moss-dark']=d.primary_color; s['--accent-primary']=d.primary_color; } if (d.button_style) { const isSharp=d.button_style.includes('sharp'); const isPill=d.button_style.includes('pill'); s['--radius']=isSharp?'2px':isPill?'24px':'12px'; s['--radius-lg']=isSharp?'4px':isPill?'32px':'16px'; } if (d.show_shadow!==undefined) s['--shadow']=d.show_shadow?'0 8px 32px rgba(0,0,0,0.12)':'none'; return s; }, [activeDesign]);

  useEffect(() => { if (isPreview) return; const theme = activeDesign?.theme?.toLowerCase()||''; const BG: Record<string,string> = { dark:'#0f172a', luxury:'#0d0d1a', nature:'#f0fdf4', ocean:'#ecfeff', sunset:'#fff7ed', nordic:'#f8fafc', minimal:'#fafafa', modern:'#f1f5f9', classical:'#fdf8f0' }; const bg = BG[theme]||'#FAFAF7'; document.documentElement.style.background=bg; document.body.style.background=bg; return () => { document.documentElement.style.background=''; document.body.style.background=''; }; }, [activeDesign]);

  const invalidNightsMsg = offerApplied?.offerType==='package' && offerApplied.bundle?.nights_included && nights>0 && nights!==offerApplied.bundle.nights_included ? t.packageNightsError(offerApplied.bundle.nights_included) : null;

  return { lang, setLang, setOfferError, t, v3t, step, setStep, checkIn, setCheckIn, checkOut, setCheckOut, nights, selectingCheckOut, setSelectingCheckOut, adults, setAdults, kids, setKids, calMonthOffset, setCalMonthOffset, calOpen, setCalOpen, busyDates, partialDates, socialProof, waitlistStatus, joinWaitlist, nextAvailable, availability, loadingAvail, selectedUnitId, setSelectedUnitId, unitInfo, currentImgIndex, setCurrentImgIndex, firstName, setFirstName, lastName, setLastName, email, setEmail, phone, setPhone, submitting, error, reservation, couponCode, setCouponCode, showOffer, setShowOffer, offerApplied, offerError, applyingOffer, extraCouponCode, setExtraCouponCode, showExtraOffer, setShowExtraOffer, extraCouponApplied, setExtraCouponApplied, extraCouponError, setExtraCouponError, applyingExtraCoupon, handleApplyExtraOffer, isHiddenBundle, siteConfig, siteCurrency, services, loadingServices, selectedServiceIds, setSelectedServiceIds, setAvailability, displayUnits, selectedUnit, totalWithDiscount, totalWithoutDiscount, fetchAvailability, handleDayClick, goToStep, handleApplyOffer, submitBooking, toggleService, startPayment, activeDesign, dynamicStyles, invalidNightsMsg, today, getOccupancyString, resolvedSiteId };
}



