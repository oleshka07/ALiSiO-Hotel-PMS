'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import StepLanding, { type AccommodationType } from './steps/StepLanding';
import StepGlamping from './steps/StepGlamping';
import StepBuildings from './steps/StepBuildings';
import StepCamping from './steps/StepCamping';
import StepExtras from './steps/StepExtras';
import StepSummary from './steps/StepSummary';
import StepSuccess from './steps/StepSuccess';
import PriceListPopup from './components/PriceListPopup';
import { getNightDates, loadPriceList, type PriceItem } from './lib/pricing';

// ─── Analytics helpers (injected dynamically per site_id config) ──────────────
function injectFbPixel(pixelId: string) {
  if (typeof window === 'undefined' || (window as any).fbq) return;
  const s = document.createElement('script');
  s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');`;
  document.head.appendChild(s);
}

function injectGa4(ga4Id: string) {
  if (typeof window === 'undefined') return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
  document.head.appendChild(s);
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function() { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', ga4Id);
}

function injectTiktokPixel(pixelId: string) {
  if (typeof window === 'undefined' || (window as any).ttq) return;
  const s = document.createElement('script');
  s.innerHTML = `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'],ttq.setAndDequeue=function(e){ttq[e]=function(){ttq.instance(ttq._i[0]).then(function(i){i[e].apply(i,arguments)})}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDequeue(ttq.methods[i]);ttq.load=function(e,n){var i='https://analytics.tiktok.com/i18n/pixel/events.js',r=document.createElement('script');r.type='text/javascript',r.async=!0,r.src=i;var s=document.getElementsByTagName('script')[0];s.parentNode.insertBefore(r,s),ttq._i=ttq._i||{},ttq._i[e]=[],ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};for(var a=function(e){return function(){ttq.instance(e).then(function(t){t[e].apply(t,arguments)})}},o=0;o<ttq.methods.length;o++)ttq[ttq.methods[o]]=a(ttq.methods[o])},ttq.load('${pixelId}'),ttq.page()}(window,document,'ttq');`;
  document.head.appendChild(s);
}

type Step = 'landing' | 'accommodation' | 'extras' | 'summary' | 'success';

interface BookingState {
  accommodationType: AccommodationType | null;
  accommodationData: Record<string, unknown>;
  extras: { id: string; name: string; quantity: number; price: number }[];
  contact: { name: string; email: string; phone: string } | null;
  total: number;
  checkIn: string;
  checkOut: string;
  priceBreakdown: { label: string; amount: number; isDiscount?: boolean }[];
}

const STEP_LABELS: Record<Step, string> = {
  landing: 'Accommodation', accommodation: 'Details', extras: 'Extras', summary: 'Summary', success: 'Done',
};
const STEP_ORDER: Step[] = ['landing', 'accommodation', 'extras', 'summary', 'success'];
const STORAGE_KEY = 'kc_booking_draft';
const CHECKOUT_CACHE_KEY = 'kc_checkout_cache';
const CACHE_TTL_MS = 25 * 60 * 1000; // a bit under Teya's session TTL

function getAccommodationLabel(state: BookingState): string {
  if (!state.accommodationType) return '';
  if (state.accommodationType === 'glamping') {
    const unit = state.accommodationData.unit as string;
    return unit === 'tiny' ? 'Tiny House' : 'Barn House';
  }
  if (state.accommodationType === 'buildings') {
    const b = state.accommodationData.building as string;
    const m = state.accommodationData.mode as string;
    const bName = b === 'budova_d' ? 'Budova D' : 'Budova F';
    return `${bName} — ${m === 'shared' ? 'Shared beds' : m === 'non_shared' ? 'Private room' : 'Whole building'}`;
  }
  return 'Camping';
}

function getGuestsLabel(state: BookingState): string {
  const ad = (state.accommodationData.adults as number) || 0;
  const ch = (state.accommodationData.children as number) || 0;
  let s = `${ad} adult${ad !== 1 ? 's' : ''}`;
  if (ch > 0) s += `, ${ch} child${ch !== 1 ? 'ren' : ''}`;
  return s;
}

const getUtmParams = () => {
  if (typeof window === 'undefined') return {};
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid'];
  const utm: Record<string, string> = {};
  keys.forEach(k => { const v = sessionStorage.getItem(k); if (v) utm[k] = v; });
  const urlParams = new URLSearchParams(window.location.search);
  keys.forEach(k => { const v = urlParams.get(k); if (v) utm[k] = v; });
  return utm;
};

export default function BookingWizard() {
  const [step, setStep] = useState<Step>('landing');
  const [state, setState] = useState<BookingState>({
    accommodationType: null, accommodationData: {}, extras: [], contact: null, total: 0, checkIn: '', checkOut: '', priceBreakdown: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'pending' | 'admin_pending' | 'admin_eur_pending' | 'terminal_pending'>('pending');
  const [reservationId, setReservationId] = useState<string | undefined>();
  const [guestPageToken, setGuestPageToken] = useState<string | undefined>();
  const [paymentUrl, setPaymentUrl] = useState<string | undefined>();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | undefined>();
  const [showResume, setShowResume] = useState(false);
  const [showPriceList, setShowPriceList] = useState(false);
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [siteConfig, setSiteConfig] = useState<{
    id: string;
    fbPixelId?: string | null;
    ga4Id?: string | null;
    tiktokPixelId?: string | null;
    returnUrl?: string | null;
  } | null>(null);

  // Cache Teya session so "Pay online" + "Show QR" + "Pay via admin" reuse
  // the same draft + checkout instead of creating duplicates. Also persisted
  // to sessionStorage so a reload during checkout doesn't spawn new reservations.
  const checkoutCacheRef = useRef<{ sessionUrl: string; pmsResId: string; guestPageToken?: string } | null>(null);

  // Restore checkout cache from sessionStorage (recover from accidental reloads
  // while the Teya tab is still open).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHECKOUT_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        parsed && parsed.ts && Date.now() - parsed.ts < CACHE_TTL_MS &&
        parsed.sessionUrl && parsed.pmsResId
      ) {
        checkoutCacheRef.current = {
          sessionUrl: parsed.sessionUrl,
          pmsResId: parsed.pmsResId,
          guestPageToken: parsed.guestPageToken,
        };
      } else {
        sessionStorage.removeItem(CHECKOUT_CACHE_KEY);
      }
    } catch { sessionStorage.removeItem(CHECKOUT_CACHE_KEY); }
  }, []);

  // Load price list from API
  useEffect(() => { loadPriceList().then(setPrices).catch(() => {}); }, []);

  const [sessionId] = useState(() => {
    if (typeof window === 'undefined') return '';
    let id = sessionStorage.getItem('alisio_sid');
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      sessionStorage.setItem('alisio_sid', id);
    }
    return id;
  });

  const sendWidgetEvent = useCallback((eventType: string, extra: Record<string, any> = {}) => {
    if (typeof window === 'undefined' || !siteConfig?.id) return;
    fetch('/api/widget/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: siteConfig.id, sessionId, eventType, page: '/book',
        utmParams: getUtmParams(), ...extra
      }),
      keepalive: true
    }).catch(() => {});
  }, [sessionId, siteConfig?.id]);

  const hasSentOpened = useRef(false);
  useEffect(() => {
    if (!hasSentOpened.current && siteConfig?.id) {
      sendWidgetEvent('widget_opened');
      hasSentOpened.current = true;
    }
  }, [siteConfig?.id, sendWidgetEvent]);

  const lastTrackedStep = useRef<Step | null>(null);
  useEffect(() => {
    if (lastTrackedStep.current === step || !siteConfig?.id) return;
    const stepNumberMap: Record<Step, number> = {
      landing: 1,
      accommodation: 2,
      extras: 3,
      summary: 4,
      success: 5
    };
    sendWidgetEvent(`widget_step_${stepNumberMap[step]}`);
    if (step === 'success' && paymentStatus === 'success') {
      sendWidgetEvent('complete', { reservationId });
    }
    lastTrackedStep.current = step;
  }, [step, paymentStatus, reservationId, sendWidgetEvent, siteConfig?.id]);

  // SW registration
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw-book.js').catch(() => {});
  }, []);

  // Load analytics config by ?site_id= — graceful: booking works without it
  useEffect(() => {
    const siteId = new URLSearchParams(window.location.search).get('site_id');
    if (!siteId) return;
    fetch(`/api/booking/site-config?slug=${encodeURIComponent(siteId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setSiteConfig({ id: data.id, fbPixelId: data.fbPixelId, ga4Id: data.ga4Id, tiktokPixelId: data.tiktokPixelId, returnUrl: data.returnUrl });
        if (data.fbPixelId) injectFbPixel(data.fbPixelId);
        if (data.ga4Id) injectGa4(data.ga4Id);
        if (data.tiktokPixelId) injectTiktokPixel(data.tiktokPixelId);
      })
      .catch(() => {});
  }, []);

  // Restore draft or read category from URL
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.accommodationType && parsed.checkIn) { setShowResume(true); setState(parsed); }
      }
    } catch { /* ignore */ }

    // Direct redirect from URL
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    if (category && ['glamping', 'buildings', 'camping'].includes(category)) {
      setState(s => ({ ...s, accommodationType: category as AccommodationType }));
      setStep('accommodation');
    }
  }, []);

  // Save draft
  useEffect(() => {
    if (step !== 'landing' && step !== 'success' && state.accommodationType) {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* */ }
    }
  }, [state, step]);

  // Check payment return URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment_status') || params.get('payment');
    const rid = params.get('reservation_id');
    const token = params.get('token');
    if (status === 'success') {
      setPaymentStatus('success'); if (rid) setReservationId(rid); if (token) setGuestPageToken(token);
      setStep('success');
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(CHECKOUT_CACHE_KEY);
      checkoutCacheRef.current = null;
      window.history.replaceState({}, '', '/book');
    } else if (status === 'failed' || status === 'cancel') {
      setPaymentStatus('failed');
      if (rid) setReservationId(rid);
      setStep('success');
      window.history.replaceState({}, '', '/book');
    }
  }, []);

  // Fire Purchase events + redirect to client domain on success
  useEffect(() => {
    if (!['success', 'admin_pending', 'terminal_pending'].includes(paymentStatus) || !siteConfig) return;
    const total = state.total + state.extras.reduce((s, e) => s + e.price, 0);
    const eventId = `booking_${reservationId || Date.now()}`;
    // Meta Pixel — Signal 1
    const fbq = (window as any).fbq;
    if (typeof fbq === 'function' && siteConfig.fbPixelId) {
      fbq('track', 'Purchase', { value: total, currency: 'CZK' }, { eventID: eventId });
    }
    // GA4
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function' && siteConfig.ga4Id) {
      gtag('event', 'purchase', { transaction_id: reservationId, value: total, currency: 'CZK' });
    }
    // TikTok Pixel
    const ttq = (window as any).ttq;
    if (typeof ttq?.track === 'function' && siteConfig.tiktokPixelId) {
      ttq.track('CompletePayment', { value: total, currency: 'CZK', content_id: reservationId || eventId });
    }
    if (siteConfig.returnUrl) {
      try {
        const url = new URL(siteConfig.returnUrl);
        url.searchParams.set('payment_status', 'success');
        url.searchParams.set('amount', String(total));
        url.searchParams.set('currency', 'CZK');
        if (reservationId) url.searchParams.set('reservation_id', reservationId);
        url.searchParams.set('event_id', eventId);
        
        if (state.checkIn) url.searchParams.set('checkin', state.checkIn);
        if (state.checkOut) url.searchParams.set('checkout', state.checkOut);
        if (state.accommodationType) url.searchParams.set('type', state.accommodationType);
        if (state.accommodationData) url.searchParams.set('options', JSON.stringify(state.accommodationData));
        if (state.contact?.name) url.searchParams.set('name', state.contact.name);
        if (state.contact?.phone) url.searchParams.set('phone', encodeURIComponent(state.contact.phone));
        if (state.contact?.email) url.searchParams.set('email', state.contact.email);
        if (guestPageToken) url.searchParams.set('guest_page_token', guestPageToken);

        setTimeout(() => { window.location.href = url.toString(); }, 800);
      } catch { /* invalid URL — stay on page */ }
    }
  }, [paymentStatus, siteConfig, state, guestPageToken, reservationId]);

  const resetAll = useCallback(() => {
    setState({ accommodationType: null, accommodationData: {}, extras: [], contact: null, total: 0, checkIn: '', checkOut: '', priceBreakdown: [] });
    setStep('landing'); setSubmitting(false); setPaymentStatus('pending');
    setReservationId(undefined); setGuestPageToken(undefined); setPaymentUrl(undefined); setQrCodeUrl(undefined);
    checkoutCacheRef.current = null;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CHECKOUT_CACHE_KEY);
  }, []);

  const goBack = () => { const idx = STEP_ORDER.indexOf(step); if (idx > 0) setStep(STEP_ORDER[idx - 1]); };
  const progressPct = ((STEP_ORDER.indexOf(step)) / (STEP_ORDER.length - 1)) * 100;

  // ─── UTM collector — reads from sessionStorage (set by kemp-carlsbad.cz) ──
  // (Moved outside the component)

  // ─── Create draft helper ──────────────────────────
  const createDraft = async (contact: { name: string; email: string; phone: string }) => {
    const extrasTotal = state.extras.reduce((s, e) => s + e.price, 0);
    const grandTotal = state.total + extrasTotal;
    const utmParams = getUtmParams();
    const resolvedSiteId = siteConfig?.id || new URLSearchParams(window.location.search).get('site_id') || 'kemp-carlsbad';
    
    const res = await fetch('/api/booking/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accommodation_type: state.accommodationType,
        accommodation_data: state.accommodationData,
        check_in: state.checkIn, check_out: state.checkOut,
        extras: state.extras, guest_name: contact.name,
        guest_email: contact.email, guest_phone: contact.phone,
        total_price: grandTotal, deposit_amount: grandTotal,
        // ── Attribution ──
        source: `widget:${resolvedSiteId}`,
        source_url: document.referrer || window.location.href,
        site_id: resolvedSiteId,
        booked_at: new Date().toISOString(),
        utm_params: Object.keys(utmParams).length > 0 ? utmParams : undefined,
      }),
    });
    const draft = await res.json();
    if (!res.ok) throw new Error(draft.error || 'Failed to create draft');
    return { draft, grandTotal };
  };

  // Create draft + Teya session once; reuse for both "Pay online" and "Show QR".
  const ensureCheckoutSession = async (contact: { name: string; email: string; phone: string }) => {
    if (checkoutCacheRef.current) return checkoutCacheRef.current;
    const { draft, grandTotal } = await createDraft(contact);
    const pmsResId = draft.reservation_id || draft.id;
    const desc = `Kemp Carlsbad — ${getAccommodationLabel(state)} — ${contact.name}`;
    // Preserve ?site_id= so analytics config reloads after Teya redirect
    const siteId = new URLSearchParams(window.location.search).get('site_id') || '';
    const siteParam = siteId ? `&site_id=${encodeURIComponent(siteId)}` : '';
    const returnPath = `/book?reservation_id=${pmsResId}&token=${draft.guest_page_token || ''}${siteParam}`;
    const checkoutRes = await fetch('/api/booking/checkout-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: grandTotal, currency: 'CZK', description: desc,
        reservation_id: pmsResId, return_path: returnPath,
        site_id: siteConfig?.id || siteId || 'kemp-carlsbad',
      }),
    });
    const checkout = await checkoutRes.json();
    if (!checkoutRes.ok) throw new Error(checkout.error || 'Payment system error');
    if (!checkout.session_url) throw new Error('Payment gateway did not return a session URL');

    const entry = {
      sessionUrl: checkout.session_url as string,
      pmsResId,
      guestPageToken: draft.guest_page_token as string | undefined,
    };
    checkoutCacheRef.current = entry;
    try { sessionStorage.setItem(CHECKOUT_CACHE_KEY, JSON.stringify({ ...entry, ts: Date.now() })); } catch { /* */ }
    return entry;
  };

  // ─── Pay Online (Teya) ────────────────────────────
  const handlePayOnline = async (contact: { name: string; email: string; phone: string }) => {
    setSubmitting(true); setState(s => ({ ...s, contact }));
    try {
      const { sessionUrl, pmsResId, guestPageToken: tok } = await ensureCheckoutSession(contact);
      setReservationId(pmsResId);
      if (tok) setGuestPageToken(tok);
      setPaymentUrl(sessionUrl);
      setPaymentStatus('pending'); setStep('success');
      // Open payment in new tab (user stays on QR/pending page)
      window.open(sessionUrl, '_blank');
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err: unknown) {
      console.error('[Booking]', err); setPaymentStatus('failed'); setStep('success');
    } finally { setSubmitting(false); }
  };

  // ─── Show QR for guest (same Teya session, no redirect) ───
  const handleShowQr = async (
    contact: { name: string; email: string; phone: string }
  ): Promise<{ url: string; reservationId: string } | null> => {
    setState(s => ({ ...s, contact }));
    try {
      const { sessionUrl, pmsResId, guestPageToken: tok } = await ensureCheckoutSession(contact);
      setReservationId(pmsResId);
      if (tok) setGuestPageToken(tok);
      setPaymentUrl(sessionUrl);
      return { url: sessionUrl, reservationId: pmsResId };
    } catch (err: unknown) {
      console.error('[Booking] QR error', err);
      alert(`Could not generate payment link: ${(err as Error)?.message || 'Unknown error'}`);
      return null;
    }
  };

  // QR modal polled /api/booking/drafts and detected payment_status='paid'.
  // Mirror the Teya redirect path so the success screen renders.
  const handleQrPaid = useCallback((rid: string) => {
    setReservationId(rid);
    setPaymentStatus('success');
    setStep('success');
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CHECKOUT_CACHE_KEY);
    checkoutCacheRef.current = null;
  }, []);

  // ─── Pay via Administrator (cash) ────────────────────────────────
  const handlePayAdmin = async (contact: { name: string; email: string; phone: string }) => {
    setSubmitting(true); setState(s => ({ ...s, contact }));
    try {
      // If a Teya checkout was already created (Pay online clicked first, or
      // QR generated), reuse its reservation so we don't end up with two
      // tentative reservations for the same guest.
      let pmsResId: string;
      let tok: string | undefined;
      if (checkoutCacheRef.current) {
        pmsResId = checkoutCacheRef.current.pmsResId;
        tok = checkoutCacheRef.current.guestPageToken;
      } else {
        const { draft } = await createDraft(contact);
        pmsResId = draft.reservation_id || draft.id;
        tok = draft.guest_page_token;
      }
      setReservationId(pmsResId);
      if (tok) setGuestPageToken(tok);
      setPaymentStatus('admin_pending'); setStep('success');
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err: unknown) {
      console.error('[Booking]', err); setPaymentStatus('failed'); setStep('success');
    } finally { setSubmitting(false); }
  };

  // ─── Pay via Terminal (card) ──────────────────────────────────
  const handlePayTerminal = async (contact: { name: string; email: string; phone: string }) => {
    setSubmitting(true); setState(s => ({ ...s, contact }));
    try {
      let pmsResId: string;
      let tok: string | undefined;
      if (checkoutCacheRef.current) {
        pmsResId = checkoutCacheRef.current.pmsResId;
        tok = checkoutCacheRef.current.guestPageToken;
      } else {
        const { draft } = await createDraft(contact);
        pmsResId = draft.reservation_id || draft.id;
        tok = draft.guest_page_token;
      }
      setReservationId(pmsResId);
      if (tok) setGuestPageToken(tok);
      setPaymentStatus('terminal_pending'); setStep('success');
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err: unknown) {
      console.error('[Booking]', err); setPaymentStatus('failed'); setStep('success');
    } finally { setSubmitting(false); }
  };

  // ─── Admin Confirm (cash) ────────────────────────────────
  const handleAdminConfirm = async (pin: string): Promise<{ ok: boolean; adminName?: string; error?: string }> => {
    if (!reservationId) return { ok: false, error: 'No reservation' };
    try {
      const res = await fetch('/api/booking/drafts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reservationId, reservation_id: reservationId, status: 'paid', admin_pin: pin, payment_method: 'cash' }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Error' };
      setPaymentStatus('success');
      return { ok: true, adminName: data.admin_name };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Network error' };
    }
  };

  // ─── Pay via Administrator in EUR (cash €) ───────────────────────
  const handlePayAdminEur = async (contact: { name: string; email: string; phone: string }) => {
    setSubmitting(true); setState(s => ({ ...s, contact }));
    try {
      let pmsResId: string;
      let tok: string | undefined;
      if (checkoutCacheRef.current) {
        pmsResId = checkoutCacheRef.current.pmsResId;
        tok = checkoutCacheRef.current.guestPageToken;
      } else {
        const { draft } = await createDraft(contact);
        pmsResId = draft.reservation_id || draft.id;
        tok = draft.guest_page_token;
      }
      setReservationId(pmsResId);
      if (tok) setGuestPageToken(tok);
      setPaymentStatus('admin_eur_pending'); setStep('success');
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err: unknown) {
      console.error('[Booking]', err); setPaymentStatus('failed'); setStep('success');
    } finally { setSubmitting(false); }
  };

  // ─── Terminal Confirm (card) ────────────────────────────────
  const handleTerminalConfirm = async (pin: string): Promise<{ ok: boolean; adminName?: string; error?: string }> => {
    if (!reservationId) return { ok: false, error: 'No reservation' };
    try {
      const res = await fetch('/api/booking/drafts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reservationId, reservation_id: reservationId, status: 'paid', admin_pin: pin, payment_method: 'terminal' }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Error' };
      setPaymentStatus('success');
      return { ok: true, adminName: data.admin_name };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Network error' };
    }
  };

  // ─── Admin EUR Confirm (cash €) ──────────────────────────
  const handleAdminEurConfirm = async (pin: string): Promise<{ ok: boolean; adminName?: string; error?: string }> => {
    if (!reservationId) return { ok: false, error: 'No reservation' };
    try {
      const res = await fetch('/api/booking/drafts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reservationId, reservation_id: reservationId, status: 'paid', admin_pin: pin, payment_method: 'cash_eur' }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Error' };
      setPaymentStatus('success');
      return { ok: true, adminName: data.admin_name };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Network error' };
    }
  };

  const nights = state.checkIn && state.checkOut ? getNightDates(state.checkIn, state.checkOut).length : 0;

  return (
    <div className="kc-root">
      {/* Price List Popup */}
      <PriceListPopup open={showPriceList} onClose={() => setShowPriceList(false)} prices={prices} />

      {/* Resume modal */}
      {showResume && (
        <div className="kc-resume-overlay" onClick={() => { setShowResume(false); resetAll(); }}>
          <div className="kc-resume-sheet" onClick={e => e.stopPropagation()}>
            <h3>Continue your booking?</h3>
            <p>You have an unfinished booking for {state.checkIn}. Would you like to continue?</p>
            <button className="kc-btn kc-btn-primary" onClick={() => { setShowResume(false); setStep('accommodation'); }} type="button" style={{ marginBottom: 8 }}>Continue booking</button>
            <button className="kc-btn kc-btn-secondary" onClick={() => { setShowResume(false); resetAll(); }} type="button">Start over</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="kc-header">
        <div>
          <div className="kc-header-brand">Kemp Carlsbad</div>
          <div className="kc-header-sub">Book your stay</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="kc-header-icon" onClick={() => setShowPriceList(true)} type="button" title="Price list">📋</button>
          <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" className="kc-header-help">💬 Help</a>
        </div>
      </header>

      <div className="kc-container">
        {/* Progress */}
        {step !== 'success' && (
          <div className="kc-progress">
            <div className="kc-progress-track"><div className="kc-progress-fill" style={{ width: `${progressPct}%` }} /></div>
            <div className="kc-progress-label">Step {STEP_ORDER.indexOf(step) + 1} of {STEP_ORDER.length - 1} · {STEP_LABELS[step]}</div>
          </div>
        )}

        {/* Back */}
        {step !== 'landing' && step !== 'success' && (
          <button className="kc-back" onClick={goBack} type="button">‹ Back</button>
        )}

        {/* Steps */}
        {step === 'landing' && (
          <StepLanding onSelect={(type) => { setState(s => ({ ...s, accommodationType: type })); setStep('accommodation'); }} />
        )}

        {step === 'accommodation' && state.accommodationType === 'glamping' && (
          <StepGlamping prices={prices} onNext={(data) => {
            const bd = [
              ...data.breakdown.map((n: {date: string; type: string; price: number}) => ({ label: `🏠 ${n.date} (${n.type === 'holiday' ? '⭐ Holiday' : 'Standard'})`, amount: n.price })),
              ...(data.touristTax > 0 ? [{ label: `🏛️ Tourist tax (${data.adults} × ${data.taxRate} Kč × ${data.nights} nights)`, amount: data.touristTax }] : []),
            ];
            // Extras step temporarily hidden — skip straight to summary
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, checkIn: data.checkIn, checkOut: data.checkOut, priceBreakdown: bd }));
            setStep('summary');
          }} />
        )}
        {step === 'accommodation' && state.accommodationType === 'buildings' && (
          <StepBuildings prices={prices} onNext={(data) => {
            const bd: { label: string; amount: number; isDiscount?: boolean }[] = [];
            if (data.accommodationSubtotal != null) bd.push({ label: `🏠 Accommodation`, amount: (data.accommodationSubtotal || 0) + (data.sleepingBagDiscount || 0) });
            if (data.sleepingBagDiscount != null && data.sleepingBagDiscount > 0) bd.push({ label: `🛌 Own sleeping bags`, amount: -data.sleepingBagDiscount, isDiscount: true });
            if (data.touristTax != null && data.touristTax > 0) bd.push({ label: `🏛️ Tourist tax (${data.adults} × ${data.taxRate} Kč × ${data.nights} nights)`, amount: data.touristTax });
            if (data.kauce != null && data.kauce > 0) bd.push({ label: `🔑 Security deposit (returnable)`, amount: data.kauce });
            // Extras step temporarily hidden — skip straight to summary
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, checkIn: data.checkIn, checkOut: data.checkOut, priceBreakdown: bd }));
            setStep('summary');
          }} />
        )}
        {step === 'accommodation' && state.accommodationType === 'camping' && (
          <StepCamping prices={prices} onNext={(data) => {
            // Extras step temporarily hidden — skip straight to summary
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, checkIn: data.checkIn, checkOut: data.checkOut }));
            setStep('summary');
          }} />
        )}

        {/* StepExtras temporarily hidden — uncomment to restore:
        {step === 'extras' && (
          <StepExtras
            accommodationType={state.accommodationType || ''}
            nights={nights}
            onNext={(extras) => { setState(s => ({ ...s, extras })); setStep('summary'); }}
            onSkip={() => { setState(s => ({ ...s, extras: [] })); setStep('summary'); }}
          />
        )}
        */}

        {step === 'summary' && (
          <StepSummary
            accommodationType={state.accommodationType || ''}
            accommodationLabel={getAccommodationLabel(state)}
            checkIn={state.checkIn} checkOut={state.checkOut}
            nights={nights} guests={getGuestsLabel(state)}
            total={state.total} extras={state.extras}
            priceBreakdown={state.priceBreakdown}
            onPayOnline={handlePayOnline} onPayAdmin={handlePayAdmin}
            onPayAdminEur={handlePayAdminEur}
            onPayTerminal={handlePayTerminal}
            onShowQr={handleShowQr}
            onQrPaid={handleQrPaid}
            submitting={submitting}
          />
        )}

        {step === 'success' && (
          <StepSuccess
            status={paymentStatus} reservationId={reservationId}
            accommodationLabel={getAccommodationLabel(state)}
            checkIn={state.checkIn} checkOut={state.checkOut}
            nights={nights} total={state.total}
            adults={(state.accommodationData.adults as number) || 1}
            guestEmail={state.contact?.email || null}
            guestPageToken={guestPageToken}
            paymentUrl={paymentUrl} qrCodeUrl={qrCodeUrl}
            onReset={resetAll}
            onAdminConfirm={handleAdminConfirm}
            onAdminEurConfirm={handleAdminEurConfirm}
            onTerminalConfirm={handleTerminalConfirm}
            onSuccess={handleQrPaid}
          />
        )}
      </div>

      {/* Footer */}
      {step !== 'success' && (
        <div className="kc-footer">© {new Date().getFullYear()} Kemp Carlsbad s.r.o. · Powered by ALiSiO</div>
      )}
    </div>
  );
}
