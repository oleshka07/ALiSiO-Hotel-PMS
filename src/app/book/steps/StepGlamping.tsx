'use client';

import React, { useState, useMemo } from 'react';
import { type GlampingUnit, type PriceItem, calcGlampingPrice, formatPrice, fmtDate, getNightDates, isHolidayOrWeekend, getRate } from '../lib/pricing';

interface Props {
  prices: PriceItem[];
  onNext: (data: {
    unit: GlampingUnit;
    checkIn: string;
    checkOut: string;
    adults: number;
    total: number;
    deposit: number;
    breakdown: { date: string; type: string; price: number }[];
    touristTax: number;
    taxRate: number;
    nights: number;
  }) => void;
}

const UNITS: { id: GlampingUnit; name: string; emoji: string; maxGuests: number; std: number; hol: number }[] = [
  { id: 'tiny', name: 'Tiny House', emoji: '🏡', maxGuests: 2, std: 3900, hol: 5500 },
  { id: 'barn', name: 'Barn House', emoji: '🏚️', maxGuests: 6, std: 5000, hol: 7000 },
];

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDow(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

export default function StepGlamping({ prices, onNext }: Props) {
  const [unit, setUnit] = useState<GlampingUnit | null>(null);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [selectingCO, setSelectingCO] = useState(false);
  const [adults, setAdults] = useState(2);
  const [monthOffset, setMonthOffset] = useState(0);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const calMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [today, monthOffset]);

  const selectedUnit = UNITS.find(u => u.id === unit);
  const maxGuests = selectedUnit?.maxGuests || 2;

  const pricing = useMemo(() => {
    if (!unit || !checkIn || !checkOut) return null;
    return calcGlampingPrice(unit, checkIn, checkOut, prices, adults);
  }, [unit, checkIn, checkOut, prices, adults]);

  const handleDayClick = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (d < today) return;
    if (!checkIn || (checkIn && checkOut) || !selectingCO) {
      setCheckIn(dateStr); setCheckOut(null); setSelectingCO(true);
    } else {
      if (d <= new Date(checkIn + 'T00:00:00')) { setCheckIn(dateStr); setCheckOut(null); }
      else { setCheckOut(dateStr); setSelectingCO(false); }
    }
  };

  const renderCal = () => {
    const { year, month } = calMonth;
    const days = getDaysInMonth(year, month);
    const first = getFirstDow(year, month);
    const todayStr = fmtDate(today);
    const monthName = new Date(year, month).toLocaleDateString('en', { month: 'long', year: 'numeric' });
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(<div key={`e${i}`} className="kc-cal-day empty" />);
    for (let d = 1; d <= days; d++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isPast = new Date(ds + 'T00:00:00') < today;
      let cls = '';
      if (isPast) cls = 'past';
      else if (ds === todayStr) cls = 'today';
      if (checkIn && ds === checkIn) cls += ' range-start';
      if (checkOut && ds === checkOut) cls += ' range-end';
      if (checkIn && checkOut && ds > checkIn && ds < checkOut) cls += ' in-range';
      cells.push(<button key={d} className={`kc-cal-day ${cls}`} onClick={() => !isPast && handleDayClick(ds)} disabled={isPast} type="button">{d}</button>);
    }
    return (
      <div>
        <div className="kc-cal-nav">
          <button className="kc-cal-nav-btn" onClick={() => setMonthOffset(p => p - 1)} disabled={monthOffset <= 0} type="button">‹</button>
          <span className="kc-cal-month-title">{monthName}</span>
          <button className="kc-cal-nav-btn" onClick={() => setMonthOffset(p => p + 1)} disabled={monthOffset >= 11} type="button">›</button>
        </div>
        <div className="kc-cal-weekdays">
          {['Mo','Tu','We','Th','Fr','Sa','Su'].map(w => <div key={w} className="kc-cal-wd">{w}</div>)}
        </div>
        <div className="kc-cal-grid">{cells}</div>
      </div>
    );
  };

  return (
    <div className="kc-fade-in">
      <h1 className="kc-title">Glamping Houses</h1>
      <p className="kc-subtitle">Choose your house and dates</p>

      {/* Unit selection */}
      <div style={{ marginBottom: 16 }}>
        {UNITS.map(u => (
          <div key={u.id} className={`kc-card kc-card-clickable ${unit === u.id ? 'selected' : ''}`} onClick={() => { setUnit(u.id); setAdults(Math.min(adults, u.maxGuests)); }}>
            <div className="kc-card-body" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 32 }}>{u.emoji}</div>
              <div style={{ flex: 1 }}>
                <div className="kc-card-name">{u.name}</div>
                <div className="kc-card-desc" style={{ marginBottom: 0 }}>Max {u.maxGuests} guests</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{formatPrice(u.std)} Kč</div>
                <div style={{ fontSize: 11, color: 'var(--kc-text-muted)' }}>standard / night</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar */}
      {unit && (
        <>
          <div className="kc-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Select dates</div>
            {checkIn && <div style={{ fontSize: 13, color: 'var(--kc-text-secondary)', marginBottom: 8 }}>
              {checkIn && checkOut ? `${checkIn} → ${checkOut} (${getNightDates(checkIn, checkOut).length} nights)` : checkIn ? `Check-in: ${checkIn} — select check-out` : 'Select check-in date'}
            </div>}
            {renderCal()}
          </div>

          {/* Guests */}
          <div className="kc-form-row" style={{ marginTop: 12 }}>
            <div>
              <div className="kc-form-row-label">Adults</div>
              {adults > maxGuests && <div className="kc-form-row-sub" style={{ color: 'var(--kc-error)' }}>Max {maxGuests} for {selectedUnit?.name}</div>}
            </div>
            <div className="kc-stepper">
              <button className="kc-stepper-btn" onClick={() => setAdults(Math.max(1, adults - 1))} disabled={adults <= 1} type="button">−</button>
              <span className="kc-stepper-val">{adults}</span>
              <button className="kc-stepper-btn" onClick={() => setAdults(Math.min(maxGuests, adults + 1))} disabled={adults >= maxGuests} type="button">+</button>
            </div>
          </div>
        </>
      )}

      {/* Pricing breakdown */}
      {pricing && (
        <div className="kc-breakdown">
          <div className="kc-breakdown-title">Price breakdown</div>

          {/* Night-by-night accommodation */}
          {pricing.breakdown.map((n, i) => (
            <div key={i} className="kc-breakdown-row">
              <span>{n.date} ({n.type === 'holiday' ? '⭐ Holiday/Weekend' : 'Standard'})</span>
              <span>{formatPrice(n.price)} Kč</span>
            </div>
          ))}

          {/* Tourist tax */}
          {pricing.touristTax > 0 && (
            <div className="kc-breakdown-row">
              <span>🏛️ Tourist tax ({pricing.adults} adults × {pricing.taxRate} Kč × {pricing.nights} night{pricing.nights > 1 ? 's' : ''})</span>
              <span>{formatPrice(pricing.touristTax)} Kč</span>
            </div>
          )}

          <div className="kc-breakdown-divider" />
          <div className="kc-breakdown-total"><span>Total</span><span>{formatPrice(pricing.total)} Kč</span></div>
        </div>
      )}

      {/* CTA */}
      <button
        className="kc-btn kc-btn-primary"
        disabled={!unit || !checkIn || !checkOut}
        onClick={() => unit && checkIn && checkOut && pricing && onNext({
          unit, checkIn, checkOut, adults,
          total: pricing.total, deposit: pricing.deposit,
          breakdown: pricing.breakdown,
          touristTax: pricing.touristTax,
          taxRate: pricing.taxRate,
          nights: pricing.nights,
        })}
        type="button"
      >
        Continue →
      </button>
    </div>
  );
}
