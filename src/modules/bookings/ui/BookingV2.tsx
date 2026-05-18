'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import './booking-v2.css';
import { BookingLang, BOOKING_LANG_LABELS, BOOKING_LANG_FLAGS, getBookingTranslations } from './translations';

// API base URL
const API_BASE = process.env.NEXT_PUBLIC_PMS_API_URL || '';

// ─── Types ───
interface UnitResult {
  id: string;
  name: string;
  code: string;
  beds: number;
  unitTypeId: string;
  typeName: string;
  typeCode: string;
  description: string;
  photos: string[];
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  baseOccupancy: number;
  avgPricePerNight: number;
  totalPrice: number;
  currency: string;
  extraPersonCharge: number;
  petAllowed: boolean;
  petCharge: number;
  amenities: { icon: string; name: string }[];
  prices?: { date: string, price: number }[];
}

interface AvailabilityResponse {
  checkIn: string;
  checkOut: string;
  nights: number;
  units: UnitResult[];
}

interface ReserveResponse {
  success: boolean;
  reservationId: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPrice: number;
  currency: string;
}

// ─── Helpers ───
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function formatDisplayDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatFullDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatPrice(n: number, currency: string = 'Kč'): string {
  const formatted = new Intl.NumberFormat('cs-CZ').format(n).replace(',', ' ');
  return `${formatted} ${currency}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

interface DesignConfig {
  theme?: string;
  primary_color?: string;
  button_style?: string;
  show_shadow?: boolean;
}

const commonTranslations: Record<string, Record<string, string>> = {
  en: {
    "Комфортне ліжко": "Comfortable bed",
    "Душ": "Shower",
    "Туалет": "Toilet",
    "Опалення": "Heating",
    "Чайник": "Kettle",
    "Міні-холодильник": "Mini-fridge",
    "Wi-Fi": "Wi-Fi",
    "Тераса": "Terrace",
    "Замок": "Lock",
    "Рушники": "Towels",
    "Освітлення": "Lighting",
    "Сніданок": "Breakfast",
    "Повноцінний сніданок у ресторані": "Full breakfast in the restaurant",
    "Сауна": "Sauna",
    "Фінська сауна (2 години)": "Finnish sauna (2 hours)",
    "Чан карпатський": "Carpathian vat",
    "Нержавіючий чан під відкритим небом. Мінімальне бронювання — 2 години.": "Stainless open-air vat. Minimum booking — 2 hours.",
    "Мангал": "BBQ Grill",
    "Набір для барбекю та вогнища з вугіллям, розпалювачем та дровами": "BBQ and fire pit set with charcoal, fire starter and wood",
    "Пізнє виселення": "Late Check-out",
    "Виселення до 14:00 замість 11:00": "Check-out until 14:00 instead of 11:00",
    "Раннє заселення": "Early Check-in",
    "Заселення з 11:00 замість 15:00": "Check-in from 11:00 instead of 15:00"
  },
  cs: {
    "Комфортне ліжко": "Pohodlná postel",
    "Душ": "Sprcha",
    "Туалет": "Toaleta",
    "Опалення": "Topení",
    "Чайник": "Rychlovarná konvice",
    "Міні-холодильник": "Mini-lednice",
    "Wi-Fi": "Wi-Fi",
    "Тераса": "Terasa",
    "Замок": "Zámek",
    "Рушники": "Ručníky",
    "Освітлення": "Osvětlení",
    "Сніданок": "Snídaně",
    "Повноцінний сніданок у ресторані": "Plná snídaně v restauraci",
    "Сауна": "Sauna",
    "Фінська сауна (2 години)": "Finská sauna (2 hodiny)",
    "Чан карпатський": "Karpatská káď",
    "Нержавіючий чан під відкритим небом. Мінімальне бронювання — 2 години.": "Nerezová venkovní káď. Minimální rezervace — 2 hodiny.",
    "Мангал": "BBQ Gril",
    "Набір для барбекю та вогнища з вугіллям, розпалювачем та дровами": "Sada pro BBQ a ohniště s uhlím, podpalovačem a dřevem",
    "Пізнє виселення": "Pozdní odhlášení",
    "Виселення do 14:00 замість 11:00": "Odhlášení do 14:00 místo 11:00",
    "Раннє заселення": "Dřívější přihlášení",
    "Заселення з 11:00 замість 15:00": "Přihlášení od 11:00 místo 15:00"
  },
  de: {
    "Комфортне ліжко": "Bequemes Bett",
    "Душ": "Dusche",
    "Туалет": "Toilette",
    "Опалення": "Heizung",
    "Чайник": "Wasserkocher",
    "Міні-холодильник": "Minikühlschrank",
    "Wi-Fi": "WLAN",
    "Тераса": "Terrasse",
    "Замок": "Schloss",
    "Рушники": "Handtücher",
    "Освітлення": "Beleuchtung",
    "Сніданок": "Frühstück",
    "Повноцінний сніданок у ресторані": "Ausgiebiges Frühstück im Restaurant",
    "Сауна": "Sauna",
    "Фінська сауна (2 години)": "Finnische Sauna (2 Stunden)",
    "Чан карпатський": "Karpaten-Badefass",
    "Нержавіючий чан під відкритим небом. Мінімальне бронювання — 2 години.": "Rostfreies Freiluft-Badefass. Mindestbuchung — 2 Stunden.",
    "Мангал": "BBQ-Grill",
    "Набір для барбекю та вогнища з вугіллям, розпалювачем та дровами": "BBQ- und Feuerstellen-Set mit Holzkohle, Anzünder und Holz",
    "Пізнє виселення": "Später Check-out",
    "Виселення до 14:00 замість 11:00": "Check-out bis 14:00 statt 11:00",
    "Раннє заселення": "Früher Check-in",
    "Заселення з 11:00 замість 15:00": "Check-in ab 11:00 statt 15:00"
  }
};

const tName = (obj: any, key: string, l: string) => {
  if (!obj) return '';
  if (l === 'en' && obj[`${key}En`]) return obj[`${key}En`];
  if (l === 'cs' && obj[`${key}Cs`]) return obj[`${key}Cs`];
  if (l === 'de' && obj[`${key}De`]) return obj[`${key}De`];
  const baseVal = obj[key];
  if (baseVal && commonTranslations[l] && commonTranslations[l][baseVal]) {
    return commonTranslations[l][baseVal];
  }
  return baseVal;
};

const v3Locales: Record<string, any> = {
  uk: {
    waitlistTitle: "Список очікування",
    waitlistSub: "Ми повідомимо вас, якщо ці дати звільняться.",
    subscribed: "✅ Ви підписалися!",
    yourEmail: "Ваш email",
    subscribe: "Підписатися",
    viewersNow: "людей дивляться зараз",
    lastBooking: "Остання бронь",
    occupancyNotice: "У будиночку одне велике ліжко — ідеально для двох дорослих. Якщо з вами дитина, ми завжди раді зробити виняток: маленькі гості не займають окреме спальне місце 😊",
    chooseDatesPrice: "Оберіть дати щоб дізнатись ціну",
    tryTheseDates: "💡 Спробуйте ці дати:",
    availFrom: "Вільні місця з",
    offerError: "Недійсний промокод",
    serverError: "Помилка підключення",
    errorReq: "Будь ласка, заповніть всі необхідні поля",
    clear: "Стерти",
    fromTime: "з",
    toTime: "до",
    chooseDatesShort: "обрати дати",
    bankTransfer: "Оплата за реквізитами",
    bankTransferDesc: "Ми надішлемо вам реквізити для оплати на email одразу після підтвердження бронювання.",
    checkDetails: "Перевірте деталі та продовжуйте бронювання",
    fromTimeBase: "від",
    nightBase: "ніч",
    agoHours: "годин тому",
    agoHour: "годину тому",
    agoMinutes: "хвилин тому",
    connectionError: "Помилка підключення"
  },
  en: {
    waitlistTitle: "Waitlist",
    waitlistSub: "We will notify you if these dates become available.",
    subscribed: "✅ Subscribed!",
    yourEmail: "Your email",
    subscribe: "Subscribe",
    viewersNow: "people looking right now",
    lastBooking: "Last booking",
    occupancyNotice: "The house has one large bed — ideal for two adults. If you have a child with you, we are happy to make an exception: young guests do not occupy a separate bed 😊",
    chooseDatesPrice: "Select dates to see price",
    tryTheseDates: "💡 Try these dates:",
    availFrom: "Available from",
    offerError: "Invalid Coupon code",
    serverError: "Connection error",
    errorReq: "Please fill in all required fields",
    clear: "Clear",
    fromTime: "from",
    toTime: "until",
    chooseDatesShort: "select dates",
    bankTransfer: "Bank Transfer",
    bankTransferDesc: "We will email you the payment details immediately after confirming the booking.",
    checkDetails: "Check details and continue booking",
    fromTimeBase: "from",
    nightBase: "night",
    agoHours: "hours ago",
    agoHour: "hour ago",
    agoMinutes: "minutes ago",
    connectionError: "Connection error"
  },
  cs: {
    waitlistTitle: "Čekací listina",
    waitlistSub: "Dáme vám vědět, pokud se tyto termíny uvolní.",
    subscribed: "✅ Přihlášeno!",
    yourEmail: "Váš email",
    subscribe: "Odebírat",
    viewersNow: "lidé si právě prohlížejí",
    lastBooking: "Poslední rezervace",
    occupancyNotice: "Dům má jednu velkou postel — ideální pro dva dospělé. Pokud s sebou máte dítě, rádi uděláme výjimku: malí hosté nezabírají samostatné lůžko 😊",
    chooseDatesPrice: "Vyberte termíny pro zobrazení ceny",
    tryTheseDates: "💡 Zkuste tyto termíny:",
    availFrom: "Volné od",
    offerError: "Neplatný offer kód",
    serverError: "Chyba připojení",
    errorReq: "Vyplňte prosím všechna povinná pole",
    clear: "Smazat",
    fromTime: "od",
    toTime: "do",
    chooseDatesShort: "vybrat termíny",
    bankTransfer: "Bankovní převod",
    bankTransferDesc: "Platební údaje vám zašleme e-mailem ihned po potvrzení rezervace.",
    checkDetails: "Zkontrolujte detaily a pokračujte v rezervaci",
    fromTimeBase: "od",
    nightBase: "noc",
    agoHours: "před hodinami",
    agoHour: "před hodinou",
    agoMinutes: "před minutami",
    connectionError: "Chyba připojení"
  },
  de: {
    waitlistTitle: "Warteliste",
    waitlistSub: "Wir benachrichtigen Sie, falls diese Daten verfügbar werden.",
    subscribed: "✅ Abonniert!",
    yourEmail: "Ihre E-Mail",
    subscribe: "Abonnieren",
    viewersNow: "Personen sehen sich das gerade an",
    lastBooking: "Letzte Buchung",
    occupancyNotice: "Das Haus hat ein großes Bett — ideal für zwei Erwachsene. Wenn Sie ein Kind dabei haben, machen wir gerne eine Ausnahme: kleine Gäste belegen kein separates Bett 😊",
    chooseDatesPrice: "Wählen Sie Daten aus, um den Preis zu sehen",
    tryTheseDates: "💡 Versuchen Sie diese Daten:",
    availFrom: "Verfügbar ab",
    offerError: "Ungültiger Promo-Code",
    serverError: "Verbindungsfehler",
    errorReq: "Bitte füllen Sie alle erforderlichen Felder aus",
    clear: "Löschen",
    fromTime: "ab",
    toTime: "bis",
    chooseDatesShort: "Daten auswählen",
    bankTransfer: "Banküberweisung",
    bankTransferDesc: "Wir senden Ihnen die Zahlungsdetails sofort nach Bestätigung der Buchung per E-Mail.",
    checkDetails: "Überprüfen Sie die Details und setzen Sie die Buchung fort",
    fromTimeBase: "ab",
    nightBase: "Nacht",
    agoHours: "Stunden her",
    agoHour: "Stunde her",
    agoMinutes: "Minuten her",
    connectionError: "Verbindungsfehler"
  }
};

export default function BookingV2({ siteId, siteSlug, thankYouUrl, design, isPreview, lang: initialLang }: { siteId?: string, siteSlug?: string, thankYouUrl?: string, design?: DesignConfig, isPreview?: boolean, lang?: BookingLang }) {
  // ─── State ───
  const [isMounted, setIsMounted] = useState(false);
  const [lang, setLang] = useState<BookingLang>(initialLang || 'uk');
  const t = useMemo(() => getBookingTranslations(lang), [lang]);
  const v3t = useMemo(() => v3Locales[lang] || v3Locales.uk, [lang]);

  const getOccupancyString = (u: any) => {
    if (u.maxChildren > 0) {
      return `до ${u.maxAdults} ${t.adults.toLowerCase()} (+${u.maxChildren} ${t.children.toLowerCase()})`;
    }
    return `до ${u.maxAdults || u.maxOccupancy} ${t.guestsShort}`;
  };
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
  const [socialProof, setSocialProof] = useState<{ viewers: number, lastBooking?: string } | null>(null);
  const [waitlistStatus, setWaitlistStatus] = useState<'none' | 'submitting' | 'success'>('none');
  const [nextAvailable, setNextAvailable] = useState<string | null>(null);

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [unitInfo, setUnitInfo] = useState<UnitResult | null>(null); // unit data without dates
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReserveResponse | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [showOffer, setShowOffer] = useState(false);
  const [offerApplied, setOfferApplied] = useState<{ code: string; offerType: string; offerAmount: number; description?: string; bundle?: any } | null>(null);
  const [offerError, setOfferError] = useState('');
  const [applyingOffer, setApplyingOffer] = useState(false);
  const [isHiddenBundle, setIsHiddenBundle] = useState(false);

  // New site config states
  const [siteConfig, setSiteConfig] = useState<any>(null);
  const [siteDesign, setSiteDesign] = useState<DesignConfig | null>(null);
  const [siteCurrency, setSiteCurrency] = useState('Kč');
  const [siteThankYouUrl, setSiteThankYouUrl] = useState(thankYouUrl || '');

  // New states for Step 4
  const [services, setServices] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());

  // Pre-select unit from query param
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);



      const payStatus = params.get('payment_status');
      const resId = params.get('res_id');
      if (payStatus === 'success' && resId) {
        fetch(`${API_BASE}/api/booking/reservation?id=${resId}`)
          .then(r => r.json())
          .then(data => {
            if (data.reservation) {
              setReservation({
                ...data.reservation,
                reservationId: data.reservation.id,
                unitName: data.reservation.unit_name,
                totalPrice: data.reservation.total_price,
              });
              // Set selected services from fetched data if they exist
              if (data.services) {
                const sIds = new Set<string>();
                data.services.forEach((s: any) => sIds.add(s.service_id));
                setSelectedServiceIds(sIds);
              }
              setStep(6);
            }
          })
          .catch(err => console.error('Fetch res error:', err));
      }

      const uId = params.get('unitId');
      if (uId) setSelectedUnitId(uId);

      const getBrowserLang = () => {
        if (typeof navigator !== 'undefined' && navigator.language) {
          const browserLang = navigator.language.slice(0, 2).toLowerCase();
          if (['uk', 'en', 'cs', 'de'].includes(browserLang)) return browserLang;
        }
        return null;
      };

      let l = params.get('lang')
        || (typeof window !== 'undefined' && (window as any).__BOOKING_LANG__)
        || initialLang
        || getBrowserLang()
        || null;
      if (l) {
        const shortLang = l.slice(0, 2).toLowerCase();
        if (['uk', 'en', 'cs', 'de'].includes(shortLang)) {
          setLang(shortLang as BookingLang);
        }
      }

      // Auto-fill dates from URL
      const urlIn = params.get('checkin') || params.get('check_in');
      const urlOut = params.get('checkout') || params.get('check_out');
      const urlAdults = params.get('adults');
      const urlKids = params.get('kids');
      const urlOffer = params.get('offer') || params.get('couponCode') || params.get('couponcode');

      if (urlIn) setCheckIn(urlIn);
      if (urlOut) setCheckOut(urlOut);
      if (urlAdults) setAdults(parseInt(urlAdults, 10) || 2);
      if (urlKids) setKids(parseInt(urlKids, 10) || 0);

      if (urlOffer) {
        setCouponCode(urlOffer);
        setShowOffer(true);
      }

      // Bundle param — auto-apply as a package offer
      const urlBundle = params.get('bundle') || params.get('bundleId');
      if (urlBundle) {
        setCouponCode(urlBundle);
        setIsHiddenBundle(true);
        setShowOffer(true);
      }

      // Pre-fill from localStorage
      const savedGuest = localStorage.getItem('alisio_guest_data');
      if (savedGuest) {
        try {
          const g = JSON.parse(savedGuest);
          setFirstName(g.firstName || '');
          setLastName(g.lastName || '');
          setEmail(g.email || '');
          setPhone(g.phone || '');
        } catch (e) { /* ignore */ }
      }

      // Simulation: Social Proof
      const v = Math.floor(Math.random() * 6) + 3;
      const hours = Math.floor(Math.random() * 12) + 1;
      setSocialProof({
        viewers: v,
        lastBooking: hours < 5 ? `${hours} ${hours === 1 ? v3t.agoHour : v3t.agoHours}` : `45 ${v3t.agoMinutes}`
      });
    }
  }, []);

  // Fetch site config (skip in preview — design comes from props directly)
  useEffect(() => {
    if (!isMounted || !siteSlug || isPreview) return;
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/booking/site-config?slug=${siteSlug}`);
        const data = await res.json();
        if (data.id) {
          setSiteConfig(data);
          if (data.design) setSiteDesign(data.design);
          if (data.currency) setSiteCurrency(data.currency);
          if (data.hasPayment !== undefined) setSiteConfig(data);
          if (data.config?.thank_you_url) setSiteThankYouUrl(data.config.thank_you_url);
        }
      } catch (e) { console.error('Fetch site config error:', e); }
    };
    fetchConfig();
  }, [isMounted, siteSlug, isPreview]);

  // Thank you redirect logic
  useEffect(() => {
    if (step === 6 && siteThankYouUrl && !isPreview) {
      const timer = setTimeout(() => {
        // Redirect parent window if in iframe
        if (window.parent !== window) {
          window.parent.location.href = siteThankYouUrl;
        } else {
          window.location.href = siteThankYouUrl;
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [step, siteThankYouUrl, isPreview]);

  // Fetch services when site is available
  useEffect(() => {
    if (!isMounted) return;
    const fetchServices = async () => {
      if (!siteId && !siteSlug) return;
      // Wait until siteConfig is loaded to get the resolved siteId
      const resolvedSiteId = siteId || siteConfig?.id;
      if (!resolvedSiteId) return; // siteConfig not yet loaded — will re-run when it loads
      setLoadingServices(true);
      try {
        const url = new URL(`${API_BASE}/api/booking/services`, window.location.origin);
        url.searchParams.set('siteId', resolvedSiteId);
        const res = await fetch(url.toString());
        const data = await res.json();
        if (data.services) {
          setServices(data.services);
        }
      } catch (e) { console.error('Fetch services error:', e); }
      setLoadingServices(false);
    };
    fetchServices();
  }, [isMounted, siteId, siteSlug, siteConfig]);

  // Fetch basic unit info on mount (without dates) to show unit card and limits immediately
  useEffect(() => {
    if (!isMounted || !selectedUnitId || unitInfo) return;
    const fetchUnitInfo = async () => {
      try {
        const d = new Date();
        const ci = fmtDate(d);
        const co = fmtDate(new Date(d.getTime() + 86400000));
        const params = new URLSearchParams({ checkIn: ci, checkOut: co });
        if (siteId) params.set('siteId', siteId);
        if (siteSlug) params.set('siteSlug', siteSlug);
        const res = await fetch(`${API_BASE}/api/booking/availability?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const unit = data.units?.find((u: UnitResult) => u.id === selectedUnitId);
          if (unit) setUnitInfo(unit);
        }
      } catch (e) { console.error('Fetch unit info error:', e); }
    };
    fetchUnitInfo();
  }, [isMounted, selectedUnitId, siteId, unitInfo]);

  // Only fetch when both dates are present to avoid stuck loader
  useEffect(() => {
    if (!isMounted) return;
    if (selectedUnitId && checkIn && checkOut && !availability && !loadingAvail) {
      fetchAvailability(checkIn, checkOut);
    }
  }, [isMounted, selectedUnitId, availability, loadingAvail, checkIn, checkOut]);

  // Resize reporter — sends widget content height to parent iframe host
  useEffect(() => {
    if (!isMounted) return;

    const sendResize = () => {
      const el = document.getElementById('alisio-widget-v3');
      if (!el) return;

      // Use getBoundingClientRect().height — this is the actual RENDERED height
      // of the widget element, unaffected by the iframe document/body size.
      // Using document.body.scrollHeight causes infinite growth because:
      //   iframe grows → body.scrollHeight grows → widget reports bigger height → loop
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height <= 0) return;

      const msg = { type: 'resize', height, val: height, h: height, source: 'alisio-widget' };
      window.parent.postMessage(msg, '*');
      if (window.parent !== window.top) {
        window.top?.postMessage(msg, '*');
      }
    };

    const interval = setInterval(sendResize, 500);
    sendResize();
    return () => clearTimeout(interval);
  }, [isMounted]);

  // Explicit trigger for state changes
  const triggerResize = useCallback(() => {
    const el = document.getElementById('alisio-widget-v3');
    if (el) {
      window.parent.postMessage({ type: 'resize', height: el.scrollHeight }, '*');
    }
  }, []);

  // Fetch busy dates when month changes
  useEffect(() => {
    if (!isMounted) return;
    const fetchBusyDates = async () => {
      try {
        const fetchMonth = async (offset: number) => {
          const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
          const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const params = new URLSearchParams({ month: monthStr });
          if (siteId) params.set('siteId', siteId);
          if (siteSlug) params.set('siteSlug', siteSlug);
          if (selectedUnitId) params.set('unitId', selectedUnitId);

          const urlParams = new URLSearchParams(window.location.search);
          const rp = urlParams.get('ratePlanId') || urlParams.get('ratePlan');
          if (rp) params.set('ratePlanId', rp);

          const res = await fetch(`${API_BASE}/api/widget/calendar?${params.toString()}`);
          return res.json();
        };

        const [data1, data2] = await Promise.all([
          fetchMonth(calMonthOffset),
          fetchMonth(calMonthOffset + 1)
        ]);

        const busy = new Set<string>();
        const partial = new Set<string>();
        
        [data1, data2].forEach(data => {
          if (data?.days) {
            data.days.forEach((d: any) => {
              if (d.status === 'booked') busy.add(d.date);
              if (d.status === 'partial') partial.add(d.date);
            });
          }
        });
        
        setBusyDates(busy);
        setPartialDates(partial);
      } catch (e) { console.error('Fetch busy dates error:', e); }
    };
    fetchBusyDates();
  }, [calMonthOffset, isMounted, siteId, siteSlug, selectedUnitId]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / 86400000);
  }, [checkIn, checkOut]);

  const displayUnits = useMemo(() => {
    if (!availability?.units) return [];
    if (offerApplied?.bundle?.applied_listings && offerApplied.bundle.applied_listings.length > 0) {
      return availability.units.filter(u => offerApplied.bundle.applied_listings.includes(u.id));
    }
    return availability.units;
  }, [availability, offerApplied]);

  const selectedUnit = useMemo(() => {
    if (!selectedUnitId) return null;
    // Prefer real availability data (with price for selected dates),
    // fall back to unitInfo (pre-loaded base data without dates)
    if (availability) return displayUnits.find(u => u.id === selectedUnitId) || unitInfo;
    return unitInfo;
  }, [availability, selectedUnitId, unitInfo, displayUnits]);

  const totalWithDiscount = useMemo(() => {
    if (!selectedUnit) return 0;
    // Simple logic for now, similar to page.tsx
    const extraGuests = Math.max(0, adults - selectedUnit.baseOccupancy);
    const extraCharge = extraGuests * (selectedUnit.extraPersonCharge || 0) * nights;

    let base = selectedUnit.totalPrice + extraCharge;

    let servicesTotal = 0;
    const guestsCount = adults + kids || 1;

    if (offerApplied && offerApplied.offerType === 'package' && offerApplied.bundle) {
      // 1. Base price is overridden by bundle price
      base = offerApplied.bundle.price;

      // 2. Extra nights? (Simple implementation: just use the bundle price as the base)
      // Extra nights logic could be added here if needed, but bundle covers the stay.
      
      // 3. Services total. Included services are free up to their qty.
      const included = offerApplied.bundle.included_services || [];
      const includedGuestsCount = offerApplied.bundle.base_guests || selectedUnit.baseOccupancy || 2;
      const extraGuestsCount = Math.max(0, guestsCount - includedGuestsCount);

      services.forEach(s => {
        if (selectedServiceIds.has(s.id)) {
          const bundleSvc = included.find((inc: any) => inc.service_id === s.id);
          if (bundleSvc && bundleSvc.isIncluded) {
            servicesTotal += (s.price || 0) * extraGuestsCount;
          } else {
            servicesTotal += (s.price || 0) * guestsCount;
          }
        }
      });
    } else {
      if (offerApplied) {
        if (offerApplied.offerType === 'fixed_price' || offerApplied.offerType === 'fixed_amount') {
          base -= offerApplied.offerAmount;
        } else if (offerApplied.offerType === 'percentage') {
          base = Math.round(base * (1 - offerApplied.offerAmount / 100));
        }
      }
      if (base < 0) base = 0;

      services.forEach(s => {
        if (selectedServiceIds.has(s.id)) {
          servicesTotal += (s.price || 0) * guestsCount;
        }
      });
    }

    return base + servicesTotal;
  }, [selectedUnit, adults, nights, services, selectedServiceIds, offerApplied]);

  // ─── Actions ───
  const fetchAvailability = useCallback(async (ci: string, co: string) => {
    if (isPreview) {
      setLoadingAvail(true);
      await new Promise(r => setTimeout(r, 800));
      const mockData: AvailabilityResponse = {
        checkIn: ci,
        checkOut: co,
        nights: Math.round((parseDate(co).getTime() - parseDate(ci).getTime()) / 86400000),
        units: [
          {
            id: 'mock-1', name: 'Premium Glamping Tent', code: 'P1', beds: 2, unitTypeId: 't1', typeName: 'Tent', typeCode: 'T',
            description: 'Beautiful tent with view', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, baseOccupancy: 2,
            avgPricePerNight: 2500, totalPrice: 2500 * 2, currency: 'Kč', extraPersonCharge: 500, petAllowed: true, petCharge: 200,
            photos: [],
            amenities: [{ icon: 'wifi', name: 'Wi-Fi' }, { icon: 'coffee', name: 'Coffee' }]
          },
          {
            id: 'mock-2', name: 'Eco Wood Cabin', code: 'C1', beds: 4, unitTypeId: 't2', typeName: 'Cabin', typeCode: 'C',
            description: 'Cozy cabin in woods', maxAdults: 4, maxChildren: 2, maxOccupancy: 6, baseOccupancy: 2,
            avgPricePerNight: 3200, totalPrice: 3200 * 2, currency: 'Kč', extraPersonCharge: 600, petAllowed: false, petCharge: 0,
            photos: [],
            amenities: [{ icon: 'fireplace', name: 'Fireplace' }]
          }
        ]
      };
      setAvailability(mockData);
      setLoadingAvail(false);
      return mockData;
    }

    setLoadingAvail(true);
    try {
      const params = new URLSearchParams({ checkIn: ci, checkOut: co });
      if (siteId) params.set('siteId', siteId);
      if (siteSlug) params.set('siteSlug', siteSlug);
      const res = await fetch(`${API_BASE}/api/booking/availability?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAvailability(data);
        setLoadingAvail(false);
        if (data.units?.length === 0) {
          findNextAvailable(co);
        }
        return data;
      }
    } catch (e) { console.error(e); }
    setLoadingAvail(false);
    return null;
  }, [siteId, siteSlug]);

  const findNextAvailable = async (co: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/widget/calendar?month=${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}${siteId ? `&siteId=${siteId}` : ''}${siteSlug ? `&siteSlug=${siteSlug}` : ''}`);
      const data = await res.json();
      if (data.days) {
        const next = data.days.find((d: any) => d.status === 'available' && d.date > co);
        if (next) setNextAvailable(next.date);
      }
    } catch (e) { console.error(e); }
  };

  const joinWaitlist = async () => {
    if (!email || !checkIn || !checkOut) return;
    setWaitlistStatus('submitting');
    try {
      await fetch(`${API_BASE}/api/booking/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, checkIn, checkOut, email, phone, name: `${firstName} ${lastName}` })
      });
      setWaitlistStatus('success');
    } catch (e) { console.error(e); }
  };

  const handleDayClick = (dateStr: string) => {
    const clickedDate = parseDate(dateStr);
    if (clickedDate < today) return;

    // Toggle off if clicking the only selected date
    if (dateStr === checkIn && !checkOut) {
      setCheckIn(null);
      setSelectingCheckOut(false);
      return;
    }
    
    // Toggle off everything if clicking either end of a selected range
    if (checkIn && checkOut && (dateStr === checkIn || dateStr === checkOut)) {
      setCheckIn(null);
      setCheckOut(null);
      setSelectingCheckOut(false);
      return;
    }

    if (!checkIn || (checkIn && checkOut) || !selectingCheckOut) {
      setCheckIn(dateStr);
      setCheckOut(null);
      setSelectingCheckOut(true);
    } else {
      if (clickedDate <= parseDate(checkIn!)) {
        setCheckIn(dateStr);
        setCheckOut(null);
      } else {
        setCheckOut(dateStr);
        setSelectingCheckOut(false);
        fetchAvailability(checkIn!, dateStr);
      }
    }
  };

  const goToStep = (s: number) => {
    // Skip Step 2 backwards/forwards if only 1 unit exists or unit is locked
    if (s === 2 && (displayUnits.length === 1 || (selectedUnitId && step === 3))) {
      if (step === 3) {
        setStep(1); // Go back from guest info to dates
      } else {
        setStep(3); // Go forward from dates to guest info
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Skip Step 4 if no services
    if (s === 4 && services.length === 0 && !loadingServices) {
      if (step === 5) {
        setStep(3); // Go back from payment to guest info
      } else {
        setStep(5); // Go forward from guest info to payment
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setStep(s);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Notify parent of resize if in iframe
    if (typeof window !== 'undefined' && window.parent !== window) {
      setTimeout(() => {
        window.parent.postMessage({ source: 'alisio-widget', event: 'resize', height: document.body.scrollHeight }, '*');
      }, 100);
    }
  };

  const resolvedSiteId = siteId || siteConfig?.id || '';

  const handleApplyOffer = useCallback(async (codeToApply?: string | React.MouseEvent) => {
    const code = (typeof codeToApply === 'string' ? codeToApply : couponCode).trim().toUpperCase();
    if (!code) return;
    // siteId might be undefined if loaded via slug — use siteConfig.id or siteSlug as fallback
    const sId = siteId || siteConfig?.id || siteSlug || '';
    setApplyingOffer(true);
    setOfferError('');
    try {
      const uId = selectedUnitId || '';
      // Use /activate alias — ad-blocker-friendly (avoids "offer" trigger in URL)
      const res = await fetch(`${API_BASE}/api/booking/activate?code=${encodeURIComponent(code)}&unitId=${uId}&siteId=${sId}`);
      const data = await res.json();
      if (data.valid) {
        setOfferApplied({ code: data.code, offerType: data.discount_type, offerAmount: data.offer_amount, description: data.description, bundle: data.bundle ? { ...data.bundle, included_services: data.bundle.included_services?.map((inc: any) => ({ service_id: inc.service_id, isIncluded: inc.free })) } : undefined });
        setShowOffer(false);
        // If it's a package, automatically select the included services
        if (data.discount_type === 'package' && data.bundle?.included_services) {
          const newServices = new Set(selectedServiceIds);
          data.bundle.included_services.forEach((inc: any) => {
            if (inc.free || inc.isIncluded) newServices.add(inc.service_id);
          });
          setSelectedServiceIds(newServices);
        }
        // If bundle is restricted to exactly 1 unit — auto-select it and skip step 2
        if (data.discount_type === 'package' && data.bundle?.applied_listings?.length === 1) {
          setSelectedUnitId(data.bundle.applied_listings[0]);
        }
      } else {
        setOfferApplied(null);
        setOfferError(data.error || 'Invalid code');
      }
    } catch (err) {
      setOfferError('Server error');
    } finally {
      setApplyingOffer(false);
    }
  }, [couponCode, siteId, siteSlug, siteConfig, selectedUnitId, selectedServiceIds]);

  // Auto-apply bundle/offer from URL — fires when mounted AND site identity is known
  useEffect(() => {
    if (!isMounted) return;
    // Wait until we have some site identity (either siteSlug from URL path, or siteId from prop)
    const hasSite = !!(siteId || siteSlug);
    if (couponCode && !offerApplied && !applyingOffer && !offerError && hasSite) {
      handleApplyOffer(couponCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, couponCode, offerApplied, siteId, siteSlug]);

  const submitBooking = async () => {
    if (!checkIn || !checkOut || !selectedUnitId || !firstName || !lastName || !phone) {
      setError(v3t.errorReq);
      return;
    }

    if (isPreview) {
      setSubmitting(true);
      await new Promise(r => setTimeout(r, 1000));
      setReservation({
        success: true,
        reservationId: 'MOCK-123',
        unitName: selectedUnit?.name || 'Mock House',
        checkIn, checkOut, nights,
        totalPrice: totalWithDiscount,
        currency: 'Kč'
      });
      setSubmitting(false);
      goToStep(4);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/booking/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: selectedUnitId,
          checkIn,
          checkOut,
          adults,
          children: kids,
          firstName,
          lastName,
          email,
          phone,
          siteId: siteId || undefined,
          couponCode: offerApplied?.code || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setReservation(data);
        goToStep(4);
      } else {
        const err = await res.json();
        if (res.status === 409) {
          setError(null);
          alert('Вибачте, ці дати для цього будиночка вже заброньовані. Оберіть інший будиночок або дати.');
          setCheckIn(null);
          setCheckOut(null);
          setSelectedUnitId(null);
          setAvailability(null);
          goToStep(1);
        } else {
          setError(err.error || 'Failed to book');
        }
      }
    } catch (e) { setError('Connection error'); }
    setSubmitting(false);

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('alisio_guest_data', JSON.stringify({ firstName, lastName, email, phone }));
    }
  };

  const toggleService = async (id: string) => {
    // Optimistic update
    setSelectedServiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    if (reservation?.reservationId && !isPreview) {
      try {
        await fetch(`${API_BASE}/api/booking/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'book-toggle',
            serviceId: id,
            reservationId: reservation.reservationId,
            siteSlug,
            quantity: adults + kids || 1
          })
        });
      } catch (e) { console.error('Toggle service error:', e); }
    }
  };

  const startPayment = async () => {
    if (!reservation) return;
    if (isPreview) {
      setSubmitting(true);
      await new Promise(r => setTimeout(r, 1000));
      setSubmitting(false);
      goToStep(6);
      return;
    }
    if (!siteSlug) { goToStep(6); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/booking/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: reservation.reservationId,
          site_slug: siteSlug,
          return_path: window.location.href.split('?')[0] + `?res_id=${reservation.reservationId}&payment_status=success`
        }),
      });
      if (res.status === 403) {
        // Payment not configured — treat as manual invoice flow
        goToStep(6);
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      if (data.session_url) {
        try {
          if (window.top) {
            window.top.location.href = data.session_url;
          } else {
            window.location.href = data.session_url;
          }
        } catch (e) {
          // Fallback if cross-origin restricts window.top
          window.location.href = data.session_url;
        }
      } else {
        setError(data.error || 'Payment failed to start');
      }
    } catch (e) {
      console.error(e);
      setError('Payment gateway error');
    }
    setSubmitting(false);
  };

  // In preview, always use the live design prop (it changes when user picks a theme).
  // In production, prefer siteDesign fetched from API, fall back to design prop.
  const activeDesign = isPreview ? (design || siteDesign) : (siteDesign || design);

  // Dynamic styles based on design config
  const dynamicStyles = useMemo(() => {
    const d = activeDesign;
    if (!d) return {};
    const styles: any = {};
    if (d.primary_color) {
      styles['--moss'] = d.primary_color;
      styles['--moss-dark'] = d.primary_color;
      styles['--accent-primary'] = d.primary_color;
    }
    if (d.button_style) {
      const isSharp = d.button_style.includes('sharp');
      const isPill = d.button_style.includes('pill');
      styles['--radius'] = isSharp ? '2px' : isPill ? '24px' : '12px';
      styles['--radius-lg'] = isSharp ? '4px' : isPill ? '32px' : '16px';
    }
    if (d.show_shadow !== undefined) {
      styles['--shadow'] = d.show_shadow ? '0 8px 32px rgba(0,0,0,0.12)' : 'none';
    }
    return styles;
  }, [activeDesign]);

  // Sync html/body background to match the widget theme
  // (prevents white gaps from globals.css on /w/ pages)
  useEffect(() => {
    if (isPreview) return;
    const theme = activeDesign?.theme?.toLowerCase() || '';
    const BG_MAP: Record<string, string> = {
      dark:      '#0f172a',
      luxury:    '#0d0d1a',
      nature:    '#f0fdf4',
      ocean:     '#ecfeff',
      sunset:    '#fff7ed',
      nordic:    '#f8fafc',
      minimal:   '#fafafa',
      modern:    '#f1f5f9',
      classical: '#fdf8f0',
    };
    const bg = BG_MAP[theme] || '#FAFAF7';
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, [activeDesign]);

  const invalidNightsMsg = offerApplied?.offerType === 'package' && offerApplied.bundle?.nights_included && nights > 0 && nights !== offerApplied.bundle.nights_included
    ? t.packageNightsError(offerApplied.bundle.nights_included)
    : null;

  return (
    <div className={`v3-body ${activeDesign?.theme?.toLowerCase() || ''}`} style={dynamicStyles} id="alisio-widget-v3">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      <div className="v3-wrap">
        {/* TOP BAR */}
        <div className="v3-topbar">
          <button className="v3-back-btn" onClick={() => step > 1 && goToStep(step - 1)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="v3-topbar-center">
            {/* Brand removed as requested */}
          </div>
          <div className="v3-topbar-right">
            {/* Lang removed as requested */}
          </div>
        </div>

        {/* PROGRESS */}
        {step < 6 && (
          <div className="v3-progress">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className={`v3-progress-step ${step >= s ? 'active' : ''}`} />
            ))}
          </div>
        )}

        {/* STEP 1: DATES + GUESTS */}
        <div className={`v3-step ${step === 1 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.selectDates}</h1>
          <p className="v3-step-sub">{selectedUnit ? `${t.youSelected} ${selectedUnit.name}. ${t.checkDetailsBelow}` : t.checkDetailsBelow}</p>

          {selectedUnit && (
            <div className="v3-house-lock">
              <div
                className="v3-house-lock-thumb"
                style={{
                  backgroundImage: selectedUnit.photos?.[0] ? `url(${selectedUnit.photos[0]})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  backgroundColor: 'var(--moss)'
                }}
              >
                {!selectedUnit.photos?.[0] && (
                  <svg viewBox="0 0 54 54">
                    <polygon points="12,30 27,16 42,30 42,44 12,44" fill="rgba(255,255,255,0.4)" />
                    <polygon points="8,30 27,14 46,30" fill="rgba(255,255,255,0.6)" />
                    <rect x="23" y="34" width="8" height="10" fill="rgba(0,0,0,0.2)" />
                  </svg>
                )}
              </div>
              <div className="v3-house-lock-info">
                <div className="v3-house-lock-label">{t.accommodation}</div>
                <div className="v3-house-lock-name">{tName(selectedUnit, 'name', lang)}</div>
                <div className="v3-house-lock-feat">
                  {getOccupancyString(selectedUnit)} · {selectedUnit.typeName}
                </div>
                <div className="v3-house-times">
                  <span>{t.checkInShort || 'Заїзд'} {v3t.fromTime} 15:00</span>
                  <span className="v3-house-times-sep">·</span>
                  <span>{t.checkOutShort || 'Виїзд'} {v3t.toTime} 11:00</span>
                </div>
              </div>
            </div>
          )}

          {/* Change unit button — temporarily hidden
          {selectedUnitId && calOpen && (
            <button className="v3-change-unit-btn" onClick={() => {
              setSelectedUnitId(null);
              setAvailability(null);
              setUnitInfo(null);
              setCalOpen(false);
            }}>
              ↺ Не знайшли вільну дату? Оберіть інший варіант
            </button>
          )}
          */}

          <div className="v3-dates" onClick={() => setCalOpen(true)}>
            <div className={`v3-date-cell ${(checkIn && checkOut) || !selectingCheckOut ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectingCheckOut(false); setCalOpen(true); }}>
              <div className="v3-date-cell-label">{t.checkIn}</div>
              <div className="v3-date-cell-value">{checkIn ? formatDisplayDate(checkIn, lang) : '—'}</div>
              <div className="v3-date-cell-sub">{v3t.fromTime} 15:00</div>
            </div>
            <div className="v3-date-div"></div>
            <div className={`v3-date-cell ${(checkIn && checkOut) || selectingCheckOut ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectingCheckOut(true); setCalOpen(true); }}>
              <div className="v3-date-cell-label">{t.checkOut}</div>
              <div className="v3-date-cell-value">{checkOut ? formatDisplayDate(checkOut, lang) : '—'}</div>
              <div className="v3-date-cell-sub">
                {nights > 0 ? `${nights} ${t.nightsShort}` : ''} · {v3t.toTime} 11:00
              </div>
            </div>
            <div className="v3-dates-cal-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className={`v3-cal-wrap ${calOpen ? 'open' : ''}`}>
            <div className="v3-cal-head">
              <div className="v3-cal-month">
                {new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1).toLocaleDateString({ uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' }[lang] || 'uk-UA', { month: 'long', year: 'numeric' })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div className="v3-cal-nav">
                  <button className="v3-cal-btn" onClick={(e) => { e.stopPropagation(); setCalMonthOffset(o => o - 1); }}>‹</button>
                  <button className="v3-cal-btn" onClick={(e) => { e.stopPropagation(); setCalMonthOffset(o => o + 1); }}>›</button>
                </div>
                <button className="v3-cal-close" onClick={() => setCalOpen(false)} title="Закрити">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="v3-cal-months-grid">
            {(() => {
              const sortedBusy = Array.from(busyDates).sort();
              const firstBusyAfterCheckin = checkIn
                ? sortedBusy.find(d => d > checkIn) || null
                : null;

              return [0, 1].map(offset => {
                const year = today.getFullYear();
                const month = today.getMonth() + calMonthOffset + offset;
                const monthName = new Date(year, month, 1).toLocaleDateString({ uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' }[lang] || 'uk-UA', { month: 'long', year: 'numeric' });
                const daysInM = getDaysInMonth(year, month);
                const first = getFirstDayOfMonth(year, month);

                return (
                  <div key={offset} className="v3-month-section">
                    <div className="v3-month-divider">{monthName}</div>
                    <div className="v3-cal-weekdays">
                      {[...t.dayNamesShort.slice(1), t.dayNamesShort[0]].map(d => <div key={d} className="v3-cal-weekday">{d}</div>)}
                    </div>
                    <div className="v3-cal-days">
                      {(() => {
                        const cells = [];
                        for (let i = 0; i < first; i++) cells.push(<div key={`e-${i}`} className="v3-cal-day muted" />);
                        for (let d = 1; d <= daysInM; d++) {
                          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          const isPast = parseDate(ds) < today;
                          const isBusy = busyDates.has(ds);
                          const isPartial = !isBusy && partialDates.has(ds);
                          const isCheckoutOnly = checkIn && ds === firstBusyAfterCheckin;
                          const unitInAvail = availability?.units.find(u => u.id === selectedUnitId);
                          const dayPrice = unitInAvail?.prices?.find(p => p.date === ds)?.price || (ds >= (checkIn || '') && ds < (checkOut || '') ? unitInAvail?.avgPricePerNight : null);

                          let cls = 'v3-cal-day';
                          if (isPast || (isBusy && !isCheckoutOnly)) cls += ' muted';
                          if (isBusy && !isCheckoutOnly) cls += ' busy';
                          if (isCheckoutOnly && ds !== checkOut) cls += ' checkout-only';
                          if (isPartial) cls += ' partial';
                          if (ds === checkIn) cls += ' start';
                          if (ds === checkOut) cls += ' end';
                          if (checkIn && checkOut && ds > checkIn && ds < checkOut) cls += ' in-range';

                          cells.push(
                            <div key={d} className={cls} onClick={(e) => {
                              e.stopPropagation();
                              if (!isPast && (!isBusy || isCheckoutOnly)) handleDayClick(ds);
                            }}>
                              <span className="v3-cal-day-num">{d}</span>
                              {dayPrice && !isBusy && !isPast && (
                                <span className="v3-cal-day-price">
                                  {Math.round(dayPrice)}
                                </span>
                              )}
                            </div>
                          );
                        }
                        return cells;
                      })()}
                    </div>
                  </div>
                );
              });
            })()}
            </div>

            {/* Calendar footer actions */}
            <div className="v3-cal-footer">
              <button
                className={`v3-cal-footer-btn clear ${(checkIn || checkOut) ? 'active' : ''}`}
                onClick={() => {
                  setCheckIn(null);
                  setCheckOut(null);
                  setSelectingCheckOut(false);
                  setAvailability(null);
                }}
              >
                {v3t.clear}
              </button>
              <button
                className={`v3-cal-footer-btn ok ${(checkIn && checkOut) ? 'active' : ''}`}
                disabled={!checkIn || !checkOut}
                onClick={() => setCalOpen(false)}
              >
                OK · {nights > 0 ? `${nights} ${t.nightsShort}` : v3t.chooseDatesShort}
              </button>
            </div>
          </div>

          <div className="v3-guests">
            <div>
              <div className="v3-guests-label">{t.adults}</div>
              <div className="v3-guests-sub">18+</div>
            </div>
            <div className="v3-stepper">
              <button className="v3-stepper-btn" onClick={() => setAdults(Math.max(1, adults - 1))}>−</button>
              <span className="v3-stepper-val">{adults}</span>
              <button
                className="v3-stepper-btn"
                disabled={selectedUnit ? adults >= selectedUnit.maxAdults : adults >= (siteConfig?.maxAdults || 2)}
                onClick={() => setAdults(prev => Math.min(prev + 1, selectedUnit?.maxAdults ?? (siteConfig?.maxAdults || 2)))}
              >+</button>
            </div>
          </div>

          <div className="v3-guests">
            <div>
              <div className="v3-guests-label">{t.children}</div>
              <div className="v3-guests-sub">0–17</div>
            </div>
            <div className="v3-stepper">
              <button className="v3-stepper-btn" onClick={() => setKids(Math.max(0, kids - 1))}>−</button>
              <span className="v3-stepper-val">{kids}</span>
              <button
                className="v3-stepper-btn"
                disabled={selectedUnit ? kids >= selectedUnit.maxChildren || (adults + kids) >= (selectedUnit.maxOccupancy + 1) : kids >= (siteConfig?.maxChildren || 2)}
                onClick={() => setKids(prev => {
                  if (selectedUnit) {
                    if (prev >= selectedUnit.maxChildren) return prev;
                    if ((adults + prev) >= (selectedUnit.maxOccupancy + 1)) return prev;
                  } else if (prev >= (siteConfig?.maxChildren || 2)) return prev;
                  return prev + 1;
                })}
              >+</button>
            </div>
          </div>

          {/* Occupancy notice */}
          {kids > 0 && (
            <div className="v3-occupancy-notice">
              <span className="v3-occupancy-notice-icon">🛏️</span>
              <span>{t.kidsOccupancyNotice}</span>
            </div>
          )}

          <div className="v3-offer-section">
            {!offerApplied && (
              <button className="v3-offer-toggle" onClick={() => setShowOffer(!showOffer)}>
                {showOffer ? '−' : '+'} {t.couponCode} / {t.certificateCode}
              </button>
            )}
            {offerApplied && (() => {
                const offerAmt = offerApplied.offerAmount;
                const offerLabel = offerApplied.offerType === 'percentage'
                  ? `-${offerAmt}%`
                  : offerApplied.offerType === 'package'
                    ? `${t.packagePrefix} — ${offerApplied.description || offerApplied.code}`
                    : `-${offerAmt} Kč`;
                return (
                  <div className="v3-offer-success">
                    {'🏷️'} {offerApplied.code}: {offerLabel}
                    {invalidNightsMsg && <div style={{ marginTop: 12, padding: '10px 14px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: '8px' }}>⚠️ {invalidNightsMsg}</div>}
                  </div>
                );
              })()}
            {!offerApplied && showOffer && (
              <div className="v3-offer-field">
                <input
                  className="v3-field-input"
                  placeholder={t.couponCode}
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value); setOfferError(''); }}
                  onKeyDown={e => e.key === 'Enter' && !applyingOffer && handleApplyOffer()}
                />
                <button
                  className="v3-offer-apply"
                  onClick={handleApplyOffer}
                  disabled={applyingOffer || !couponCode.trim()}
                >
                  {applyingOffer ? '...' : t.apply}
                </button>
              </div>
            )}
              {offerError && <div className="v3-offer-error">{offerError}</div>}
          </div>
        </div>

        {/* STEP 2: HOUSE LIST / DETAILS */}
        <div className={`v3-step ${step === 2 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{selectedUnitId ? (t.yourSelection || 'Ваш вибір') : t.selectAccommodation}</h1>
          <p className="v3-step-sub">{selectedUnitId ? v3t.checkDetails : t.availableForDates}</p>

          {/* Loading skeleton — only when no unit info available yet */}
          {loadingAvail && !selectedUnit && (
            <div className="v3-house-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="v3-house-lock skeleton">
                  <div className="v3-house-lock-thumb skeleton-anim" />
                  <div className="v3-house-lock-info">
                    <div style={{ height: 8, width: '40%', background: 'var(--line)', borderRadius: 4, marginBottom: 8 }} className="skeleton-anim" />
                    <div style={{ height: 12, width: '70%', background: 'var(--line)', borderRadius: 4, marginBottom: 8 }} className="skeleton-anim" />
                    <div style={{ height: 8, width: '30%', background: 'var(--line)', borderRadius: 4 }} className="skeleton-anim" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unit selection list — only when no unit is pre-selected */}
          {!loadingAvail && !selectedUnitId && (
            <div className="v3-house-list">
              {displayUnits.length === 0 ? (
                <div className="v3-no-avail">
                  <div className="v3-no-avail-icon">💭</div>
                  <h3>{t.noUnitsFound}</h3>
                  <p>{t.noAvailabilityDesc}</p>

                  {nextAvailable && (
                    <div className="v3-flex-dates">
                      <div className="v3-flex-dates-label">{v3t.tryTheseDates}</div>
                      <button className="v3-flex-dates-btn" onClick={() => {
                        setCheckIn(nextAvailable);
                        setCheckOut(null);
                        setSelectingCheckOut(true);
                        setStep(1);
                        setCalOpen(true);
                      }}>
                        {v3t.availFrom} {formatDisplayDate(nextAvailable, lang)}
                      </button>
                    </div>
                  )}

                  <div className="v3-waitlist">
                    <div className="v3-waitlist-title">{v3t.waitlistTitle}</div>
                    <p>{v3t.waitlistSub}</p>
                    {waitlistStatus === 'success' ? (
                      <div className="v3-waitlist-done">{v3t.subscribed}</div>
                    ) : (
                      <div className="v3-waitlist-form">
                        <input className="v3-waitlist-input" placeholder={v3t.yourEmail} value={email} onChange={e => setEmail(e.target.value)} />
                        <button className="v3-waitlist-btn" onClick={joinWaitlist} disabled={waitlistStatus === 'submitting'}>
                          {waitlistStatus === 'submitting' ? '...' : v3t.subscribe}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Deduplicate units by id to prevent duplicate key warnings
                displayUnits
                  .filter((u, idx, arr) => arr.findIndex(x => x.id === u.id) === idx)
                  .map(u => {
                    const isSelected = selectedUnitId === u.id;
                    return (
                      <div
                        key={u.id}
                        className={`v3-house-lock select ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedUnitId(u.id)}
                      >
                        <div className="v3-house-lock-thumb" style={{ background: 'linear-gradient(135deg,#6B8A5F,#2F4F2B)' }}>
                          <svg viewBox="0 0 54 54">
                            <polygon points="12,30 27,16 42,30 42,44 12,44" fill={isSelected ? '#fff' : '#C9844A'} />
                            <polygon points="8,30 27,14 46,30" fill={isSelected ? '#fff' : '#8B5A2B'} />
                          </svg>
                        </div>
                        <div className="v3-house-lock-info">
                          <div className="v3-house-lock-label">{tName(u, 'typeName', lang)}</div>
                          <div className="v3-house-lock-name">{tName(u, 'name', lang)}</div>
                          <div className="v3-house-lock-feat">
                            {getOccupancyString(u)} · <strong>{formatPrice(u.totalPrice, siteCurrency)}</strong>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="v3-house-lock-check">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
              {displayUnits.length > 0 && socialProof && (
                <div className="v3-social-badges">
                  <div className="v3-badge viewers">
                    <span className="v3-badge-dot pulse"></span>
                    {socialProof.viewers} {v3t.viewersNow}
                  </div>
                  <div className="v3-badge last-book">
                    ⏱ {v3t.lastBooking}: {socialProof.lastBooking}
                  </div>
                </div>
              )}
            </div>
          )}
          {selectedUnit && (
            <div className="v3-house-detail-fade">
              <div className="v3-gallery">
                <div className="v3-gallery-main" onClick={() => {
                  if (selectedUnit.photos?.length > 1) {
                    setCurrentImgIndex(prev => (prev + 1) % selectedUnit.photos.length);
                  }
                }}>
                  {selectedUnit.photos && selectedUnit.photos.length > 0 ? (
                    <img
                      src={selectedUnit.photos[currentImgIndex % selectedUnit.photos.length]}
                      alt={selectedUnit.name}
                      className="v3-gallery-img"
                    />
                  ) : (
                    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                      <defs>
                        <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#A4B996" stopOpacity=".6" />
                          <stop offset="100%" stopColor="#2F4F2B" />
                        </linearGradient>
                      </defs>
                      <rect width="400" height="300" fill="url(#sky2)" />
                      <path d="M0,300 L0,180 L30,150 L25,125 L40,100 L55,125 L50,150 L80,170 L75,140 L90,115 L105,140 L110,170 L140,190 L160,300 Z" fill="#1F3220" opacity=".85" />
                      <path d="M260,300 L260,170 L290,145 L285,120 L300,95 L315,120 L310,145 L340,165 L350,300 Z" fill="#1F3220" opacity=".85" />
                      <g transform="translate(150,120)">
                        <polygon points="-10,40 50,0 110,40 110,100 -10,100" fill="#C9844A" />
                        <polygon points="-15,40 50,-5 115,40" fill="#8B5A2B" />
                        <rect x="20" y="55" width="20" height="30" fill="#F6F1E8" opacity=".9" />
                        <rect x="65" y="55" width="20" height="30" fill="#F6F1E8" opacity=".9" />
                        <rect x="42" y="70" width="18" height="30" fill="#5A3A1A" />
                        <circle cx="50" cy="0" r="3" fill="#FFD580" />
                        <line x1="50" y1="-5" x2="50" y2="-18" stroke="#5A3A1A" strokeWidth="1.5" />
                      </g>
                      <ellipse cx="200" cy="270" rx="250" ry="10" fill="#F6F1E8" opacity=".3" />
                    </svg>
                  )}
                  {selectedUnit.photos?.length > 1 && (
                    <div className="v3-gallery-nav">
                      <button className="v3-gallery-arrow left" onClick={(e) => { e.stopPropagation(); setCurrentImgIndex(prev => (prev - 1 + selectedUnit.photos.length) % selectedUnit.photos.length); }}>‹</button>
                      <button className="v3-gallery-arrow right" onClick={(e) => { e.stopPropagation(); setCurrentImgIndex(prev => (prev + 1) % selectedUnit.photos.length); }}>›</button>
                    </div>
                  )}
                </div>
                {selectedUnit.photos?.length > 1 && (
                  <div className="v3-gallery-dots">
                    {selectedUnit.photos.map((_, i) => (
                      <div key={i} className={`v3-gallery-dot ${i === currentImgIndex ? 'active' : ''}`} onClick={() => setCurrentImgIndex(i)} />
                    ))}
                  </div>
                )}
                {selectedUnit.photos?.length > 0 && (
                  <div className="v3-gallery-count">{(currentImgIndex % selectedUnit.photos.length) + 1} / {selectedUnit.photos.length}</div>
                )}
              </div>
              <h1 className="v3-house-detail-name">{tName(selectedUnit, 'name', lang)}</h1>
              <div className="v3-house-detail-meta">{tName(selectedUnit, 'typeName', lang)} · {getOccupancyString(selectedUnit)}</div>
              <div className="v3-amenities">
                {(selectedUnit.amenities && selectedUnit.amenities.length > 0) ? selectedUnit.amenities.map((a: any, i: number) => (
                  <div key={i} className="v3-amenity">
                    <span className="v3-amenity-icon">{a.icon || '✓'}</span>
                    {tName(a, 'name', lang)}
                  </div>
                )) : (
                  <>
                    <div className="v3-amenity"><span className="v3-amenity-icon">🛁</span>Джакузі на терасі</div>
                    <div className="v3-amenity"><span className="v3-amenity-icon">🔥</span>Камін дров'яний</div>
                    <div className="v3-amenity"><span className="v3-amenity-icon">☕</span>Кухня повна</div>
                    <div className="v3-amenity"><span className="v3-amenity-icon">📶</span>Wi-Fi 100 Mbps</div>
                  </>
                )}
              </div>
              <div className="v3-house-desc">{selectedUnit.description}</div>
            </div>
          )}
        </div>

        {/* STEP 3: CONTACTS */}
        <div className={`v3-step ${step === 3 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.guestInfoTitle}</h1>
          <p className="v3-step-sub">{t.confirmationEmailNote}</p>

          <div className="v3-field">
            <label className="v3-field-label">{t.firstName} & {t.lastName}</label>
            <div className="v3-field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input className="v3-field-input" placeholder={t.firstName} value={firstName} onChange={e => setFirstName(e.target.value)} />
              <input className="v3-field-input" placeholder={t.lastName} value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="v3-field">
            <label className="v3-field-label">{t.email}</label>
            <input className="v3-field-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="v3-field">
            <label className="v3-field-label">{t.phone}</label>
            <input className="v3-field-input" type="tel" placeholder="+420..." value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>

        {/* STEP 4: SERVICES */}
        <div className={`v3-step ${step === 4 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.addToStayTitle || 'Додати до відпочинку?'}</h1>
          <p className="v3-step-sub">{t.everythingOptional || 'Все опційне. Можна пропустити і додати пізніше.'}</p>

          {offerApplied?.offerType === 'package' && offerApplied.bundle?.included_services?.some((inc: any) => services.some(s => s.id === inc.service_id)) && (() => {
             const guestsCount = adults + kids || 1;
             const includedGuestsCount = offerApplied.bundle.base_guests || selectedUnit?.baseOccupancy || 2;
             const extraGuestsCount = Math.max(0, guestsCount - includedGuestsCount);
             
             const extraGuestsText = {
               uk: `* Ваш пакет покриває послуги для ${includedGuestsCount} гостей. Для додаткових ${extraGuestsCount} гостей послуги розраховуються за стандартним прайсом.`,
               en: `* Your package covers services for ${includedGuestsCount} guests. Services for ${extraGuestsCount} extra guest${extraGuestsCount === 1 ? '' : 's'} will be charged at the standard rate.`,
               de: `* Ihr Paket umfasst Dienstleistungen für ${includedGuestsCount} Gäste. Dienstleistungen für ${extraGuestsCount} weitere${extraGuestsCount === 1 ? 'n Gast' : ' Gäste'} werden zum Standardpreis berechnet.`,
               cs: `* Váš balíček zahrnuje služby pro ${includedGuestsCount} hosty. Služby pro ${extraGuestsCount} další hosty budou účtovány za standardní cenu.`
             }[lang] || `* Ваш пакет покриває послуги для ${includedGuestsCount} гостей...`;

             return (
               <div className="v3-occupancy-notice" style={{ background: 'rgba(47, 79, 43, 0.05)', borderColor: 'rgba(47, 79, 43, 0.2)', color: 'var(--moss)' }}>
                 <span className="v3-occupancy-notice-icon">🎁</span>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                   <span>{t.packageServicesNotice || 'Деякі послуги вже включені у ваш пакет. Ви можете обрати додаткові за бажанням.'}</span>
                   {extraGuestsCount > 0 && (
                     <span style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
                       {extraGuestsText}
                     </span>
                   )}
                 </div>
               </div>
             );
          })()}

          {loadingServices ? (
            <div className="v3-house-list">
              {[1, 2].map(i => (
                <div key={i} className="v3-service-card skeleton">
                  <div className="v3-service-body">
                    <div className="v3-service-visual skeleton-anim" />
                    <div className="v3-service-info">
                      <div style={{ height: 12, width: '60%', background: 'var(--line)', borderRadius: 4, marginBottom: 8 }} className="skeleton-anim" />
                      <div style={{ height: 8, width: '80%', background: 'var(--line)', borderRadius: 4 }} className="skeleton-anim" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="v3-house-list">
              {services.map(s => {
                const isSelected = selectedServiceIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    className={`v3-service-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleService(s.id)}
                  >
                    <div className="v3-service-body">
                      <div className="v3-service-visual" style={s.photoUrl ? { background: 'transparent' } : {}}>
                        {s.photoUrl ? (
                          <img src={s.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          s.icon || '📦'
                        )}
                      </div>
                      <div className="v3-service-info">
                        <div className="v3-service-name">{tName(s, 'name', lang)}</div>
                        <div className="v3-service-reason">{tName(s, 'description', lang)}</div>
                        <div className="v3-service-price-row">
                          {(() => {
                            const guestsCount = adults + kids || 1;
                            const isPkg = offerApplied?.offerType === 'package' && offerApplied.bundle;
                            const incSvc = isPkg ? offerApplied.bundle.included_services?.find((inc: any) => inc.service_id === s.id) : null;
                            const isFree = incSvc && incSvc.isIncluded;
                            
                            const includedGuestsCount = offerApplied?.bundle?.base_guests || selectedUnit?.baseOccupancy || 2;
                            const extraGuestsCount = Math.max(0, guestsCount - includedGuestsCount);
                            const includedForBaseText = {
                              uk: `Включено для ${includedGuestsCount} + `,
                              en: `Included for ${includedGuestsCount} + `,
                              de: `Für ${includedGuestsCount} inkl. + `,
                              cs: `Zahrnuto pro ${includedGuestsCount} + `
                            }[lang] || `Включено для ${includedGuestsCount} + `;

                            if (isFree) {
                              if (extraGuestsCount > 0) {
                                return <span className="v3-service-price" style={{ color: 'var(--moss)', fontWeight: 600 }}>{includedForBaseText}{formatPrice(s.price * extraGuestsCount, siteCurrency)}</span>;
                              }
                              return <span className="v3-service-price" style={{ color: 'var(--moss)', fontWeight: 600 }}>{t.includedInPackage || 'Включено в пакет'}</span>;
                            }
                            return <span className="v3-service-price">+ {formatPrice(s.price, siteCurrency)}</span>;
                          })()}
                          <div className="v3-service-toggle"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 4 action buttons */}
          <div className="v3-services-actions">
            <button
              className="v3-cta-btn"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => goToStep(5)}
            >
              <span>
                {services.filter(s => selectedServiceIds.has(s.id)).length > 0 ? (() => {
                  const validSelectedServices = services.filter(s => selectedServiceIds.has(s.id));
                  const servicesTotal = validSelectedServices
                    .reduce((sum, s) => {
                       const isPkg = offerApplied?.offerType === 'package' && offerApplied.bundle;
                       const incSvc = isPkg ? offerApplied.bundle.included_services?.find((inc: any) => inc.service_id === s.id) : null;
                       const guestsCount = adults + kids || 1;
                       const includedGuestsCount = offerApplied?.bundle?.base_guests || selectedUnit?.baseOccupancy || 2;
                       const extraGuestsCount = Math.max(0, guestsCount - includedGuestsCount);
                       
                       if (incSvc && incSvc.isIncluded) {
                         return sum + (s.price || 0) * extraGuestsCount;
                       }
                       return sum + (s.price || 0) * guestsCount;
                    }, 0);
                  return `${t.confirmServices} (${validSelectedServices.length})${servicesTotal > 0 ? ` · +${formatPrice(servicesTotal, siteCurrency)}` : ''}`;
                })() : t.next}
              </span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M5 3L10 8L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="v3-skip-link" onClick={() => { setSelectedServiceIds(new Set()); goToStep(5); }}>
              {t.skipLink || 'Пропустити — не треба нічого'}
            </button>
          </div>
        </div>

        {/* STEP 5: PAYMENT (Breakdown) */}
        <div className={`v3-step ${step === 5 ? 'visible' : ''}`}>
          <h1 className="v3-step-title">{t.paymentTitle}</h1>
          <p className="v3-step-sub">{siteConfig?.hasPayment ? t.securePaymentNote : t.paymentSubtitle}</p>

          <div className="v3-breakdown">
            <div className="v3-breakdown-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>{selectedUnit?.name} · {nights} {t.nightsShort}</span>
                <span className="v3-breakdown-val">
                  {offerApplied?.offerType === 'package' 
                    ? <span style={{ color: 'var(--moss)', fontWeight: 600 }}>{t.includedInPackage || 'Включено в пакет'}</span>
                    : formatPrice(selectedUnit?.totalPrice || 0, siteCurrency)
                  }
                </span>
              </div>
              {checkIn && checkOut && (
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4, width: '100%' }}>
                  {formatDisplayDate(checkIn, lang)} з 15:00 – {formatDisplayDate(checkOut, lang)} до 11:00
                </div>
              )}
            </div>

            {offerApplied?.offerType === 'package' && offerApplied.bundle && (
              <div className="v3-breakdown-row" style={{ color: 'var(--moss)' }}>
                <span>🏷️ {offerApplied.description || t.packagePrefix || 'Пакет'} "{offerApplied.code}"</span>
                <span className="v3-breakdown-val" style={{ fontWeight: 600 }}>{formatPrice(offerApplied.bundle.price, siteCurrency)}</span>
              </div>
            )}
            {offerApplied && offerApplied.offerType !== 'package' && (
              <div className="v3-breakdown-row" style={{ color: 'var(--moss)' }}>
                <span>🏷️ {t.couponCode || 'Промокод'} ({offerApplied.code})</span>
                <span className="v3-breakdown-val" style={{ fontWeight: 600 }}>
                  -{offerApplied.offerType === 'percentage' ? `${offerApplied.offerAmount}%` : formatPrice(offerApplied.offerAmount, siteCurrency)}
                </span>
              </div>
            )}
            {services.filter(s => selectedServiceIds.has(s.id)).map(s => {
              const guestsCount = adults + kids || 1;
              const isPkg = offerApplied?.offerType === 'package' && offerApplied.bundle;
              const incSvc = isPkg ? offerApplied.bundle.included_services?.find((inc: any) => inc.service_id === s.id) : null;
              const isFree = incSvc && incSvc.isIncluded;
              const includedGuestsCount = offerApplied?.bundle?.base_guests || selectedUnit?.baseOccupancy || 2;
              const extraGuestsCount = Math.max(0, guestsCount - includedGuestsCount);
              const extraTxt = { uk: 'додаткові', en: 'extra', de: 'weitere', cs: 'další' }[lang] || 'додаткові';

              const includedForText = { uk: 'Включено для', en: 'Included for', de: 'Inklusive für', cs: 'Zahrnuto pro' }[lang] || 'Включено для';
              return (
                <div key={s.id} className="v3-breakdown-row">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span>{tName(s, 'name', lang)} {isFree && extraGuestsCount === 0 ? '' : `× ${isFree ? extraGuestsCount : guestsCount}`} {isFree && extraGuestsCount > 0 ? `(${includedForText} ${includedGuestsCount})` : ''}</span>
                  </div>
                  <span className="v3-breakdown-val">
                    {isFree 
                      ? (extraGuestsCount > 0 
                          ? formatPrice(s.price * extraGuestsCount, siteCurrency)
                          : <span style={{ color: 'var(--moss)' }}>{t.includedInPackage || 'Включено в пакет'}</span>)
                      : formatPrice(s.price * guestsCount, siteCurrency)
                    }
                  </span>
                </div>
              );
            })}
            <div className="v3-breakdown-row total">
              <span>{t.total}</span>
              <span className="v3-breakdown-val">{formatPrice(totalWithDiscount, siteCurrency)}</span>
            </div>
          </div>

          {siteConfig?.hasPayment ? (
            <>
              <div className="v3-pay-method selected">
                <div className="v3-pay-method-radio"></div>
                <div className="v3-pay-method-info">
                  <div className="v3-pay-method-name">Teya Payment Gateway</div>
                  <div className="v3-pay-method-sub">Visa · Mastercard · Apple Pay</div>
                </div>
              </div>
              <div className="v3-trust-block">
                <div className="v3-trust-block-line"><span>{t.securePaymentNote}</span></div>
              </div>
            </>
          ) : (
            <div className="v3-invoice-notice">
              <div className="v3-invoice-notice-icon">📬</div>
              <div className="v3-invoice-notice-text">
                <strong>{v3t.bankTransfer}</strong>
                <p>{v3t.bankTransferDesc}</p>
              </div>
            </div>
          )}
        </div>

        {/* STEP 6: SUCCESS */}
        <div className={`v3-step ${step === 6 ? 'visible' : ''} success`}>
          <div className="v3-success-icon">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none"><path d="M7 15L12 20L23 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h1 className="v3-success-title">{t.bookedSuccess}</h1>
          <p className="v3-success-sub">{siteConfig?.config?.supportContact || t.supportContactNote}</p>

          <div className="v3-success-details">
            <div className="v3-success-row"><span>{t.bookingNumber}</span><strong>#{reservation?.reservationId.slice(-4).toUpperCase()}</strong></div>
            <div className="v3-success-row"><span>{t.accommodation}</span><strong>{reservation?.unitName}</strong></div>
            <div className="v3-success-row"><span>{t.checkIn}</span><strong>{reservation ? formatFullDate(reservation.checkIn, lang) : ''}</strong></div>
            <div className="v3-success-row"><span>{t.checkOut}</span><strong>{reservation ? formatFullDate(reservation.checkOut, lang) : ''}</strong></div>
          </div>
        </div>

        {/* STICKY CTA */}
        {step < 6 && (
          <div className="v3-cta-bar">
            <div className="v3-cta-inner">
              <div className="v3-cta-summary">
                <div className="v3-cta-summary-line1">
                  {checkIn && checkOut && nights > 0
                    ? `${nights} ${t.nightsShort.toUpperCase()} · ${adults + kids} ${t.guestsShort.toUpperCase()}`
                    : `${adults + kids} ${t.guestsShort.toUpperCase()}`
                  }
                </div>
                <div className="v3-cta-summary-line2">
                  {checkIn && checkOut && loadingAvail ? (
                    <span className="v3-cta-loader"></span>
                  ) : nights > 0 && totalWithDiscount > 0 ? (
                    formatPrice(totalWithDiscount, siteCurrency)
                  ) : nights > 0 && selectedUnit ? (
                    `${v3t.fromTimeBase} ${formatPrice(selectedUnit.avgPricePerNight, siteCurrency)} / ${v3t.nightBase}`
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.7 }}>{v3t.chooseDatesPrice}</span>
                  )}
                </div>
              </div>
              <button
                className={`v3-cta-btn ${((step === 1 && (!checkIn || !checkOut || !!invalidNightsMsg)) || (step === 2 && !selectedUnitId) || (step === 3 && (!firstName || !lastName || !phone || !email))) ? 'disabled' : ''}`}
                disabled={(step === 1 && (!checkIn || !checkOut || !!invalidNightsMsg)) || (step === 2 && !selectedUnitId) || (step === 3 && (!firstName || !lastName || !phone || !email))}
                onClick={() => {
                  if (step === 1) {
                    if (checkIn && checkOut && !invalidNightsMsg) {
                      // Skip step 2 if unit is already selected (from bundle auto-select or URL param)
                      // or if there's only 1 available unit
                      if (selectedUnitId || displayUnits.length === 1) {
                        if (!selectedUnitId && displayUnits.length === 1) {
                          setSelectedUnitId(displayUnits[0].id);
                        }
                        goToStep(3);
                      } else {
                        goToStep(2);
                      }
                    }
                  }
                  else if (step === 2) goToStep(3);
                  else if (step === 3) submitBooking();
                  else if (step === 4) goToStep(5);
                  else if (step === 5) startPayment();
                }}
              >
                <span>
                  {step === 5
                    ? (siteConfig?.hasPayment ? t.payNow : (t.finishBooking || 'Завершити'))
                    : (step === 1 ? t.selectDates
                      : (step === 3 ? (submitting ? t.processing : t.next) : t.next))}
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3L10 8L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
