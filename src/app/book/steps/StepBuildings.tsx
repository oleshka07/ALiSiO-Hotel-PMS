'use client';

import React, { useState, useMemo } from 'react';
import { type BuildingType, type BookingMode, type PriceItem, calcBuildingPrice, formatPrice, fmtDate, getNightDates } from '../lib/pricing';

interface Props {
  prices: PriceItem[];
  onNext: (data: {
    building: BuildingType;
    mode: BookingMode;
    adults: number;
    children: number;
    checkIn: string;
    checkOut: string;
    sleepingBag: boolean;
    total: number;
    deposit: number;
    accommodationSubtotal?: number | null;
    sleepingBagDiscount?: number | null;
    touristTax?: number | null;
    taxRate?: number | null;
    nights?: number | null;
    kauce?: number | null;
  }) => void;
}

const BUILDINGS: { id: BuildingType; name: string; beds: number; rate: string }[] = [
  { id: 'budova_d', name: 'Budova D — Standard', beds: 48, rate: 'from 390 Kč / bed / night' },
  { id: 'budova_f', name: 'Budova F — Comfort', beds: 51, rate: 'from 490 Kč / bed / night' },
];

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDow(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

export default function StepBuildings({ prices, onNext }: Props) {
  const [building, setBuilding] = useState<BuildingType | null>(null);
  const [mode, setMode] = useState<BookingMode>('shared');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [sleepingBag, setSleepingBag] = useState(false);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [selectingCO, setSelectingCO] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const calMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [today, monthOffset]);

  const isGroup = (adults + children) >= 15;

  const pricing = useMemo(() => {
    if (!building || !checkIn || !checkOut) return null;
    return calcBuildingPrice(building, mode, adults, children, checkIn, checkOut, sleepingBag, prices);
  }, [building, mode, adults, children, checkIn, checkOut, sleepingBag, prices]);

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
      let cls = isPast ? 'past' : ds === todayStr ? 'today' : '';
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
        <div className="kc-cal-weekdays">{['Mo','Tu','We','Th','Fr','Sa','Su'].map(w => <div key={w} className="kc-cal-wd">{w}</div>)}</div>
        <div className="kc-cal-grid">{cells}</div>
      </div>
    );
  };

  return (
    <div className="kc-fade-in">
      <h1 className="kc-title">Buildings</h1>
      <p className="kc-subtitle">Choose a building, room type, and dates</p>

      {/* Building select */}
      {BUILDINGS.map(b => (
        <div key={b.id} className={`kc-card kc-card-clickable ${building === b.id ? 'selected' : ''}`} onClick={() => setBuilding(b.id)}>
          <div className="kc-card-body">
            <div className="kc-card-name">{b.name}</div>
            <div className="kc-card-desc">{b.beds} beds · {b.rate}</div>
          </div>
        </div>
      ))}

      {building && (
        <>
          {/* Mode */}
          <div style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px' }}>Room type</div>
          <div className="kc-options">
            {(['shared', 'non_shared', 'buyout'] as BookingMode[]).map(m => (
              <button key={m} className={`kc-option ${mode === m ? 'selected' : ''}`}
                onClick={() => {
                  setMode(m);
                  // Shared requires min 2 adults
                  if (m === 'shared' && adults < 2) setAdults(2);
                }}
                type="button"
              >
                {m === 'shared' ? 'Shared beds' : m === 'non_shared' ? 'Private room' : 'Whole building'}
              </button>
            ))}
          </div>

          {/* Guests */}
          {mode !== 'buyout' && (
            <>
              <div className="kc-form-row">
                <div>
                  <div className="kc-form-row-label">Adults</div>
                  {mode === 'shared' && <div className="kc-form-row-sub">Min 2 for shared beds</div>}
                </div>
                <div className="kc-stepper">
                  <button className="kc-stepper-btn"
                    onClick={() => setAdults(Math.max(mode === 'shared' ? 2 : 1, adults - 1))}
                    disabled={adults <= (mode === 'shared' ? 2 : 1)}
                    type="button">−</button>
                  <span className="kc-stepper-val">{adults}</span>
                  <button className="kc-stepper-btn" onClick={() => setAdults(adults + 1)} type="button">+</button>
                </div>
              </div>
              <div className="kc-form-row">
                <div><div className="kc-form-row-label">Children (under 15)</div><div className="kc-form-row-sub">−10% bed rate</div></div>
                <div className="kc-stepper">
                  <button className="kc-stepper-btn" onClick={() => setChildren(Math.max(0, children - 1))} disabled={children <= 0} type="button">−</button>
                  <span className="kc-stepper-val">{children}</span>
                  <button className="kc-stepper-btn" onClick={() => setChildren(children + 1)} type="button">+</button>
                </div>
              </div>
            </>
          )}

          {/* Sleeping bag toggle — shared AND private room */}
          {(mode === 'shared' || mode === 'non_shared') && (
            <div className="kc-form-row">
              <div><div className="kc-form-row-label">Own sleeping bags?</div><div className="kc-form-row-sub">−100 Kč / person / night</div></div>
              <button className={`kc-toggle ${sleepingBag ? 'on' : ''}`} onClick={() => setSleepingBag(!sleepingBag)} type="button" />
            </div>
          )}

          {/* Group badge */}
          {isGroup && mode !== 'buyout' && (
            <div className="kc-alert info"><span className="kc-alert-icon">✅</span> Group discount applied (K = 0.88)</div>
          )}

          {/* Calendar */}
          <div className="kc-card" style={{ padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Select dates</div>
            {checkIn && <div style={{ fontSize: 13, color: 'var(--kc-text-secondary)', marginBottom: 8 }}>
              {checkIn && checkOut ? `${checkIn} → ${checkOut} (${getNightDates(checkIn, checkOut).length} nights)` : `Check-in: ${checkIn}`}
            </div>}
            {renderCal()}
          </div>

          {/* Non-shared holiday warning */}
          {pricing?.hasHolidayNonShared && (
            <div className="kc-alert warning" style={{ marginTop: 12 }}>
              <span className="kc-alert-icon">⚠️</span>
              <div>Holiday pricing for private rooms is individual. <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', fontWeight: 600 }}>Contact us via WhatsApp →</a></div>
            </div>
          )}

          {/* Pricing breakdown */}
          {pricing && !pricing.hasHolidayNonShared && (
            <div className="kc-breakdown">
              <div className="kc-breakdown-title">Price breakdown</div>

              {/* Accommodation */}
              {mode === 'shared' && pricing.accommodationSubtotal != null && (
                <div className="kc-breakdown-row">
                  <span>🏠 Accommodation ({pricing.adults} adults{children > 0 ? `, ${children} children` : ''} × {pricing.nights} night{pricing.nights > 1 ? 's' : ''})</span>
                  <span>{formatPrice(pricing.accommodationSubtotal + (pricing.sleepingBagDiscount ?? 0))} Kč</span>
                </div>
              )}
              {mode === 'non_shared' && pricing.subtotal != null && (
                <div className="kc-breakdown-row">
                  <span>🏠 Room × {pricing.nights} night{pricing.nights > 1 ? 's' : ''}</span>
                  <span>{formatPrice(pricing.subtotal)} Kč</span>
                </div>
              )}
              {mode === 'buyout' && pricing.subtotal != null && (
                <div className="kc-breakdown-row">
                  <span>🏠 Whole building × {pricing.nights} night{pricing.nights > 1 ? 's' : ''}</span>
                  <span>{formatPrice(pricing.subtotal)} Kč</span>
                </div>
              )}

              {/* Sleeping bag discount */}
              {pricing.sleepingBagDiscount != null && pricing.sleepingBagDiscount > 0 && (
                <div className="kc-breakdown-row" style={{ color: 'var(--kc-green)' }}>
                  <span>🛌 Own sleeping bags discount</span>
                  <span>−{formatPrice(pricing.sleepingBagDiscount)} Kč</span>
                </div>
              )}

              {/* Tourist tax */}
              {pricing.touristTax != null && pricing.touristTax > 0 && (
                <div className="kc-breakdown-row">
                  <span>🏛️ Tourist tax ({pricing.adults} × {pricing.taxRate} Kč × {pricing.nights} night{pricing.nights > 1 ? 's' : ''})</span>
                  <span>{formatPrice(pricing.touristTax)} Kč</span>
                </div>
              )}

              {/* Security deposit for groups/buyout */}
              {pricing.kauce != null && pricing.kauce > 0 && (
                <div className="kc-breakdown-row">
                  <span>🔑 Security deposit (returnable)</span>
                  <span>{formatPrice(pricing.kauce)} Kč</span>
                </div>
              )}

              <div className="kc-breakdown-divider" />
              <div className="kc-breakdown-total"><span>Total</span><span>{formatPrice(pricing.total)} Kč</span></div>
            </div>
          )}

          <button className="kc-btn kc-btn-primary" disabled={!checkIn || !checkOut || pricing?.hasHolidayNonShared}
          onClick={() => building && checkIn && checkOut && pricing && onNext({
            building, mode, adults, children, checkIn, checkOut, sleepingBag,
            total: pricing.total, deposit: pricing.deposit,
            accommodationSubtotal: pricing.accommodationSubtotal,
            sleepingBagDiscount: pricing.sleepingBagDiscount,
            touristTax: pricing.touristTax,
            taxRate: pricing.taxRate,
            nights: pricing.nights,
            kauce: pricing.kauce,
          })} type="button">

            Continue →
          </button>
        </>
      )}
    </div>
  );
}
