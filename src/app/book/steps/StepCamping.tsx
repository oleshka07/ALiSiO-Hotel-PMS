'use client';

import React, { useState, useMemo } from 'react';
import { type CampingItemCode, type PriceItem, CAMPING_ITEMS, calcCampingPrice, formatPrice, fmtDate, getNightDates, getRate, getSeason } from '../lib/pricing';

interface Props {
  prices: PriceItem[];
  onNext: (data: { selectedItems: CampingItemCode[]; adults: number; children: number; electricity: boolean; pets: number; motorhomeService: boolean; checkIn: string; checkOut: string; total: number; deposit: number }) => void;
}

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDow(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

export default function StepCamping({ prices, onNext }: Props) {
  const [selectedItems, setSelectedItems] = useState<CampingItemCode[]>([]);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [electricity, setElectricity] = useState(false);
  const [pets, setPets] = useState(0);
  const [motorhomeService, setMotorhomeService] = useState(false);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [selectingCO, setSelectingCO] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const calMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [today, monthOffset]);

  const toggleItem = (code: CampingItemCode) => {
    setSelectedItems(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    if (code !== 'motorhome') return;
    if (selectedItems.includes('motorhome')) setMotorhomeService(false);
  };

  const pricing = useMemo(() => {
    if (selectedItems.length === 0 || !checkIn || !checkOut) return null;
    return calcCampingPrice(selectedItems, adults, children, electricity, pets, motorhomeService, checkIn, checkOut, prices);
  }, [selectedItems, adults, children, electricity, pets, motorhomeService, checkIn, checkOut, prices]);

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
      <h1 className="kc-title">Camping</h1>
      <p className="kc-subtitle">Select everything you're bringing</p>

      {/* Equipment multi-select — 2-column grid */}
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Your setup</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {CAMPING_ITEMS.map(item => {
          const active = selectedItems.includes(item.code);
          const rateItem = getRate(prices, item.code);
          const rate = rateItem?.rate_standard ?? 0;
          return (
            <div
              key={item.code}
              className={`kc-svc-card ${active ? 'added' : ''}`}
              onClick={() => toggleItem(item.code)}
              style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 8px', gap: 4 }}
            >
              <div style={{ fontSize: 28 }}>{item.emoji}</div>
              <div className="kc-svc-name" style={{ fontSize: 13 }}>{item.label}</div>
              <div className="kc-svc-price" style={{ fontSize: 11 }}>{formatPrice(rate)} Kč / night</div>
              <div style={{
                width: 20, height: 20, borderRadius: 5, border: active ? 'none' : '2px solid var(--kc-border)',
                background: active ? 'var(--kc-green)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13, fontWeight: 700, marginTop: 4,
              }}>
                {active ? '✓' : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Guests */}
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Guests</div>
      <div className="kc-form-row">
        <div className="kc-form-row-label">Adults</div>
        <div className="kc-stepper">
          <button className="kc-stepper-btn" onClick={() => setAdults(Math.max(1, adults-1))} disabled={adults <= 1} type="button">−</button>
          <span className="kc-stepper-val">{adults}</span>
          <button className="kc-stepper-btn" onClick={() => setAdults(adults+1)} type="button">+</button>
        </div>
      </div>
      <div className="kc-form-row">
        <div><div className="kc-form-row-label">Children (3-15)</div><div className="kc-form-row-sub">Under 3 — free</div></div>
        <div className="kc-stepper">
          <button className="kc-stepper-btn" onClick={() => setChildren(Math.max(0, children-1))} disabled={children <= 0} type="button">−</button>
          <span className="kc-stepper-val">{children}</span>
          <button className="kc-stepper-btn" onClick={() => setChildren(children+1)} type="button">+</button>
        </div>
      </div>

      {/* Extras */}
      <div style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px' }}>Extras</div>
      <div className="kc-form-row">
        <div><div className="kc-form-row-label">Electricity hookup</div><div className="kc-form-row-sub">+{formatPrice(getRate(prices, 'electricity')?.rate_standard ?? 120)} Kč / night</div></div>
        <button className={`kc-toggle ${electricity ? 'on' : ''}`} onClick={() => setElectricity(!electricity)} type="button" />
      </div>
      <div className="kc-form-row">
        <div><div className="kc-form-row-label">Pets</div><div className="kc-form-row-sub">+{formatPrice(getRate(prices, 'pet')?.rate_standard ?? 50)} Kč / animal / night</div></div>
        <div className="kc-stepper">
          <button className="kc-stepper-btn" onClick={() => setPets(Math.max(0, pets-1))} disabled={pets <= 0} type="button">−</button>
          <span className="kc-stepper-val">{pets}</span>
          <button className="kc-stepper-btn" onClick={() => setPets(pets+1)} type="button">+</button>
        </div>
      </div>
      {selectedItems.includes('motorhome') && (
        <div className="kc-form-row">
          <div><div className="kc-form-row-label">Motorhome service</div><div className="kc-form-row-sub">Cassette drain +{formatPrice(getRate(prices, 'motorhome_service')?.rate_standard ?? 100)} Kč (once)</div></div>
          <button className={`kc-toggle ${motorhomeService ? 'on' : ''}`} onClick={() => setMotorhomeService(!motorhomeService)} type="button" />
        </div>
      )}

      {/* Calendar */}
      {selectedItems.length > 0 && (
        <div className="kc-card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Select dates</div>
          {checkIn && <div style={{ fontSize: 13, color: 'var(--kc-text-secondary)', marginBottom: 8 }}>
            {checkIn && checkOut ? `${checkIn} → ${checkOut} (${getNightDates(checkIn, checkOut).length} nights)` : `Check-in: ${checkIn}`}
          </div>}
          {renderCal()}
        </div>
      )}

      {/* Pricing */}
      {pricing && (
        <div className="kc-breakdown">
          <div className="kc-breakdown-title">Price breakdown</div>

          {/* Equipment per night */}
          {selectedItems.map(code => {
            const item = CAMPING_ITEMS.find(i => i.code === code);
            const rateItem = getRate(prices, code);
            const rate = rateItem?.rate_standard ?? 0;
            return (
              <div key={code} className="kc-breakdown-row">
                <span>{item?.emoji} {item?.label} × {pricing.nights} night{pricing.nights > 1 ? 's' : ''}</span>
                <span>{formatPrice(rate * pricing.nights)} Kč</span>
              </div>
            );
          })}

          {/* Adults & children */}
          {adults > 0 && (() => {
            const adultItem = getRate(prices, 'adult_person');
            const rate = adultItem?.rate_standard ?? 150;
            return (
              <div className="kc-breakdown-row">
                <span>👤 Adults ({adults} × {rate} Kč × {pricing.nights} night{pricing.nights > 1 ? 's' : ''})</span>
                <span>{formatPrice(adults * rate * pricing.nights)} Kč</span>
              </div>
            );
          })()}
          {children > 0 && (() => {
            const childItem = getRate(prices, 'child_person');
            const rate = childItem?.rate_standard ?? 100;
            return (
              <div className="kc-breakdown-row">
                <span>🧒 Children ({children} × {rate} Kč × {pricing.nights} night{pricing.nights > 1 ? 's' : ''})</span>
                <span>{formatPrice(children * rate * pricing.nights)} Kč</span>
              </div>
            );
          })()}

          {/* Extras */}
          {electricity && (() => {
            const elecItem = getRate(prices, 'electricity');
            const rate = elecItem?.rate_standard ?? 120;
            return (
              <div className="kc-breakdown-row">
                <span>⚡ Electricity × {pricing.nights} night{pricing.nights > 1 ? 's' : ''}</span>
                <span>{formatPrice(rate * pricing.nights)} Kč</span>
              </div>
            );
          })()}
          {pets > 0 && (() => {
            const petItem = getRate(prices, 'pet');
            const rate = petItem?.rate_standard ?? 50;
            return (
              <div className="kc-breakdown-row">
                <span>🐾 Pets ({pets} × {rate} Kč × {pricing.nights} night{pricing.nights > 1 ? 's' : ''})</span>
                <span>{formatPrice(pets * rate * pricing.nights)} Kč</span>
              </div>
            );
          })()}

          {/* Tourist tax */}
          {(() => {
            const taxItem = getRate(prices, 'tourist_tax');
            const rate = taxItem?.rate_standard ?? 25;
            return (
              <div className="kc-breakdown-row">
                <span>🏛️ Tourist tax ({adults} × {rate} Kč × {pricing.nights} night{pricing.nights > 1 ? 's' : ''})</span>
                <span>{formatPrice(adults * rate * pricing.nights)} Kč</span>
              </div>
            );
          })()}

          <div className="kc-breakdown-divider" />
          <div className="kc-breakdown-total"><span>Total</span><span>{formatPrice(pricing.total)} Kč</span></div>
        </div>
      )}

      <button className="kc-btn kc-btn-primary" disabled={selectedItems.length === 0 || !checkIn || !checkOut}
        onClick={() => checkIn && checkOut && pricing && onNext({ selectedItems, adults, children, electricity, pets, motorhomeService, checkIn, checkOut, total: pricing.total, deposit: pricing.deposit })} type="button">
        Continue →
      </button>
    </div>
  );
}
