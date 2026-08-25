'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Self check-in at the gate.
 *
 * The website's booking wizard is for someone planning a trip: it opens on a
 * choice of accommodation and a calendar reaching eleven months out. Whoever
 * scans the QR on the door is not planning anything — they have arrived, it may
 * be dark, and they want a spot, a price and a way in.
 *
 * So the flow is the same engine and the same stylesheet as /book, with the
 * planning removed: dates default to tonight, there is no browsing, and the
 * pitch is chosen by the system. Every screen is one decision.
 */
import { useState, useEffect, useMemo } from 'react';
import { loadPriceList, calcCampingPrice, getRate, formatPrice, getNightDates, type PriceItem, type CampingItemCode } from '../book/lib/pricing';
import { LANGS, ITEM_NAMES, T, type Lang } from './locales';

const WHATSAPP = 'https://wa.me/420723565616';
const ORDER: CampingItemCode[] = ['small_tent', 'large_tent', 'car', 'minibus', 'caravan', 'motorhome', 'motorcycle'];
const ICONS: Record<string, string> = {
  small_tent: '⛺', large_tent: '🏕️', car: '🚗', minibus: '🚐',
  caravan: '🚙', motorhome: '🚌', motorcycle: '🏍️',
};

type Screen = 'lang' | 'fork' | 'find' | 'camping' | 'contact' | 'done';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };

