/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './guest-page.css';
import {
  type Lang, LANG_LABELS,
  getTranslations, detectLanguage, getBrandName,
  formatDateLocalized, formatPriceLocalized,
} from './translations';
import { translateContent } from './content-translations';
import { PaymentGateScreen } from '@/modules/guests/ui/PaymentGateScreen';
import { FarBeforeScreen } from '@/modules/guests/ui/FarBeforeScreen';

// ─── Helpers ────────────────────────────────────
function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dayOfStay(checkIn: string): number {
  const start = new Date(checkIn + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

type Phase = 'far_before' | 'before' | 'checkin_day' | 'during' | 'checkout';

const FAR_BEFORE_DAYS = 7;

const ALL_LANGS: Lang[] = ['en', 'de', 'cs', 'uk', 'pl', 'nl', 'fr'];

// ═════════════════════════════════════════════════
// BOTTOM SHEET
// ═════════════════════════════════════════════════
function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="gp-sheet-overlay" onClick={onClose} />
      <div className="gp-sheet">
        <div className="gp-sheet-handle" />
        <div className="gp-sheet-header">
          <h3 className="gp-sheet-title">{title}</h3>
          <button className="gp-sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="gp-sheet-body">{children}</div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════
// STORY BUBBLE
// ═════════════════════════════════════════════════
function StoryBubble({ emoji, label, active, onClick }: {
  emoji: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button className="gp-story-btn" onClick={onClick}>
      <div className={`gp-story-ring ${active ? 'active' : ''}`}>
        <div className="gp-story-inner">{emoji}</div>
      </div>
      <span className="gp-story-label">{label}</span>
    </button>
  );
}

// ═════════════════════════════════════════════════
// LIST ROW
// ═════════════════════════════════════════════════
function ListRow({ icon, label, value, valueClass, onClick, chevron = true, last = false }: {
  icon: string; label: string; value?: string; valueClass?: string;
  onClick?: (() => void) | null; chevron?: boolean; last?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`gp-list-row ${onClick ? 'clickable' : ''} ${last ? 'last' : ''}`} onClick={onClick || undefined}>
      <span className="gp-list-row-icon">{icon}</span>
      <span className="gp-list-row-label">{label}</span>
      {value && <span className={`gp-list-row-value ${valueClass || ''}`}>{value}</span>}
      {chevron && onClick && <span className="gp-list-row-chevron">›</span>}
    </Tag>
  );
}

// ═════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════
import { useParams } from 'next/navigation';

export default function GuestPage() {
  const params = useParams<{ token: string }>();
  const [token, setToken] = useState(params?.token || '');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [tab, setTab] = useState<'home' | 'services' | 'explore'>('home');
  const [sheet, setSheet] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [orderingService, setOrderingService] = useState<string | null>(null);
  const [widgetService, setWidgetService] = useState<'sauna' | 'tub' | 'breakfast' | null>(null);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  // ─── Cart ─────────────────────────────────────────────────
  interface CartItem {
    serviceId: string; serviceName: string; price: number;
    currency: string; quantity: number; icon: string;
    serviceDates?: string[]; // for breakfast-type: dates breakfast is needed
  }
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(false);

  // Breakfast date selection (per open service sheet)
  const [selectedBreakfastDates, setSelectedBreakfastDates] = useState<string[]>([]);

  // Registration state
  const [showReg, setShowReg] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [regCurrentGuest, setRegCurrentGuest] = useState(0); // 0-indexed: which guest is being registered
  const [regData, setRegData] = useState({
    fullName: '', email: '', phone: '', dateOfBirth: '',
    documentType: '', documentNumber: '', nationality: '', address: '', purposeOfStay: 'Tourism', visaNumber: ''
  });
  const [consent, setConsent] = useState(false);
  const [regLoading, setRegLoading] = useState(false);

  // WhatsApp number
  const WHATSAPP_NUMBER = '420723565616';

  // Weather state
  const [weather, setWeather] = useState<{ temp: number; desc: string; icon: string } | null>(null);

  // Set token from params
  useEffect(() => { if (params?.token) setToken(params.token); }, [params?.token]);

  // Fetch data
  useEffect(() => {
    if (!token) return;
    fetch(`/api/guest/${token}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(d => {
        setData(d);
        setLoading(false);
        if (d.expired) return;
        const guestCountry = d.registeredGuests?.[0]?.address || null;
        const guestPhone = d.reservation?.guest_phone || null;
        const detectedLang = detectLanguage(guestPhone, guestCountry);
        setLang(detectedLang);
        // Check for payment return
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const paymentStatus = urlParams.get('payment') || urlParams.get('payment_status');
          if (paymentStatus === 'success') {
            setTimeout(() => showToast('💳 ' + getTranslations(detectedLang).serviceOrdered), 500);
            // Clear cart after successful payment
            setCartItems([]);
            localStorage.removeItem(`cart_${token}`);
            window.history.replaceState({}, '', window.location.pathname);
            // #4 FIX: Refetch portal data so orderedServices updates to 'paid'
            fetch(`/api/guest/${token}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => { if (d && !d.error) setData(d); })
              .catch(() => {});
          } else if (paymentStatus === 'cancel' || paymentStatus === 'cancelled') {
            setTimeout(() => showToast(getTranslations(detectedLang).orderError, 'error'), 500);
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
        // Fetch weather if coords available
        const lat = d.guestPageConfig?.weather_lat;
        const lon = d.guestPageConfig?.weather_lon;
        if (lat && lon) {
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`)
            .then(r => r.ok ? r.json() : null)
            .then(w => {
              if (w?.current) {
                const code = w.current.weather_code;
                const icon = code <= 1 ? '☀️' : code <= 3 ? '⛅' : code <= 48 ? '☁️' : code <= 67 ? '🌧' : code <= 77 ? '❄️' : '⛈️';
                const desc = code <= 1 ? 'Clear' : code <= 3 ? 'Partly cloudy' : code <= 48 ? 'Cloudy' : code <= 67 ? 'Rain' : code <= 77 ? 'Snow' : 'Stormy';
                setWeather({ temp: Math.round(w.current.temperature_2m), desc, icon });
              }
            }).catch(() => {});
        }
        // Pre-fill reg
        if (d.registeredGuests?.length > 0) {
          const g = d.registeredGuests[0];
          setRegData({
            fullName: `${g.first_name || ''} ${g.last_name || ''}`.trim(),
            email: g.email || '', phone: g.phone || '',
            dateOfBirth: g.date_of_birth || '',
            documentType: g.document_type || '', documentNumber: g.document_number || '',
            nationality: g.nationality || '', address: g.address || '',
            purposeOfStay: g.purpose_of_stay || '', visaNumber: g.visa_number || '',
          });
        } else if (d.reservation) {
          // Pre-fill from reservation data (name, phone, email) — per spec
          const res = d.reservation;
          setRegData(prev => ({
            ...prev,
            fullName: prev.fullName || `${res.first_name || ''} ${res.last_name || ''}`.trim(),
            email: prev.email || res.guest_email || '',
            phone: prev.phone || res.guest_phone || '',
          }));
        }
      })
      .catch(() => { setError('notFound'); setLoading(false); });
  }, [token]);

  // ─── Cart: restore from localStorage ──────────────────────
  useEffect(() => {
    if (!token) return;
    try {
      const saved = localStorage.getItem(`cart_${token}`);
      if (saved) setCartItems(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [token]);

  // ─── Cart: persist to localStorage on change ───────────────
  useEffect(() => {
    if (!token) return;
    localStorage.setItem(`cart_${token}`, JSON.stringify(cartItems));
  }, [cartItems, token]);

  // ─── Cart: beforeunload abandon beacon ─────────────────────
  useEffect(() => {
    if (!token) return;
    const handleUnload = () => {
      if (cartItems.length === 0) return;
      const cartTotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
      try {
        // Blob with explicit Content-Type is required so Next.js request.json() can parse the body
        const payload = JSON.stringify({
          event_type: 'abandon',
          cart_total: cartTotal,
          items: cartItems,
          phase: data?.phase || null,
        });
        navigator.sendBeacon(
          `/api/guest/${token}/cart`,
          new Blob([payload], { type: 'application/json' }),
        );
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [token, cartItems, data?.phase]);

  // Translate DB content (stored in Ukrainian) to the active language.
  // Priority: static dictionary → server-side cache (DB + static fallback) → original.
  // Text is trimmed before all lookups to handle whitespace inconsistencies.
  const tc = useCallback((text: string): string => {
    if (!text || lang === 'uk') return text;
    const trimmed = text.trim();
    // 1. Static dictionary (instant, no network)
    const dictResult = translateContent(trimmed, lang);
    if (dictResult !== trimmed) return dictResult;
    // 2. Server-side cache returned by the API (includes static dict as fallback)
    const cached = data?.translations?.[trimmed]?.[lang];
    if (cached) return cached;
    // 3. Original text (Ukrainian) — only for truly custom untranslated content
    return text;
  }, [lang, data?.translations]);

  // Pick localised name/label from a service/menu-item object.
  // Priority: per-column (name_en, name_de…) → tc(name) → name
  const svcField = useCallback((obj: any, field: 'name' | 'description' | 'unit_label'): string => {
    if (!obj) return '';
    if (lang !== 'uk') {
      const colKey = `${field}_${lang}`;
      if (obj[colKey]) return obj[colKey];
    }
    return tc(obj[field] || '') || obj[field] || '';
  }, [lang, tc]);

  const t = getTranslations(lang);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Data derivatives ─────────────────────────
  const r = data?.reservation;
  const cfg = data?.guestPageConfig;
  const requiredGuests = r?.adults || 1;
  const registeredCount = data?.registeredGuests?.length || 0;
  const isRegistered = registeredCount >= requiredGuests;
  const catType = r?.category_type || 'resort';
  const brandName = data?.expired ? data.brandName : getBrandName(catType);

  // ─── isPaid ────────────────────────────────────
  const isPaid = r?.payment_status === 'paid'
    || r?.payment_status === 'prepaid'
    || (data?.payments?.remaining != null && data.payments.remaining <= 0);

  // ─── Days until check-in ────────────────────────
  const dLeft = r?.check_in ? daysUntil(r.check_in) : 0;

  const phase: Phase = (() => {
    if (!r) return 'before';
    const now = new Date();
    const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
    const checkIn = new Date(r.check_in + 'T00:00:00');
    const checkOut = new Date(r.check_out + 'T00:00:00');
    if (today.getTime() === checkOut.getTime()) return 'checkout';
    if (today.getTime() === checkIn.getTime()) return 'checkin_day';
    if (today > checkIn && today < checkOut) return 'during';
    if (dLeft > FAR_BEFORE_DAYS) return 'far_before';
    return 'before';
  })();

  // ─── Service ordering (with Teya payment) ─────
  const payInProgress = useRef(false);
  const handleOrderService = async (serviceId: string, serviceDates?: string[]) => {
    if (payInProgress.current) return; // W3: prevent double-click
    payInProgress.current = true;
    setOrderingService(serviceId);
    try {
      const res = await fetch(`/api/guest/${token}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, quantity: serviceDates?.length || 1, serviceDates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Payment error');
      }
      const result = await res.json();
      if (result.session_url) {
        // Redirect to Teya payment page
        window.location.href = result.session_url;
        return;
      }
      // Fallback: if no session_url, treat as simple order
      setSheet(null); setSelectedService(null);
      showToast(t.serviceOrdered);
    } catch (err: any) {
      showToast(err.message || t.orderError, 'error');
    }
    payInProgress.current = false;
    setOrderingService(null);
  };

  // ─── Cart handlers ─────────────────────────────
  const logCartEvent = (eventType: string, serviceId?: string, qty?: number, cartTotal?: number) => {
    const phase = data?.phase || null;
    fetch(`/api/guest/${token}/cart`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType, service_id: serviceId, quantity: qty,
        cart_total: cartTotal, phase,
        items: eventType === 'checkout' ? cartItems : undefined,
      }),
    }).catch(() => {});
  };

  const addToCart = (svc: any, datesOverride?: string[]) => {
    // #6 FIX: Block mixing different currencies in one cart
    if (cartItems.length > 0 && svc.currency && svc.currency !== cartItems[0].currency) {
      showToast(`Cannot mix ${svc.currency} and ${cartItems[0].currency} in one cart`, 'error');
      return;
    }
    const dateMode = getServiceDateMode(svc);
    let serviceDates: string[];
    if (datesOverride) {
      serviceDates = datesOverride;
    } else if (dateMode === 'breakfast' && r) {
      const breakfastDays = getBreakfastDays(r.check_in, r.check_out);
      if (breakfastDays.length === 1) {
        serviceDates = breakfastDays;
      } else {
        if (selectedBreakfastDates.length === 0) {
          showToast('Please select at least one breakfast date', 'error');
          return;
        }
        serviceDates = selectedBreakfastDates;
      }
    } else {
      serviceDates = r ? [r.check_in] : [];
    }
    const qty = serviceDates.length || 1;
    const serviceName = svcField(svc, 'name');
    setCartItems(prev => {
      const existing = prev.find(i => i.serviceId === svc.id);
      if (existing) return prev; // already in cart
      return [...prev, { serviceId: svc.id, serviceName, price: svc.price, currency: svc.currency || 'Kč', quantity: qty, icon: svc.icon || '✨', serviceDates }];
    });
    setSheet(null); setSelectedService(null); setSelectedBreakfastDates([]);
    showToast(t.addedToCart);
    logCartEvent('add', svc.id, qty);
  };

  const removeFromCart = (serviceId: string) => {
    setCartItems(prev => {
      const item = prev.find(i => i.serviceId === serviceId);
      logCartEvent('remove', serviceId, item?.quantity);
      return prev.filter(i => i.serviceId !== serviceId);
    });
  };

  const updateCartQty = (serviceId: string, delta: number) => {
    setCartItems(prev => prev.reduce<CartItem[]>((acc, item) => {
      if (item.serviceId !== serviceId) return [...acc, item];
      const newQty = item.quantity + delta;
      // For breakfast items with multiple serviceDates, removing means removing the whole item
      const minQty = item.serviceDates && item.serviceDates.length > 1 ? item.serviceDates.length : 1;
      if (newQty < minQty) { logCartEvent('remove', serviceId, item.quantity); return acc; }
      return [...acc, { ...item, quantity: newQty }];
    }, []));
  };

  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  // cartCount = number of distinct service lines (not total qty), for FAB badge readability
  const cartCount = cartItems.length;

  const handleCartPay = async () => {
    if (cartItems.length === 0 || cartLoading) return;
    setCartLoading(true);
    setSheet(null); // #12 FIX: Close sheet immediately for better UX
    logCartEvent('checkout', undefined, undefined, cartTotal);
    try {
      const res = await fetch(`/api/guest/${token}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems.map(i => ({
            serviceId: i.serviceId,
            quantity: i.quantity,
            serviceDates: i.serviceDates,
          }))
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Payment error'); }
      const result = await res.json();
      if (result.session_url) { window.location.href = result.session_url; return; }
      showToast(t.serviceOrdered);
    } catch (err: any) {
      showToast(err.message || t.orderError, 'error');
    }
    setCartLoading(false);
  };

  // ─── Registration submit (one guest at a time) ──
  const handleRegSubmit = async () => {
    setRegLoading(true);
    try {
      const nameParts = regData.fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      // Collect all previously registered guests + this new one
      const VALID_DOC_TYPES = ['id_card', 'passport', 'driving_license', 'other'];
      const existingGuests = (data?.registeredGuests || []).map((g: any) => ({
        firstName: g.first_name, lastName: g.last_name,
        dateOfBirth: g.date_of_birth || null, address: g.address || null,
        nationality: g.nationality || null,
        documentType: VALID_DOC_TYPES.includes(g.document_type) ? g.document_type : 'other',
        documentNumber: g.document_number || null,
        purposeOfStay: g.purpose_of_stay || 'Tourism',
        visaNumber: g.visa_number || null,
      }));
      const allGuests = [...existingGuests, {
        firstName, lastName,
        dateOfBirth: regData.dateOfBirth, address: regData.address,
        nationality: regData.nationality,
        documentType: regData.documentType,
        documentNumber: regData.documentNumber,
        purposeOfStay: regData.purposeOfStay || 'Tourism',
        visaNumber: regData.visaNumber || '',
      }];
      const res = await fetch(`/api/guest/${token}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guests: allGuests }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Registration failed');
      }
      const result = await res.json();
      setData((prev: any) => ({ ...prev, registeredGuests: result.registeredGuests }));
      const newCount = result.registeredGuests?.length || 0;
      if (newCount >= requiredGuests) {
        // All guests registered
        setShowReg(false);
        showToast(t.regSaved);
      } else {
        // More guests to register — reset form for next guest
        setRegCurrentGuest(newCount);
        setRegStep(1);
        setRegData({ fullName: '', email: '', phone: '', dateOfBirth: '', documentType: '', documentNumber: '', nationality: '', address: '', purposeOfStay: 'Tourism', visaNumber: '' });
        setConsent(false);
        showToast(`✅ ${t.guestReg} ${newCount}/${requiredGuests}`);
      }
    } catch { showToast(t.regError, 'error'); }
    setRegLoading(false);
  };

  // ─── WhatsApp helper ──────────────────────────
  const openWhatsApp = useCallback(() => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank');
  }, []);

  // ─── Service widget injection ─────────────────
  useEffect(() => {
    if (!widgetService || !widgetContainerRef.current) return;
    const container = widgetContainerRef.current;
    container.innerHTML = '';

    const widgetId = 'alisio-service-widget-popup';
    const widgetDiv = document.createElement('div');
    widgetDiv.id = widgetId;
    container.appendChild(widgetDiv);

    // Use a unique nonce so the IIFE can find the right script tag
    const nonce = 'asw-' + Date.now();
    const script = document.createElement('script');
    script.src = '/widget/service-embed.js';
    script.setAttribute('data-service', widgetService);
    script.setAttribute('data-lang', lang);
    script.setAttribute('data-color', '#1a1a2e');
    script.setAttribute('data-container', widgetId);
    script.setAttribute('data-nonce', nonce);
    if (r?.id) script.setAttribute('data-reservation', r.id);
    if (r?.check_in) script.setAttribute('data-checkin', r.check_in);
    if (r?.check_out) script.setAttribute('data-checkout', r.check_out);
    if (widgetService === 'sauna') script.setAttribute('data-promo', 'GLAMPING');
    container.appendChild(script);

    return () => { container.innerHTML = ''; };
  }, [widgetService, lang, r?.id]);

  // Helper: detect if a service should open as widget popup
  const getWidgetType = useCallback((svc: any): 'sauna' | 'tub' | 'breakfast' | null => {
    if (!svc) return null;
    // Primary: use service_type + name matching
    const name = ((svc.name || '') + ' ' + (svc.name_en || '') + ' ' + (svc.id || '')).toLowerCase();
    if (name.includes('саун') || name.includes('sauna')) return 'sauna';
    if (name.includes('купіль') || name.includes('чан') || name.includes('tub') || name.includes('pool') || name.includes('plunge') || name.includes('kád') || name.includes('lázeň')) return 'tub';
    // Fallback: use service_type
    if (svc.service_type === 'menu_selection') return 'breakfast';
    return null;
  }, []);

  // Helper: date mode for simple services (no widget)
  // 'breakfast' = show day-after-checkin dates; 'checkin' = auto assign check-in date
  function getServiceDateMode(svc: any): 'breakfast' | 'checkin' {
    const name = ((svc.name || '') + ' ' + (svc.name_en || '')).toLowerCase();
    if (
      name.includes('сніданок') || name.includes('сніданк') ||
      name.includes('breakfast') || name.includes('snídaně') ||
      name.includes('frühstück') || name.includes('petit-déjeuner')
    ) return 'breakfast';
    return 'checkin';
  }

  // Helper: compute available breakfast days
  // Breakfast is served the morning AFTER each overnight stay.
  // e.g. check_in 25th, check_out 27th (2 nights) → breakfast on 26th and 27th
  function getBreakfastDays(checkIn: string, checkOut: string): string[] {
    const days: string[] = [];
    const cur = new Date(checkIn + 'T00:00:00');
    const end = new Date(checkOut + 'T00:00:00');
    cur.setDate(cur.getDate() + 1); // first breakfast = morning after first night
    while (cur <= end) {
      days.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  // ─── LOADING / ERROR ──────────────────────────
  if (loading) return (
    <div className="gp-root"><div className="gp-loading"><div className="gp-spinner" /><span>{t.loading}</span></div></div>
  );
  if (error || !data) return (
    <div className="gp-root"><div className="gp-error"><div className="gp-error-icon">🔍</div><h2>{t.notFound}</h2><p>{t.notFoundDesc}</p></div></div>
  );

  // ─── POST-STAY (expired) ──────────────────────
  if (data.expired) {
    return <PostStayPage data={data} lang={lang} setLang={setLang} />;
  }

  // ─── PAYMENT GATE ─────────────────────────────
  if (!isPaid) {
    return (
      <div className="gp-root">
        <PaymentGateScreen data={data} t={t} lang={lang} setLang={setLang} token={token} />
      </div>
    );
  }

  // ─── FAR BEFORE ───────────────────────────────
  if (phase === 'far_before') {
    return (
      <div className="gp-root">
        <FarBeforeScreen
          data={data} t={t} lang={lang} dLeft={dLeft}
          isRegistered={isRegistered}
          onRegisterClick={() => {
            const rc = data?.registeredGuests?.length || 0;
            setRegCurrentGuest(rc);
            setRegData({ fullName: '', email: '', phone: '', dateOfBirth: '', documentType: '', documentNumber: '', nationality: '', address: '', purposeOfStay: 'Tourism', visaNumber: '' });
            setShowReg(true);
          }}
          checkInTime={r?.check_in_time}
          checkOutTime={r?.check_out_time}
        />

        {/* Registration overlay — must be rendered here because far_before does an early return */}
        {showReg && (
          <div className="gp-reg-overlay">
            <div className="gp-reg-header">
              <button className="gp-reg-back" onClick={() => {
                if (regStep === 1) setShowReg(false);
                else setRegStep(s => s - 1);
              }}>{regStep === 1 ? '✕' : t.back}</button>
              <span className="gp-reg-step">{requiredGuests > 1 ? `${t.guest} ${regCurrentGuest + 1}/${requiredGuests} · ` : ''}{t.stepOf(regStep, 3)}</span>
              <div style={{ width: 48 }} />
            </div>
            <div className="gp-reg-progress">
              <div className="gp-reg-progress-fill" style={{ width: `${(regStep / 3) * 100}%` }} />
            </div>

            <div className="gp-reg-body">
              {/* Step 1: Guest Details */}
              {regStep === 1 && (
                <>
                  <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{t.step1Title}</h2>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.fullName} *</div>
                    <input className="gp-field-input" value={regData.fullName} autoComplete="off"
                      onChange={e => setRegData(d => ({ ...d, fullName: e.target.value }))} />
                  </div>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.email} *</div>
                    <input className="gp-field-input" type="email" value={regData.email} autoComplete="email"
                      onChange={e => setRegData(d => ({ ...d, email: e.target.value }))} />
                  </div>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.phone}</div>
                    <input className="gp-field-input" type="tel" value={regData.phone} autoComplete="tel"
                      onChange={e => setRegData(d => ({ ...d, phone: e.target.value }))} />
                    <div className="gp-field-hint">{t.phoneHint}</div>
                  </div>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.dateOfBirth} *</div>
                    <input className="gp-field-input" type="date" value={regData.dateOfBirth} autoComplete="bday"
                      onChange={e => setRegData(d => ({ ...d, dateOfBirth: e.target.value }))} />
                  </div>
                </>
              )}

              {/* Step 2: ID Document */}
              {regStep === 2 && (
                <>
                  <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t.step2Title}</h2>
                  <p style={{ fontSize: 14, color: 'var(--gp-sub)', marginBottom: 16 }}>{t.step2Why}</p>
                  <div className="gp-security-notice">{t.securityNotice}</div>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.documentType} *</div>
                    <select className="gp-field-input" value={regData.documentType}
                      onChange={e => setRegData(d => ({ ...d, documentType: e.target.value }))}>
                      <option value="">{t.selectDoc}</option>
                      <option value="passport">{t.passportDoc}</option>
                      <option value="id_card">{t.idCardDoc}</option>
                      <option value="driving_license">{t.drivingLicenseDoc}</option>
                    </select>
                  </div>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.documentNumber} *</div>
                    <input className="gp-field-input" value={regData.documentNumber}
                      onChange={e => setRegData(d => ({ ...d, documentNumber: e.target.value }))} />
                  </div>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.nationality} *</div>
                    <input className="gp-field-input" value={regData.nationality} autoComplete="country-name"
                      placeholder="DEU, CZE, UKR..."
                      onChange={e => setRegData(d => ({ ...d, nationality: e.target.value }))} />
                  </div>
                  <div className="gp-field">
                    <div className="gp-field-label">{t.permanentAddress} *</div>
                    <input className="gp-field-input" value={regData.address} autoComplete="street-address"
                      placeholder="München, Germany"
                      onChange={e => setRegData(d => ({ ...d, address: e.target.value }))} />
                  </div>
                </>
              )}

              {/* Step 3: Confirm */}
              {regStep === 3 && (
                <>
                  <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{t.step3Title}</h2>
                  <div className="gp-confirm-table">
                    {[
                      [t.fullName, regData.fullName],
                      [t.email, regData.email],
                      [t.phone, regData.phone || '—'],
                      [t.dateOfBirth, regData.dateOfBirth],
                      [t.documentType, regData.documentType],
                      [t.documentNumber, regData.documentNumber],
                      [t.nationality, regData.nationality],
                      [t.permanentAddress, regData.address],
                    ].map(([label, value], i) => (
                      <div key={i} className="gp-confirm-row">
                        <span className="gp-confirm-label">{label}</span>
                        <span className="gp-confirm-value">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="gp-field" style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <input 
                      type="checkbox" 
                      id="gdpr-consent" 
                      checked={consent} 
                      onChange={(e) => setConsent(e.target.checked)} 
                      style={{ marginTop: '4px', width: '18px', height: '18px' }}
                    />
                    <label htmlFor="gdpr-consent" style={{ fontSize: '13px', color: 'var(--gp-sub)', lineHeight: '1.4' }}>
                      Souhlasím se zpracováním osobních údajů pro účely ubytování, vedení evidenční knihy a plnění zákonných povinností dle <a href="/privacy" target="_blank" style={{ color: 'var(--gp-primary)', textDecoration: 'underline' }}>Zásad ochrany osobních údajů</a>.
                    </label>
                  </div>
                  <div className="gp-confirm-success">{t.confirmNotice}</div>
                </>
              )}
            </div>

            <div className="gp-reg-footer">
              {regStep < 3 ? (
                <button className="gp-btn gp-btn-primary" onClick={() => {
                  if (regStep === 1) {
                    if (!regData.fullName.trim() || !regData.email.trim() || !regData.dateOfBirth) {
                      showToast(t.regError, 'error'); return;
                    }
                  }
                  if (regStep === 2) {
                    if (!regData.documentType || !regData.documentNumber.trim() || !regData.nationality.trim() || !regData.address.trim()) {
                      showToast(t.regError, 'error'); return;
                    }
                  }
                  setRegStep(s => s + 1);
                }}>
                  {t.continue_}
                </button>
              ) : (
                <button className="gp-btn gp-btn-primary" onClick={handleRegSubmit} disabled={regLoading || !consent}>
                  {regLoading ? '...' : t.confirmReg}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`gp-toast ${toast.type === 'error' ? 'gp-toast-error' : ''}`}>{toast.msg}</div>
        )}
      </div>
    );
  }


  // ─── Data derivatives ─────────────────────────
  const amenities = parseJSON<any[]>(cfg?.amenities, []);
  const rules = parseJSON<any[]>(cfg?.rules, []);
  const usefulInfoList = parseJSON<any[]>(cfg?.useful_info, []);
  const faqItems = parseJSON<any[]>(cfg?.faq_items, []);
  const guestName = `${r.first_name || ''} ${(r.last_name || '').charAt(0)}.`.trim();
  const currentDay = dayOfStay(r.check_in);
  const unitName = r.unit_name || r.unit_type_name || 'Your cabin';

  // Stage message
  const stageMsg = (() => {
    if (phase === 'before') return t.daysToGo(Math.max(1, dLeft));
    if (phase === 'checkin_day') return t.todayIsTheDay;
    if (phase === 'during') return t.enjoyDay(currentDay);
    return t.checkoutToday;
  })();

  // ═════════════════════════════════════════════════
  return (
    <div className="gp-root">

      {/* ════ HOME TAB ════ */}
      {tab === 'home' && (
        <div className="gp-tab-content">

          {/* ── WALLET CARD ── */}
          <div className="gp-wallet">
            <div className="gp-wallet-texture" />
            <div className="gp-wallet-content">
              <div className="gp-wallet-top">
                <div>
                  <div className="gp-wallet-brand">{brandName}</div>
                  <div className="gp-wallet-title">{unitName}</div>
                </div>
                <div className="gp-wallet-langs">
                  {ALL_LANGS.map(l => (
                    <button key={l} className={`gp-lang-pill ${l === lang ? 'active' : ''}`}
                      onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
                  ))}
                </div>
              </div>

              <div className="gp-wallet-dates">
                <div className="gp-wallet-dates-col">
                  <div className="gp-wallet-date-label">{t.checkIn}</div>
                  <div className="gp-wallet-date-value">{formatDateLocalized(r.check_in, lang)} · {r.check_in_time || '15:00'}</div>
                </div>
                <div className="gp-wallet-dates-col">
                  <div className="gp-wallet-date-label">{t.nights}</div>
                  <div className="gp-wallet-date-value">{r.nights}</div>
                </div>
                <div className="gp-wallet-dates-col">
                  <div className="gp-wallet-date-label">{t.checkOut}</div>
                  <div className="gp-wallet-date-value">{formatDateLocalized(r.check_out, lang)} · {r.check_out_time || '11:00'}</div>
                </div>
              </div>

              <div className="gp-wallet-bottom">
                <div className="gp-wallet-status">{stageMsg}</div>
                <div className="gp-wallet-guest">{guestName}</div>
              </div>
            </div>
          </div>

          {/* ── STORIES ROW ── */}
          <div className="gp-stories">
            <StoryBubble emoji="📍" label={t.directions} active onClick={() => setSheet('directions')} />
            <StoryBubble emoji="🔑" label={t.entry} active onClick={() => {
              if (!isRegistered) { setSheet('reg-required'); return; }
              setSheet('entry');
            }} />
            <StoryBubble emoji="📶" label={t.wifi} active onClick={() => setSheet('wifi')} />
            <StoryBubble emoji="🅿️" label={t.parking} active onClick={() => setSheet('parking')} />
            {cfg?.restaurant_name && (
              <StoryBubble emoji="🍽" label={t.restaurant} active={false} onClick={() => setSheet('restaurant')} />
            )}

          </div>

          {/* ── ACTION CARD (registration required — always visible until complete) ── */}
          {!isRegistered && (
            <div className="gp-action-card">
              <div className="gp-action-card-top">
                <div className="gp-action-badge">!</div>
                <div>
                  <div className="gp-action-title">{t.completeReg}</div>
                  <div className="gp-action-desc">{registeredCount > 0 ? `${registeredCount}/${requiredGuests} ${t.done}` : t.regMinutes}</div>
                </div>
              </div>
              <button className="gp-btn gp-btn-primary" onClick={() => { setRegCurrentGuest(registeredCount); setRegData({ fullName: '', email: '', phone: '', dateOfBirth: '', documentType: '', documentNumber: '', nationality: '', address: '', purposeOfStay: 'Tourism', visaNumber: '' }); setShowReg(true); }}>
                {registeredCount > 0 ? `${t.startReg} (${registeredCount + 1}/${requiredGuests})` : t.startReg}
              </button>
            </div>
          )}

          {/* ── WEATHER (real API) ── */}
          {weather && (phase === 'during' || phase === 'checkin_day') && (
            <div className="gp-weather">
              <span className="gp-weather-icon">{weather.icon}</span>
              <div>
                <div className="gp-weather-title">{weather.temp}°C · {weather.desc}</div>
                <div className="gp-weather-desc">{t.greatDay}</div>
              </div>
            </div>
          )}

          {/* ── STAGE-BASED ACTIONS ── */}
          <div className="gp-section">
            <div className="gp-section-title">
              {phase === 'checkout' ? t.beforeYouLeave : phase === 'before' ? t.gettingReady : t.yourStay}
            </div>
            <div className="gp-list-card">
              {phase === 'before' && <>
                <ListRow icon="✅" label={t.bookingConfirmed} chevron={false} />
                <ListRow icon={isRegistered ? '✅' : '⚠️'} label={t.guestReg}
                  value={isRegistered ? t.done : `${registeredCount}/${requiredGuests}`}
                  valueClass={isRegistered ? '' : 'required'}
                  onClick={isRegistered ? null : () => { setRegCurrentGuest(registeredCount); setRegData({ fullName: '', email: '', phone: '', dateOfBirth: '', documentType: '', documentNumber: '', nationality: '', address: '', purposeOfStay: 'Tourism', visaNumber: '' }); setShowReg(true); }} />
                <ListRow icon={isRegistered ? '🔑' : '🔒'} label={t.entryInstructions}
                  value={isRegistered ? '' : formatDateLocalized(r.check_in, lang)}
                  onClick={isRegistered ? () => setSheet('entry') : () => setSheet('reg-required')}
                  last />
              </>}
              {phase === 'checkin_day' && <>
                <ListRow icon="✅" label={t.regComplete} chevron={false} />
                <ListRow icon="🔑" label={t.entryInstructions} onClick={() => setSheet('entry')} />
                <ListRow icon="📍" label={t.howToGetHere} onClick={() => setSheet('directions')} last />
              </>}
              {phase === 'during' && <>
                {data.services?.slice(0, 3).map((svc: any, i: number) => {
                  const wType = getWidgetType(svc);
                  return (
                    <ListRow key={svc.id} icon={svc.icon || '✨'} label={svcField(svc, 'name')}
                      onClick={() => {
                        if (wType) { setWidgetService(wType); }
                        else { setSelectedService(svc); setSheet('service'); }
                      }}
                      last={i === Math.min(2, (data.services?.length || 1) - 1)} />
                  );
                })}
              </>}
              {phase === 'checkout' && (() => {
                const lateService = data.services?.find((s: any) => {
                  const n = ((s.name || '') + ' ' + (s.name_en || '') + ' ' + (s.id || '')).toLowerCase();
                  return n.includes('late') || n.includes('check-out') || n.includes('пізній');
                });
                return <>
                  <ListRow icon="☐" label={t.closeWindows} chevron={false} />
                  <ListRow icon="☐" label={t.keyInLockbox} chevron={false} />
                  <ListRow icon="⏰" label={t.lateCheckout}
                    value={lateService ? formatPriceLocalized(lateService.price, lateService.currency) : ''}
                    onClick={lateService ? () => { setSelectedService(lateService); setSheet('service'); } : undefined}
                    last />
                </>;
              })()}
            </div>
          </div>

          {/* ── GOOD TO KNOW ── */}
          <div className="gp-section">
            <div className="gp-section-title">{t.goodToKnow}</div>
            <div className="gp-list-card gp-list-card-padded">
              <ListRow icon="🕐" label={t.checkInTime} value={r.check_in_time || '15:00'} chevron={false} />
              <ListRow icon="🕚" label={t.checkOutTime} value={r.check_out_time || '11:00'} chevron={false} />
              {cfg?.wifi_password && (
                <ListRow icon="📶" label={t.wifiLabel} value={t.tapToCopy}
                  onClick={() => { navigator.clipboard?.writeText(cfg.wifi_password); setSheet('wifi'); }} />
              )}
              <ListRow icon="🐕" label={t.pets}
                value={cfg?.pets_policy === 'not_allowed' ? t.petsNotAllowed : cfg?.pets_policy === 'with_fee' ? t.petsWithFee : t.petsWelcome}
                chevron={false} />
              {r.property_phone && (
                <ListRow icon="📞" label={t.support} value={r.property_phone} chevron={false} last />
              )}
            </div>
          </div>

          {/* ── YOUR CABIN (amenities) ── */}
          {amenities.length > 0 && (
            <div className="gp-section">
              <div className="gp-section-title">{t.yourCabin}</div>
              <div className="gp-list-card" style={{ padding: 16 }}>
                <div className="gp-amenity-grid">
                  {amenities.map((am: any, i: number) => {
                    return <span key={i} className="gp-amenity-chip">{am.icon} {tc(am.name)}</span>;
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── HOUSE RULES ── */}
          {rules.length > 0 && (
            <div className="gp-section">
              <div className="gp-rules-compact">
                <div className="gp-rules-title">{t.houseRules}</div>
                <div className="gp-rules-chips">
                  {rules.map((rule: any, i: number) => (
                    <span key={i} className="gp-rule-chip">{rule.icon} {tc(rule.text)}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FAQ (accordion) ── */}
          {faqItems.length > 0 && (
            <div className="gp-section">
              <div className="gp-section-title">{t.faqTitle}</div>
              <div className="gp-list-card" style={{ padding: '4px 16px' }}>
                {faqItems.map((faq: any, i: number) => (
                  <details key={i} className="gp-faq-item">
                    <summary className="gp-faq-q">{tc(faq.q || '')}</summary>
                    <div className="gp-faq-a">{tc(faq.a || '')}</div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* ── CHECKOUT FEEDBACK ── */}
          {phase === 'checkout' && (
            <div className="gp-section">
              <FeedbackForm t={t} token={token} showToast={showToast} />
            </div>
          )}
        </div>
      )}

      {/* ════ SERVICES TAB ════ */}
      {tab === 'services' && (
        <div className="gp-tab-pad">
          <div className="gp-tab-title">{t.servicesTitle}</div>
          <div className="gp-tab-subtitle">{t.servicesSubtitle}</div>

          {/* ── MY ORDERS SECTION ── */}
          {(() => {
            const now = Date.now();
            const PENDING_TTL_MS = 60 * 60 * 1000; // 60 min
            const visibleOrders = (data.orderedServices || []).filter((o: any) => {
              if (o.payment_status === 'paid') return true;
              if (o.payment_status === 'refunded') return true;
              if (o.payment_status === 'pending') {
                const age = now - new Date(o.created_at + 'Z').getTime();
                return age < PENDING_TTL_MS;
              }
              return false; // failed → hidden
            });
            if (!visibleOrders.length) return null;

            // Group by service_id + payment_status to merge multi-date breakfast rows
            const grouped: Map<string, any> = new Map();
            for (const o of visibleOrders) {
              const key = `${o.service_id}_${o.payment_status}`;
              if (grouped.has(key)) {
                const existing = grouped.get(key);
                existing.quantity += o.quantity;
                existing.total_price += o.total_price || 0;
                if (o.service_date) existing._dates = [...(existing._dates || []), o.service_date];
              } else {
                grouped.set(key, {
                  ...o,
                  _dates: o.service_date ? [o.service_date] : [],
                });
              }
            }

            return (
              <div className="gp-orders-section">
                <div className="gp-orders-title">{t.ordersTitle}</div>
                {[...grouped.values()].map((o: any) => {
                  const name = o.name_en && lang !== 'uk' ? o.name_en : (o.service_name || '?');
                  const dateLabel = o._dates?.length > 0
                    ? o._dates.map((d: string) => formatDateLocalized(d, lang)).join(', ')
                    : formatDateLocalized(r.check_in, lang);
                  const priceLabel = `${(o.total_price || 0).toFixed(0)} ${o.currency || 'Kč'}`;
                  const statusClass = o.payment_status === 'paid' ? 'paid' : o.payment_status === 'refunded' ? 'refunded' : 'pending';
                  const statusLabel = o.payment_status === 'paid' ? '✅ ' + t.done :
                    o.payment_status === 'refunded' ? t.orderRefunded : t.awaitingPayment;
                  return (
                    <div key={`${o.id}_${o.payment_status}`} className="gp-order-card">
                      <div className="gp-order-icon">{o.service_icon || '✨'}</div>
                      <div className="gp-order-info">
                        <div className="gp-order-name">{name}{o.quantity > 1 ? ` ×${o.quantity}` : ''}</div>
                        <div className="gp-order-meta">{dateLabel} · {priceLabel}</div>
                      </div>
                      <div className={`gp-order-status ${statusClass}`}>{statusLabel}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {data.services?.length > 0 ? data.services.map((svc: any) => {
            const isOrdered = data.orderedServices?.some((o: any) => o.service_id === svc.id);
            const wType = getWidgetType(svc);
            return (
              <button key={svc.id}
                className={svc.photo_url ? 'gp-service-card gp-service-card--photo' : 'gp-service-card'}
                onClick={() => {
                  if (wType) { setWidgetService(wType); }
                  else { setSelectedService(svc); setSheet('service'); }
                }}>
                {svc.photo_url ? (
                  <div className="gp-service-photo">
                    <img src={svc.photo_url} alt={svcField(svc, 'name')} />
                    {isOrdered && <span className="gp-service-badge">✅</span>}
                  </div>
                ) : (
                  <div className="gp-service-emoji">{svc.icon || '✨'}</div>
                )}
                <div className="gp-service-info">
                  <div className="gp-service-name">
                    {svcField(svc, 'name')}
                    {!svc.photo_url && isOrdered && ' ✅'}
                  </div>
                  <div className="gp-service-desc">{svcField(svc, 'description')}</div>
                </div>
                <div className="gp-service-price-col">
                  <div className="gp-service-price">{formatPriceLocalized(svc.price, svc.currency)}</div>
                  {svc.unit_label && <div className="gp-service-per">/{svcField(svc, 'unit_label')}</div>}
                </div>
              </button>
            );
          }) : (
            <div className="gp-empty-state">
              <div className="gp-empty-icon">✨</div>
              <div className="gp-empty-text">{t.noServices}</div>
            </div>
          )}

          {/* Restaurant */}
          {cfg?.restaurant_name && (
            <div className="gp-restaurant">
              <div className="gp-restaurant-title">🍽 {tc(cfg.restaurant_name)}</div>
              {cfg.restaurant_hours && (
                <div className="gp-restaurant-hours">{tc(cfg.restaurant_hours)}</div>
              )}
              {cfg.restaurant_menu_url && (
                <a href={cfg.restaurant_menu_url} target="_blank" rel="noopener noreferrer">
                  <button className="gp-btn-small" style={{ marginTop: 10 }}>{t.viewMenu}</button>
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════ EXPLORE TAB ════ */}
      {tab === 'explore' && (
        <div className="gp-tab-pad">
          <div className="gp-tab-title">{t.exploreTitle}</div>
          <div className="gp-tab-subtitle">{t.exploreSubtitle}</div>

          {/* Photo carousel for items that have photos */}
          {(() => {
            const withPhoto = usefulInfoList.filter((info: any) => info.photo_url);
            if (withPhoto.length === 0) return null;
            return (
              <div className="gp-carousel">
                {withPhoto.map((info: any, i: number) => (
                  <div key={i} className="gp-carousel-card">
                    <img src={info.photo_url} alt={tc(info.title)} className="gp-carousel-img" />
                    <div className="gp-carousel-overlay">
                      <div className="gp-carousel-title">{info.icon} {tc(info.title)}</div>
                      {info.url && (
                        <a href={info.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                          <div className="gp-carousel-nav">🗺 {t.navigate}</div>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {usefulInfoList.length > 0 ? usefulInfoList.map((info: any, i: number) => {
            return (
              <div key={i} className="gp-explore-card">
                <div className="gp-explore-title">{info.icon} {tc(info.title)}</div>
                <div className="gp-explore-desc">{tc(info.desc)}</div>
                {info.url && (
                  <a href={info.url} target="_blank" rel="noopener noreferrer">
                    <button className="gp-navigate-btn">🗺 {t.navigate}</button>
                  </a>
                )}
              </div>
            );
          }) : (
            <div className="gp-empty-state">
              <div className="gp-empty-icon">🗺</div>
              <div className="gp-empty-text">{t.noExplore}</div>
            </div>
          )}

          {/* Static: How to get here */}
          {cfg?.maps_url && (
            <div className="gp-explore-card">
              <div className="gp-explore-title">📍 {t.howToGetHere}</div>
              <div className="gp-explore-desc">{r.property_address || 'Loketská, Radošov, Karlovy Vary'}</div>
              <a href={cfg.maps_url} target="_blank" rel="noopener noreferrer">
                <button className="gp-navigate-btn">🗺 {t.navigate}</button>
              </a>
            </div>
          )}
        </div>
      )}

      {/* ════ BOTTOM SHEETS ════ */}

      {/* Directions */}
      <BottomSheet open={sheet === 'directions'} onClose={() => setSheet(null)} title={t.howToGetHereTitle}>
        {cfg?.weather_lat && cfg?.weather_lon ? (
          <iframe src={`https://www.openstreetmap.org/export/embed.html?bbox=${cfg.weather_lon-0.008},${cfg.weather_lat-0.004},${cfg.weather_lon+0.008},${cfg.weather_lat+0.004}&layer=mapnik&marker=${cfg.weather_lat},${cfg.weather_lon}`}
            style={{ width: '100%', height: 200, border: 'none', borderRadius: 12, marginBottom: 16 }}
            loading="lazy" />
        ) : (
          <div className="gp-sheet-map-placeholder">🗺 {t.howToGetHere}</div>
        )}
        <div className="gp-sheet-info">
          <strong>{t.address}:</strong> {r.property_address || `${r.property_city || ''}, ${r.property_country || ''}`}<br />
          {r.property_phone && <><strong>{t.support}:</strong> {r.property_phone}</>}
        </div>
        {cfg?.video_guide_url ? (
          <a href={cfg.video_guide_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <div className="gp-sheet-tip green" style={{ cursor: 'pointer' }}>{t.videoGuide}</div>
          </a>
        ) : (
          <div className="gp-sheet-tip green">{t.videoGuide}</div>
        )}
        {cfg?.maps_url && (
          <a href={cfg.maps_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button className="gp-btn gp-btn-primary">{t.openGoogleMaps}</button>
          </a>
        )}
      </BottomSheet>

      {/* Parking */}
      <BottomSheet open={sheet === 'parking'} onClose={() => setSheet(null)} title={t.parkingTitle}>
        {cfg?.parking_photo_url && (
          <img src={cfg.parking_photo_url} alt="Parking" style={{ width: '100%', borderRadius: 12, marginBottom: 16, objectFit: 'cover', maxHeight: 200 }} />
        )}
        <div className="gp-sheet-info" style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🅿️</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t.parkingFree}</div>
          {r.property_address && (
            <div style={{ fontSize: 14, color: 'var(--gp-sub)' }}>{r.property_address}</div>
          )}
        </div>
        {cfg?.maps_url && (
          <a href={cfg.maps_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button className="gp-btn gp-btn-primary">{t.openGoogleMaps}</button>
          </a>
        )}
      </BottomSheet>

      {/* Wi-Fi */}
      <BottomSheet open={sheet === 'wifi'} onClose={() => setSheet(null)} title={t.wifiTitle}>
        <div className="gp-wifi-center">
          <div className="gp-wifi-emoji">📶</div>
          <div className="gp-wifi-label">{t.network}</div>
          <div className="gp-wifi-value">{cfg?.wifi_network || 'ALiSiO_Guest'}</div>
          <div className="gp-wifi-spacer" />
          <div className="gp-wifi-label">{t.password}</div>
          <div className="gp-wifi-value mono">{cfg?.wifi_password || ''}</div>
          <button className="gp-btn gp-btn-primary" style={{ marginTop: 20, width: 'auto', padding: '12px 32px' }}
            onClick={() => { navigator.clipboard?.writeText(cfg?.wifi_password || ''); showToast(t.copied); }}>
            {t.copyPassword}
          </button>
        </div>
      </BottomSheet>

      {/* Entry */}
      <BottomSheet open={sheet === 'entry'} onClose={() => setSheet(null)} title={t.entryTitle}>
        {cfg?.entry_photo_url ? (
          <img src={cfg.entry_photo_url} alt="Entrance" style={{ width: '100%', borderRadius: 12, marginBottom: 16, objectFit: 'cover', maxHeight: 200 }} />
        ) : (
          <div className="gp-entry-photo">📷 Photo of entrance / lockbox</div>
        )}
        {cfg?.check_in_instructions ? (
          <div className="gp-entry-steps">{tc(cfg.check_in_instructions)}</div>
        ) : (
          <div className="gp-entry-steps">
            <strong>1.</strong> {t.entryStep1}<br />
            <strong>2.</strong> {t.entryStep2}<br />
            <strong>3.</strong> {t.entryStep3Code} <span className="gp-entry-code">{cfg?.lock_code || '4971#'}</span><br />
            <strong>4.</strong> {t.entryStep4}
          </div>
        )}
        {cfg?.lock_code && (
          <>
            <div style={{ margin: '12px 0 6px', padding: '10px 14px', background: 'var(--gp-green, #1e4d2b)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🏠</span>
              <span style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>{t.yourAccommodation}: <span style={{ opacity: 0.9 }}>{unitName}</span></span>
            </div>
            <div style={{ margin: '0 0 12px', padding: '10px 14px', background: 'var(--gp-card)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔐</span>
              <span style={{ fontWeight: 600 }}>Code: <span className="gp-entry-code">{cfg.lock_code}</span></span>
            </div>
          </>
        )}
        <div className="gp-sheet-tip orange" style={{ marginTop: 16 }}>{t.lateArrival}</div>
      </BottomSheet>

      {/* Restaurant */}
      <BottomSheet open={sheet === 'restaurant'} onClose={() => setSheet(null)} title={tc(cfg?.restaurant_name || 'Restaurant')}>
        {cfg?.restaurant_hours && (
          <div style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
            {tc(cfg.restaurant_hours)}
          </div>
        )}
        <div className="gp-sheet-tip green">
          💡 {t.servicesSubtitle}
        </div>
      </BottomSheet>

      {/* Service detail (simple services) */}
      <BottomSheet open={sheet === 'service' && !!selectedService} onClose={() => { setSheet(null); setSelectedService(null); setSelectedBreakfastDates([]); }}
        title={selectedService ? svcField(selectedService, 'name') : ''}>
        {selectedService && (() => {
          const isAlreadyPaid = data.orderedServices?.some(
            (o: any) => o.service_id === selectedService.id && o.payment_status === 'paid'
          );
          const isInCart = cartItems.some(i => i.serviceId === selectedService.id);
          const dateMode = getServiceDateMode(selectedService);
          const breakfastDays = r ? getBreakfastDays(r.check_in, r.check_out) : [];
          const isAutoBreakfast = dateMode === 'breakfast' && breakfastDays.length === 1;
          const breakfastReady = dateMode !== 'breakfast' || isAutoBreakfast || selectedBreakfastDates.length > 0;

          // Compute effective service dates for Pay Now / Add to Cart
          const getEffectiveDates = () => {
            if (dateMode === 'breakfast') {
              return isAutoBreakfast ? breakfastDays : selectedBreakfastDates;
            }
            return r ? [r.check_in] : [];
          };

          return (
            <>
              <div className="gp-service-detail">
                <div className="gp-service-detail-emoji">{selectedService.icon || '✨'}</div>
                <div className="gp-service-detail-price">{formatPriceLocalized(selectedService.price, selectedService.currency)}</div>
                {selectedService.unit_label && (
                  <div className="gp-service-detail-per">{t.per} {svcField(selectedService, 'unit_label')}</div>
                )}
              </div>
              <div className="gp-service-detail-desc">{svcField(selectedService, 'description')}</div>

              {/* ─── Date selection for breakfast ─── */}
              {dateMode === 'breakfast' && r && (
                <div className="gp-service-dates">
                  {isAutoBreakfast ? (
                    // 1 night → auto, just show the date
                    <div className="gp-service-dates-auto">
                      <span className="gp-service-dates-icon">🌅</span>
                      <span>Breakfast: <strong>{formatDateLocalized(breakfastDays[0], lang)}</strong></span>
                    </div>
                  ) : (
                    // 2+ nights → let guest pick
                    <>
                      <div className="gp-service-dates-label">🌅 Select breakfast days:</div>
                      <div className="gp-service-dates-list">
                        {breakfastDays.map(d => (
                          <label key={d} className="gp-service-date-row">
                            <input
                              type="checkbox"
                              checked={selectedBreakfastDates.includes(d)}
                              onChange={e => {
                                if (e.target.checked) setSelectedBreakfastDates(prev => [...prev, d]);
                                else setSelectedBreakfastDates(prev => prev.filter(x => x !== d));
                              }}
                            />
                            <span className="gp-service-date-label">{formatDateLocalized(d, lang)}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ─── Auto date info for one-time services ─── */}
              {dateMode === 'checkin' && r && (
                <div className="gp-service-dates">
                  <div className="gp-service-dates-auto">
                    <span className="gp-service-dates-icon">📅</span>
                    <span>Date: <strong>{formatDateLocalized(r.check_in, lang)}</strong></span>
                  </div>
                </div>
              )}

              {isAlreadyPaid ? (
                <button className="gp-btn" style={{ background: 'var(--gp-green)', color: '#FFF' }} disabled>✅ {t.done}</button>
              ) : (
                <div className="gp-service-btns">
                  <button className="gp-btn-pay-now"
                    onClick={() => {
                      const dates = getEffectiveDates();
                      logCartEvent('pay_now', selectedService.id, dates.length || 1);
                      handleOrderService(selectedService.id, dates);
                    }}
                    disabled={orderingService === selectedService.id || !breakfastReady}>
                    {orderingService === selectedService.id ? '...' : `💳 ${t.payNow}`}
                  </button>
                  <button
                    className={`gp-btn-add-cart${isInCart ? ' in-cart' : ''}${!breakfastReady ? ' disabled' : ''}`}
                    disabled={!breakfastReady}
                    onClick={() => {
                      if (isInCart) { setSheet(null); setSelectedService(null); setSelectedBreakfastDates([]); setTimeout(() => setSheet('cart'), 50); }
                      else addToCart(selectedService, getEffectiveDates());
                    }}
                  >
                    {isInCart ? t.inCart : `🛒 ${t.addToCart}`}
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </BottomSheet>

      {/* Service widget popup (sauna / tub / breakfast) */}
      <BottomSheet open={!!widgetService} onClose={() => setWidgetService(null)}
        title={(() => {
          const wsvc = data?.services?.find((s: any) => s.id === `svc_${widgetService}`);
          return wsvc ? svcField(wsvc, 'name') : widgetService || '';
        })()}>
        <div ref={widgetContainerRef} style={{ minHeight: 200 }} />
      </BottomSheet>

      {/* Registration required sheet */}
      <BottomSheet open={sheet === 'reg-required'} onClose={() => setSheet(null)} title={t.entryTitle}>
        <div className="gp-sheet-info" style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t.completeReg}</div>
          <div style={{ fontSize: 14, color: 'var(--gp-sub)', marginBottom: 20 }}>
            {registeredCount > 0 ? `${registeredCount}/${requiredGuests} ${t.done}` : t.regMinutes}
          </div>
          <button className="gp-btn gp-btn-primary" onClick={() => { setSheet(null); setRegCurrentGuest(registeredCount); setRegData({ fullName: '', email: '', phone: '', dateOfBirth: '', documentType: '', documentNumber: '', nationality: '', address: '', purposeOfStay: 'Tourism', visaNumber: '' }); setShowReg(true); }}>
            {t.startReg}
          </button>
        </div>
      </BottomSheet>

      {/* ════ REGISTRATION OVERLAY ════ */}
      {showReg && (
        <div className="gp-reg-overlay">
          <div className="gp-reg-header">
            <button className="gp-reg-back" onClick={() => {
              if (regStep === 1) setShowReg(false);
              else setRegStep(s => s - 1);
            }}>{regStep === 1 ? '✕' : t.back}</button>
            <span className="gp-reg-step">{requiredGuests > 1 ? `${t.guest} ${regCurrentGuest + 1}/${requiredGuests} · ` : ''}{t.stepOf(regStep, 3)}</span>
            <div style={{ width: 48 }} />
          </div>
          <div className="gp-reg-progress">
            <div className="gp-reg-progress-fill" style={{ width: `${(regStep / 3) * 100}%` }} />
          </div>


          {/* Hidden file input for OCR photo */}
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setOcrLoading(true);
              try {
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve) => {
                  reader.onload = () => resolve(reader.result as string);
                  reader.readAsDataURL(file);
                });
                const res = await fetch(`/api/guest/${token}/ocr`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ image: base64 }),
                });
                const result = await res.json().catch(() => ({}));
                if (!res.ok || !result.success) {
                  const msg = result?.error || `HTTP ${res.status}`;
                  console.error('[OCR]', msg);
                  showToast(`OCR error: ${msg}. Please fill in manually.`, 'error');
                } else if (result.data) {
                  const d = result.data;
                  setRegData(prev => ({
                    ...prev,
                    fullName: d.fullName || prev.fullName,
                    dateOfBirth: d.dateOfBirth || prev.dateOfBirth,
                    documentType: d.documentType || prev.documentType,
                    documentNumber: d.documentNumber || prev.documentNumber,
                    nationality: d.nationality || prev.nationality,
                    address: d.address || prev.address,
                  }));
                  showToast(`✅ ${d.confidence > 70 ? 'Data extracted!' : 'Partial data — please review'}`);
                } else {
                  showToast('Could not read document. Please fill in manually.', 'error');
                }
              } catch (err) {
                const msg = (err as Error)?.message || 'unknown';
                console.error('[OCR]', err);
                showToast(`OCR error: ${msg}. Please fill in manually.`, 'error');
              }
              setOcrLoading(false);
              if (ocrInputRef.current) ocrInputRef.current.value = '';
            }}
          />


          <div className="gp-reg-body">
            {/* Step 1: Guest Details */}
            {regStep === 1 && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{t.step1Title}</h2>
                <div className="gp-field">
                  <div className="gp-field-label">{t.fullName} *</div>
                  <input className="gp-field-input" value={regData.fullName} autoComplete="off"
                    onChange={e => setRegData(d => ({ ...d, fullName: e.target.value }))} />
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.email} *</div>
                  <input className="gp-field-input" type="email" value={regData.email} autoComplete="email"
                    onChange={e => setRegData(d => ({ ...d, email: e.target.value }))} />
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.phone}</div>
                  <input className="gp-field-input" type="tel" value={regData.phone} autoComplete="tel"
                    onChange={e => setRegData(d => ({ ...d, phone: e.target.value }))} />
                  <div className="gp-field-hint">{t.phoneHint}</div>
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.dateOfBirth} *</div>
                  <input className="gp-field-input" type="date" value={regData.dateOfBirth} autoComplete="bday"
                    onChange={e => setRegData(d => ({ ...d, dateOfBirth: e.target.value }))} />
                </div>
              </>
            )}

            {/* Step 2: ID Document */}
            {regStep === 2 && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t.step2Title}</h2>
                <p style={{ fontSize: 14, color: 'var(--gp-sub)', marginBottom: 16 }}>{t.step2Why}</p>
                <div className="gp-security-notice">{t.securityNotice}</div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.documentType} *</div>
                  <select className="gp-field-input" value={regData.documentType}
                    onChange={e => setRegData(d => ({ ...d, documentType: e.target.value }))}>
                    <option value="">{t.selectDoc}</option>
                    <option value="passport">{t.passportDoc}</option>
                    <option value="id_card">{t.idCardDoc}</option>
                    <option value="driving_license">{t.drivingLicenseDoc}</option>
                  </select>
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.documentNumber} *</div>
                  <input className="gp-field-input" value={regData.documentNumber}
                    onChange={e => setRegData(d => ({ ...d, documentNumber: e.target.value }))} />
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.nationality} *</div>
                  <input className="gp-field-input" value={regData.nationality} autoComplete="country-name"
                    placeholder="DEU, CZE, UKR..."
                    onChange={e => setRegData(d => ({ ...d, nationality: e.target.value }))} />
                </div>
                <div className="gp-field">
                  <div className="gp-field-label">{t.permanentAddress} *</div>
                  <input className="gp-field-input" value={regData.address} autoComplete="street-address"
                    placeholder="München, Germany"
                    onChange={e => setRegData(d => ({ ...d, address: e.target.value }))} />
                </div>
              </>
            )}

            {/* Step 3: Confirm */}
            {regStep === 3 && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{t.step3Title}</h2>
                <div className="gp-confirm-table">
                  {[
                    [t.fullName, regData.fullName],
                    [t.email, regData.email],
                    [t.phone, regData.phone || '—'],
                    [t.dateOfBirth, regData.dateOfBirth],
                    [t.documentType, regData.documentType],
                    [t.documentNumber, regData.documentNumber],
                    [t.nationality, regData.nationality],
                    [t.permanentAddress, regData.address],
                  ].map(([label, value], i) => (
                    <div key={i} className="gp-confirm-row">
                      <span className="gp-confirm-label">{label}</span>
                      <span className="gp-confirm-value">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="gp-confirm-success">{t.confirmNotice}</div>
              </>
            )}
          </div>

          <div className="gp-reg-footer">
            {regStep < 3 ? (
              <button className="gp-btn gp-btn-primary" onClick={() => {
                // Validation
                if (regStep === 1) {
                  if (!regData.fullName.trim() || !regData.email.trim() || !regData.dateOfBirth) {
                    showToast(t.regError, 'error'); return;
                  }
                }
                if (regStep === 2) {
                  if (!regData.documentType || !regData.documentNumber.trim() || !regData.nationality.trim() || !regData.address.trim()) {
                    showToast(t.regError, 'error'); return;
                  }
                }
                setRegStep(s => s + 1);
              }}>
                {t.continue_}
              </button>
            ) : (
              <button className="gp-btn gp-btn-primary" onClick={handleRegSubmit} disabled={regLoading}>
                {regLoading ? '...' : t.confirmReg}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ════ BOTTOM TAB BAR ════ */}
      <div className="gp-tab-bar">
        {([
          { id: 'home' as const, icon: '🏠', label: t.home },
          { id: 'services' as const, icon: '✨', label: t.services },
          { id: 'explore' as const, icon: '🗺', label: t.explore },
          { id: 'whatsapp' as const, icon: '💬', label: 'WhatsApp' },
        ] as const).map(item => (
          <button key={item.id} className={`gp-tab-btn ${item.id !== 'whatsapp' && tab === item.id ? 'active' : ''}`}
            onClick={() => item.id === 'whatsapp' ? openWhatsApp() : setTab(item.id as 'home' | 'services' | 'explore')}
            style={item.id === 'whatsapp' ? { color: '#25D366' } : undefined}>
            <span className="gp-tab-icon">{item.id === 'whatsapp' ? '📱' : item.icon}</span>
            <span className="gp-tab-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ════ CART FAB ════ */}
      {/* #9 FIX: Hide FAB when cart sheet is open */}
      {cartCount > 0 && sheet !== 'cart' && (
        <button className="gp-cart-fab" onClick={() => setSheet('cart')}>
          🛒
          <span className="gp-cart-badge">{cartCount}</span>
        </button>
      )}

      {/* ════ CART BOTTOM SHEET ════ */}
      <BottomSheet open={sheet === 'cart'} onClose={() => setSheet(null)} title={t.yourCart}>
        {cartItems.length === 0 ? (
          <div className="gp-cart-empty">
            <div className="gp-cart-empty-icon">🛒</div>
            <div className="gp-cart-empty-text">{t.cartEmpty}</div>
            <button className="gp-cart-empty-btn" onClick={() => { setSheet(null); setTab('services'); }}>
              {t.browseServices}
            </button>
          </div>
        ) : (
          <div style={{ padding: '0 4px' }}>
            {cartItems.map(item => (
              <div key={item.serviceId} className="gp-cart-item">
                <div className="gp-cart-item-icon">{item.icon}</div>
                <div className="gp-cart-item-info">
                  <div className="gp-cart-item-name">{item.serviceName}</div>
                  <div className="gp-cart-item-price">{(item.price * item.quantity).toFixed(0)} {item.currency}</div>
                  {/* #8 FIX: Show selected dates for breakfast-type items */}
                  {item.serviceDates && item.serviceDates.length > 0 && (
                    <div className="gp-cart-item-dates">
                      {item.serviceDates.map(d => formatDateLocalized(d, lang)).join(', ')}
                    </div>
                  )}
                </div>
                <div className="gp-cart-stepper">
                  <button
                    className={`gp-cart-stepper-btn${item.quantity === 1 ? ' remove' : ''}`}
                    onClick={() => updateCartQty(item.serviceId, -1)}>
                    {item.quantity === 1 ? '×' : '−'}
                  </button>
                  <span className="gp-cart-stepper-qty">{item.quantity}</span>
                  {/* #7 FIX: Disable + when qty is already at max serviceDates count */}
                  <button
                    className="gp-cart-stepper-btn"
                    disabled={!!(item.serviceDates?.length && item.quantity >= item.serviceDates.length)}
                    onClick={() => updateCartQty(item.serviceId, 1)}>+</button>
                </div>
              </div>
            ))}
            <div className="gp-cart-total">
              <span className="gp-cart-total-label">Total</span>
              <span className="gp-cart-total-value">{cartTotal.toFixed(0)} {cartItems[0]?.currency || 'Kč'}</span>
            </div>
            <button className="gp-cart-pay-btn" onClick={handleCartPay} disabled={cartLoading}>
              {cartLoading ? '...' : t.payAll(`${cartTotal.toFixed(0)} ${cartItems[0]?.currency || 'Kč'}`)}
            </button>
          </div>
        )}
      </BottomSheet>

      {/* ════ TOAST ════ */}
      {toast && <div className={`gp-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════
// FEEDBACK FORM (checkout only)
// ════════════════════════════════════════════════════
function FeedbackForm({ t, token, showToast }: {
  t: any; token: string; showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const handleSend = async () => {
    if (!text.trim()) return;
    try {
      await fetch(`/api/guest/${token}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: text }),
      });
      setSent(true); showToast('💚 ' + t.send);
    } catch { showToast(t.orderError, 'error'); }
  };
  if (sent) return <div className="gp-feedback"><div className="gp-confirm-success">💚 {t.send} ✅</div></div>;
  return (
    <div className="gp-feedback">
      <div className="gp-feedback-title">{t.feedbackTitle}</div>
      <div className="gp-feedback-desc">{t.feedbackQuestion}</div>
      <textarea className="gp-feedback-textarea" placeholder={t.feedbackPlaceholder} value={text} onChange={e => setText(e.target.value)} />
      <button className="gp-btn gp-btn-primary" style={{ marginTop: 8, fontSize: 14, padding: '10px 20px', width: 'auto' }} onClick={handleSend}>
        {t.send}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════
// POST-STAY PAGE (token expired)
// ════════════════════════════════════════════════════
function PostStayPage({ data, lang, setLang }: {
  data: any; lang: Lang; setLang: (l: Lang) => void;
}) {
  const t = getTranslations(lang);
  const brandName = data.brandName || 'ALiSiO Resort';
  const guestName = data.guestName || '';
  const unitTypes = data.unitTypes || [];
  const catIcons: Record<string, string> = { glamping: '🏕️', resort: '🏨', camping: '⛺' };

  return (
    <div className="gp-root">
      {/* Language switcher */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', gap: 4 }}>
        {ALL_LANGS.map(l => (
          <button key={l} className={`gp-lang-pill ${l === lang ? 'active' : ''}`}
            style={{ background: l === lang ? '#000' : 'rgba(0,0,0,0.4)', color: '#FFF' }}
            onClick={() => setLang(l)}>{LANG_LABELS[l]}</button>
        ))}
      </div>

      {/* Hero */}
      <div className="gp-ps-hero">
        <div className="gp-ps-hero-emoji">🌟</div>
        <h1 className="gp-ps-hero-title">{t.thankYou(guestName)}</h1>
        <p className="gp-ps-hero-subtitle">{t.thankYouStay}</p>
        <p className="gp-ps-hero-comeback">{t.comeBack}</p>
      </div>

      {/* Early booking offer */}
      <div className="gp-ps-offer">
        <div className="gp-ps-offer-badge">🎁 -30%</div>
        <h2 className="gp-ps-offer-title">{t.earlyBooking}</h2>
        <p className="gp-ps-offer-desc">{t.earlyBookingDesc}</p>
        <div className="gp-ps-offer-conditions">
          <span>✓ 30% {t.discount}</span>
          <span>✓ Min. 2 {t.nights.toLowerCase()}</span>
        </div>
      </div>

      {/* Unit types */}
      {unitTypes.length > 0 && (
        <div className="gp-ps-units">
          <h2 className="gp-ps-section-title">{t.ourAccommodations}</h2>
          <div className="gp-ps-units-grid">
            {unitTypes.map((ut: any) => (
              <div key={ut.id} className="gp-ps-unit-card">
                <div className="gp-ps-unit-icon">{catIcons[ut.category_type] || '🏠'}</div>
                <div className="gp-ps-unit-info">
                  <div className="gp-ps-unit-name">{ut.name}</div>
                  <div className="gp-ps-unit-meta">{ut.category_name} · {ut.max_adults} {t.adultsShort}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      <div className="gp-ps-contact">
        <div className="gp-ps-contact-row">
          {data.propertyEmail && <a href={`mailto:${data.propertyEmail}`} className="gp-ps-contact-btn">📧 {data.propertyEmail}</a>}
          {data.propertyPhone && <a href={`tel:${data.propertyPhone}`} className="gp-ps-contact-btn">📞 {data.propertyPhone}</a>}
        </div>
      </div>

      <footer className="gp-footer">
        <div className="gp-footer-logo">{brandName}</div>
        <div>{t.footerLocation}</div>
      </footer>
    </div>
  );
}