export default function CheckinPage() {
  const [lang, setLang] = useState<Lang>('cs');
  const [screen, setScreen] = useState<Screen>('lang');
  const t = T[lang];

  const [prices, setPrices] = useState<PriceItem[]>([]);
  useEffect(() => { loadPriceList().then(setPrices).catch(() => setPrices([])); }, []);

  // ── Find an existing booking ──────────────────────────────────────────────
  const [findPhone, setFindPhone] = useState('');
  const [findSurname, setFindSurname] = useState('');
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);

  async function doFind() {
    setFinding(true); setFindError(null);
    try {
      const res = await fetch('/api/public/checkin/find', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: findPhone, surname: findSurname }),
      });
      const data = await res.json();
      if (res.status === 429) { setFindError(t.throttled); return; }
      if (data.found && data.token) { window.location.href = `/guest/${data.token}`; return; }
      setFindError(data.found ? t.noPage : t.notFoundSub);
    } catch {
      setFindError(t.notFoundSub);
    } finally { setFinding(false); }
  }

  // ── Camping selection ─────────────────────────────────────────────────────
  const today = useMemo(() => iso(new Date()), []);
  const [checkOut, setCheckOut] = useState(() => addDays(iso(new Date()), 1));
  const [qty, setQty] = useState<Partial<Record<CampingItemCode, number>>>({});
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [electricity, setElectricity] = useState(false);
  const [pets, setPets] = useState(0);
  const [mhService, setMhService] = useState(false);

  const selectedItems = useMemo(() => {
    const arr: CampingItemCode[] = [];
    for (const code of Object.keys(qty) as CampingItemCode[]) {
      for (let i = 0; i < (qty[code] || 0); i++) arr.push(code);
    }
    return arr;
  }, [qty]);

  const nights = getNightDates(today, checkOut).length;
  const pricing = useMemo(
    () => (selectedItems.length ? calcCampingPrice(selectedItems, adults, children, electricity, pets, mhService, today, checkOut, prices) : null),
    [selectedItems, adults, children, electricity, pets, mhService, today, checkOut, prices],
  );

  const bump = (code: CampingItemCode, d: number) => setQty((p) => {
    const next = Math.max(0, (p[code] ?? 0) + d);
    if (next === 0 && code === 'motorhome') setMhService(false);
    return { ...p, [code]: next };
  });

  // ── Contact + create ──────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<{ token: string | null; unit: string | null } | null>(null);

  async function createBooking() {
    if (!name.trim() || !phone.trim()) { setSaveError(t.nameRequired); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch('/api/booking/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accommodation_type: 'camping',
          accommodation_data: {
            selectedItems, adults, children, electricity, pets,
            motorhomeService: mhService, checkIn: today, checkOut,
          },
          check_in: today, check_out: checkOut,
          extras: [],
          guest_name: name.trim(), guest_phone: phone.trim(), guest_email: '',
          total_price: pricing?.total ?? 0, deposit_amount: 0,
          // Marks the booking as made at the gate, not on the website — the
          // operations list needs to tell "walk-in, unpaid, standing here" from
          // "someone on the internet who may never come".
          source: 'checkin:qr',
          site_id: 'kemp-carlsbad',
          payment_method: 'reception',
          booked_at: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || 'Error'); return; }
      setResult({ token: data.guest_page_token || null, unit: data.unit_code || data.unit || null });
      setScreen('done');
    } catch (e: any) {
      setSaveError(e?.message || 'Error');
    } finally { setSaving(false); }
  }

  // ── Screens ───────────────────────────────────────────────────────────────
  const wrap = (children: any) => (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 40px' }}>{children}</div>
  );

  if (screen === 'lang') return wrap(<>
    <h1 className="kc-title" style={{ textAlign: 'center' }}>Kemp Carlsbad</h1>
    <p className="kc-subtitle" style={{ textAlign: 'center' }}>Choose your language</p>
    {LANGS.map((l) => (
      <button key={l.code} className="kc-btn kc-btn-secondary" style={{ marginBottom: 10, fontSize: 18 }}
        onClick={() => { setLang(l.code); setScreen('fork'); }} type="button">
        <span style={{ fontSize: 24 }}>{l.flag}</span> {l.name}
      </button>
    ))}
  </>);

  if (screen === 'fork') return wrap(<>
    <h1 className="kc-title">Kemp Carlsbad</h1>
    <div className="kc-card kc-card-clickable" style={{ padding: 20, marginBottom: 12 }}
      onClick={() => setScreen('find')}>
      <div className="kc-card-name">{t.haveBooking}</div>
      <div className="kc-card-desc" style={{ marginBottom: 0 }}>{t.haveBookingSub}</div>
    </div>
    <div className="kc-card kc-card-clickable" style={{ padding: 20, marginBottom: 20 }}
      onClick={() => setScreen('camping')}>
      <div className="kc-card-name">{t.noBooking}</div>
      <div className="kc-card-desc" style={{ marginBottom: 0 }}>{t.noBookingSub}</div>
    </div>
    <a className="kc-btn kc-btn-ghost" href={WHATSAPP} target="_blank" rel="noreferrer">{t.contactAdmin}</a>
  </>);

  if (screen === 'find') return wrap(<>
    <button className="kc-btn kc-btn-ghost" style={{ width: 'auto', minHeight: 32, padding: 0, marginBottom: 8 }}
      onClick={() => setScreen('fork')} type="button">{t.back}</button>
    <h1 className="kc-title">{t.findTitle}</h1>
    <p className="kc-subtitle">{t.findSub}</p>
    <div className="kc-card" style={{ padding: 16 }}>
      <label className="kc-form-row-label">{t.phone}</label>
      <input className="kc-input" inputMode="tel" value={findPhone} onChange={(e) => setFindPhone(e.target.value)}
        placeholder="+420 777 123 456" style={{ width: '100%', marginBottom: 12 }} />
      <label className="kc-form-row-label">{t.surname}</label>
      <input className="kc-input" value={findSurname} onChange={(e) => setFindSurname(e.target.value)}
        style={{ width: '100%' }} />
    </div>
    {findError && <div className="kc-alert" style={{ marginTop: 12 }}>
      <span className="kc-alert-icon">⚠️</span><div><b>{t.notFound}</b><div style={{ fontSize: 13 }}>{findError}</div></div>
    </div>}
    <button className="kc-btn kc-btn-primary" style={{ marginTop: 16 }} disabled={finding}
      onClick={doFind} type="button">{finding ? t.searching : t.find}</button>
    <button className="kc-btn kc-btn-secondary" style={{ marginTop: 8 }}
      onClick={() => setScreen('camping')} type="button">{t.noBooking}</button>
    <a className="kc-btn kc-btn-ghost" href={WHATSAPP} target="_blank" rel="noreferrer">{t.contactAdmin}</a>
  </>);

  if (screen === 'camping') return wrap(<>
    <button className="kc-btn kc-btn-ghost" style={{ width: 'auto', minHeight: 32, padding: 0, marginBottom: 8 }}
      onClick={() => setScreen('fork')} type="button">{t.back}</button>
    <h1 className="kc-title">{t.campTitle}</h1>
    <p className="kc-subtitle">{t.campSub}</p>

    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t.yourSetup}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
      {ORDER.map((code) => {
        const n = qty[code] ?? 0;
        const rate = getRate(prices, code)?.rate_standard ?? 0;
        return (
          <div key={code} className={`kc-svc-card ${n > 0 ? 'added' : ''}`}
            style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 8px', gap: 4 }}>
            <div style={{ fontSize: 28 }}>{ICONS[code]}</div>
            <div className="kc-svc-name" style={{ fontSize: 13 }}>{ITEM_NAMES[code][lang]}</div>
            <div className="kc-svc-price" style={{ fontSize: 11 }}>{formatPrice(rate)} {t.perNight}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button className="kc-stepper-btn" onClick={() => bump(code, -1)} disabled={n === 0} type="button">−</button>
              <span className="kc-stepper-val" style={{ minWidth: 20 }}>{n}</span>
              <button className="kc-stepper-btn" onClick={() => bump(code, 1)} type="button">+</button>
            </div>
          </div>
        );
      })}
    </div>

    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t.guests}</div>
    <div className="kc-form-row">
      <div className="kc-form-row-label">{t.adults}</div>
      <div className="kc-stepper">
        <button className="kc-stepper-btn" onClick={() => setAdults(Math.max(1, adults - 1))} disabled={adults <= 1} type="button">−</button>
        <span className="kc-stepper-val">{adults}</span>
        <button className="kc-stepper-btn" onClick={() => setAdults(adults + 1)} type="button">+</button>
      </div>
    </div>
    <div className="kc-form-row">
      <div><div className="kc-form-row-label">{t.children}</div><div className="kc-form-row-sub">{t.childrenFree}</div></div>
      <div className="kc-stepper">
        <button className="kc-stepper-btn" onClick={() => setChildren(Math.max(0, children - 1))} disabled={children <= 0} type="button">−</button>
        <span className="kc-stepper-val">{children}</span>
        <button className="kc-stepper-btn" onClick={() => setChildren(children + 1)} type="button">+</button>
      </div>
    </div>

    <div style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px' }}>{t.extras}</div>
    <div className="kc-form-row">
      <div><div className="kc-form-row-label">{t.electricity}</div>
        <div className="kc-form-row-sub">+{formatPrice(getRate(prices, 'electricity')?.rate_standard ?? 120)} {t.perNight}</div></div>
      <button className={`kc-toggle ${electricity ? 'on' : ''}`} onClick={() => setElectricity(!electricity)} type="button" />
    </div>
    <div className="kc-form-row">
      <div><div className="kc-form-row-label">{t.pets}</div>
        <div className="kc-form-row-sub">+{formatPrice(getRate(prices, 'pet')?.rate_standard ?? 50)} {t.perAnimalNight}</div></div>
      <div className="kc-stepper">
        <button className="kc-stepper-btn" onClick={() => setPets(Math.max(0, pets - 1))} disabled={pets <= 0} type="button">−</button>
        <span className="kc-stepper-val">{pets}</span>
        <button className="kc-stepper-btn" onClick={() => setPets(pets + 1)} type="button">+</button>
      </div>
    </div>
    {selectedItems.includes('motorhome') && (
      <div className="kc-form-row">
        <div><div className="kc-form-row-label">{t.motorhomeService}</div>
          <div className="kc-form-row-sub">+{formatPrice(getRate(prices, 'motorhome_service')?.rate_standard ?? 100)} Kč ({t.once})</div></div>
        <button className={`kc-toggle ${mhService ? 'on' : ''}`} onClick={() => setMhService(!mhService)} type="button" />
      </div>
    )}

    {/* No eleven-month calendar: they are here tonight. One button adds a night. */}
    <div className="kc-form-row" style={{ marginTop: 16 }}>
      <div><div className="kc-form-row-label">{nights} {nights === 1 ? t.night : t.nights}</div>
        <div className="kc-form-row-sub">{t.leavingOn}: {checkOut}</div></div>
      <div className="kc-stepper">
        <button className="kc-stepper-btn" onClick={() => setCheckOut(addDays(checkOut, -1))} disabled={nights <= 1} type="button">−</button>
        <span className="kc-stepper-val">{nights}</span>
        <button className="kc-stepper-btn" onClick={() => setCheckOut(addDays(checkOut, 1))} type="button">+</button>
      </div>
    </div>

    {pricing && (
      <div className="kc-breakdown">
        <div className="kc-breakdown-total"><span>{t.total}</span><span>{formatPrice(pricing.total)} Kč</span></div>
        <div className="kc-breakdown-remaining"><span>{t.priceIncl}</span></div>
      </div>
    )}

    <button className="kc-btn kc-btn-primary" disabled={!selectedItems.length}
      onClick={() => setScreen('contact')} type="button">
      {selectedItems.length ? t.finish : t.pickSomething}
    </button>
  </>);

  if (screen === 'contact') return wrap(<>
    <button className="kc-btn kc-btn-ghost" style={{ width: 'auto', minHeight: 32, padding: 0, marginBottom: 8 }}
      onClick={() => setScreen('camping')} type="button">{t.back}</button>
    <h1 className="kc-title">{t.payAtReception}</h1>
    <p className="kc-subtitle">{t.payAtReceptionSub}</p>
    <div className="kc-card" style={{ padding: 16 }}>
      <label className="kc-form-row-label">{t.yourName}</label>
      <input className="kc-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      <label className="kc-form-row-label">{t.yourPhone}</label>
      <input className="kc-input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: '100%' }} />
    </div>
    {pricing && (
      <div className="kc-breakdown">
        <div className="kc-breakdown-total"><span>{t.total}</span><span>{formatPrice(pricing.total)} Kč</span></div>
      </div>
    )}
    {saveError && <div className="kc-alert" style={{ marginTop: 12 }}><span className="kc-alert-icon">⚠️</span><div>{saveError}</div></div>}
    <button className="kc-btn kc-btn-primary" disabled={saving} onClick={createBooking} type="button">
      {saving ? t.working : t.finish}
    </button>
  </>);

  return wrap(<>
    <div style={{ textAlign: 'center', fontSize: 56, marginBottom: 8 }}>✅</div>
    <h1 className="kc-title" style={{ textAlign: 'center' }}>{t.doneTitle}</h1>
    <p className="kc-subtitle" style={{ textAlign: 'center' }}>{t.doneSub}</p>
    {result?.unit && (
      <div className="kc-card" style={{ padding: 20, textAlign: 'center' }}>
        <div className="kc-form-row-sub">{t.yourSpot}</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--kc-green)' }}>{result.unit}</div>
      </div>
    )}
    {result?.token
      ? <a className="kc-btn kc-btn-primary" href={`/guest/${result.token}`}>{t.openGuestPage}</a>
      : <a className="kc-btn kc-btn-secondary" href={WHATSAPP} target="_blank" rel="noreferrer">{t.contactAdmin}</a>}
  </>);
}
