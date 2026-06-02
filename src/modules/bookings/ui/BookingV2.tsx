'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import './booking-v2.css';
import { tName } from './locales';
import { formatDisplayDate, formatFullDate, formatPrice, getDaysInMonth, getFirstDayOfMonth, parseDate } from './utils';
import type { DesignConfig } from './types';
import type { BookingLang } from './translations';
import { useBookingWidget } from './hooks/useBookingWidget';

export default function BookingV2({ siteId, siteSlug, thankYouUrl, design, isPreview, lang: initialLang }: { siteId?: string; siteSlug?: string; thankYouUrl?: string; design?: DesignConfig; isPreview?: boolean; lang?: BookingLang }) {
  const { lang, t, v3t, step, setStep, checkIn, setCheckIn, checkOut, setCheckOut, nights, selectingCheckOut, setSelectingCheckOut, adults, setAdults, kids, setKids, calMonthOffset, setCalMonthOffset, calOpen, setCalOpen, busyDates, partialDates, socialProof, waitlistStatus, joinWaitlist, nextAvailable, availability, loadingAvail, selectedUnitId, setSelectedUnitId, currentImgIndex, setCurrentImgIndex, firstName, setFirstName, lastName, setLastName, email, setEmail, phone, setPhone, submitting, error, reservation, couponCode, setCouponCode, showOffer, setShowOffer, offerApplied, offerError, applyingOffer, handleApplyOffer, extraCouponCode, setExtraCouponCode, showExtraOffer, setShowExtraOffer, extraCouponApplied, extraCouponError, applyingExtraCoupon, handleApplyExtraOffer, siteConfig, siteCurrency, services, loadingServices, selectedServiceIds, setSelectedServiceIds, setAvailability, displayUnits, selectedUnit, totalWithDiscount, totalWithoutDiscount, fetchAvailability, handleDayClick, goToStep, submitBooking, toggleService, startPayment, activeDesign, dynamicStyles, invalidNightsMsg, today, getOccupancyString, activeRatePlan } = useBookingWidget({ siteId, siteSlug, thankYouUrl, design, isPreview, initialLang });
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
            {[1, 2, 3, 5].map(s => (
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
              <div className="v3-cal-title">{t.selectDates || 'Оберіть дати'}</div>
              <button className="v3-cal-close" onClick={() => setCalOpen(false)} title="Закрити">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
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
                    <div className="v3-month-header">
                      <button
                        type="button"
                        className="v3-month-nav-btn prev"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCalMonthOffset(o => o - 1);
                        }}
                        title={lang === 'uk' ? 'Попередній місяць' : 'Previous month'}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <div className="v3-month-title">{monthName}</div>
                      <button
                        type="button"
                        className="v3-month-nav-btn next"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCalMonthOffset(o => o + 1);
                        }}
                        title={lang === 'uk' ? 'Наступний місяць' : 'Next month'}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
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
                            <div key={d} className={cls} style={{ userSelect: 'none' }} onClick={(e) => {
                              e.stopPropagation();
                              if (!isPast && (!isBusy || isCheckoutOnly)) handleDayClick(ds);
                            }}>
                              <span className="v3-cal-day-num">{d}</span>
                              {dayPrice && !isBusy && !isPast && (
                                <span className="v3-cal-day-price">
                                  {Math.round(dayPrice)} {siteCurrency === 'EUR' ? '€' : siteCurrency === 'CZK' ? 'Kč' : siteCurrency === 'UAH' ? '₴' : siteCurrency}
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

          {/* Active Rate Plan badge — shown after dates are selected and availability returned */}
          {activeRatePlan && checkIn && checkOut && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(47,79,43,0.07)',
              border: '1px solid rgba(47,79,43,0.2)',
              borderRadius: 10, padding: '8px 14px',
              marginBottom: 4, marginTop: 4,
            }}>
              <span style={{ fontSize: 15 }}>✦</span>
              <span style={{ fontSize: 13, color: 'var(--moss)', fontWeight: 600 }}>
                {activeRatePlan.name}
              </span>
            </div>
          )}

          {/* Occupancy notice */}
          {kids > 0 && (
            <div className="v3-occupancy-notice">
              <span className="v3-occupancy-notice-icon">🛏️</span>
              <span>{t.kidsOccupancyNotice}</span>
            </div>
          )}

          <div className="v3-offer-section">
            {!offerApplied && (
              <button type="button" className="v3-offer-toggle" onClick={() => setShowOffer(!showOffer)}>
                <span style={{ fontSize: '14px', marginRight: '2px' }}>🏷️</span> {t.couponCode} / {t.certificateCode}
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
                  onChange={e => { setCouponCode(e.target.value); }}
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
            
            {/* EXTRA COUPON (IF PACKAGE) */}
            {offerApplied?.offerType === 'package' && offerApplied.bundle?.allowed_promo_codes?.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border-primary)' }}>
                {!extraCouponApplied && (
                  <button type="button" className="v3-offer-toggle" onClick={() => setShowExtraOffer(!showExtraOffer)}>
                    <span style={{ fontSize: '14px', marginRight: '2px' }}>🏷️</span> {t.couponCode}
                  </button>
                )}
                {extraCouponApplied && (
                  <div className="v3-offer-success" style={{ background: 'transparent', border: '1px solid var(--accent-primary)', padding: '6px 12px' }}>
                    {'🏷️'} {extraCouponApplied.code}: -{extraCouponApplied.offerType === 'percentage' ? `${extraCouponApplied.offerAmount}%` : `${extraCouponApplied.offerAmount} Kč`}
                  </div>
                )}
                {!extraCouponApplied && showExtraOffer && (
                  <div className="v3-offer-field">
                    <input
                      className="v3-field-input"
                      placeholder={t.couponCode}
                      value={extraCouponCode}
                      onChange={e => { setExtraCouponCode(e.target.value); }}
                      onKeyDown={e => e.key === 'Enter' && !applyingExtraCoupon && handleApplyExtraOffer()}
                    />
                    <button
                      className="v3-offer-apply"
                      onClick={handleApplyExtraOffer}
                      disabled={applyingExtraCoupon || !extraCouponCode.trim()}
                    >
                      {applyingExtraCoupon ? '...' : t.apply}
                    </button>
                  </div>
                )}
                {extraCouponError && <div className="v3-offer-error">{extraCouponError}</div>}
              </div>
            )}
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
                        <div
                          className="v3-house-lock-thumb"
                          style={{
                            backgroundImage: u.photos?.[0] ? `url(${u.photos[0]})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                            backgroundColor: 'var(--moss)'
                          }}
                        >
                          {!u.photos?.[0] && (
                            <svg viewBox="0 0 54 54">
                              <polygon points="12,30 27,16 42,30 42,44 12,44" fill={isSelected ? '#fff' : '#C9844A'} />
                              <polygon points="8,30 27,14 46,30" fill={isSelected ? '#fff' : '#8B5A2B'} />
                            </svg>
                          )}
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

          {/* Guest page & GDPR notice */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(46,107,79,0.06) 0%, rgba(46,107,79,0.02) 100%)',
            border: '1px solid rgba(46,107,79,0.18)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginTop: '4px',
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>📩</span>
              <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', color: 'var(--v3-text-sub, #555)' }}>
                {t.guestPageNotice}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', paddingTop: '8px', borderTop: '1px solid rgba(46,107,79,0.12)' }}>
              <span style={{ fontSize: '14px', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>🔒</span>
              <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.4', color: 'var(--v3-text-muted, #888)' }}>
                {t.gdprNote}
              </p>
            </div>
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
            {activeRatePlan && !offerApplied && (
              <div className="v3-breakdown-row" style={{ color: 'var(--moss)' }}>
                <span>✦ {activeRatePlan.name}</span>
                <span className="v3-breakdown-val" style={{ fontWeight: 600, fontSize: 12, opacity: 0.8 }}>
                  {{
                    uk: 'Ціна за тарифом',
                    en: 'Plan pricing',
                    cs: 'Sazba tarifu',
                    de: 'Tarifpreis'
                  }[lang] || 'Plan pricing'}
                </span>
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

          {totalWithDiscount === 0 ? (
            <div className="v3-invoice-notice" style={{ background: 'rgba(47,79,43,0.06)', borderColor: 'rgba(47,79,43,0.25)', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="v3-invoice-notice-icon">🎁</div>
                <div className="v3-invoice-notice-text">
                  <strong>{lang === 'cs' ? 'Bezplatná rezervace' : lang === 'de' ? 'Kostenlose Buchung' : lang === 'en' ? 'No payment required' : 'Оплачувати нічого не потрібно'}</strong>
                  <p style={{ margin: '4px 0 0' }}>{lang === 'cs' ? 'Vaše rezervace je plně pokryta slevovým kódem. Stačí potvrdit.' : lang === 'de' ? 'Ihre Buchung ist vollständig durch Ihren Rabattcode abgedeckt. Bestätigen Sie einfach.' : lang === 'en' ? 'Your booking is fully covered by your offer. Just confirm.' : 'Ваше бронювання повністю покрите вашим промокодом. Просто підтвердіть.'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(47,79,43,0.09)', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid var(--moss)' }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>📩</span>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--moss)', fontWeight: 600 }}>
                  {lang === 'cs'
                    ? 'Dokončete registraci přes odkaz, který přijde na váš e-mail — bez toho rezervace nebude potvrzena.'
                    : lang === 'de'
                    ? 'Schließen Sie die Registrierung über den Link ab, der an Ihre E-Mail gesendet wird — ohne dies wird die Buchung nicht bestätigt.'
                    : lang === 'en'
                    ? 'Complete your registration via the link sent to your email — your booking won\'t be confirmed without it.'
                    : 'Важливо: завершіть реєстрацію за посиланням, яке надійде на вашу електронну пошту — без цього бронювання не буде підтверджено.'}
                </p>
              </div>
            </div>
          ) : siteConfig?.hasPayment ? (
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
                  ) : nights > 0 && (totalWithDiscount > 0 || offerApplied) ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {totalWithoutDiscount > totalWithDiscount && (
                        <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.85em', fontWeight: 500 }}>
                          {formatPrice(totalWithoutDiscount, siteCurrency)}
                        </span>
                      )}
                      <span>{formatPrice(totalWithDiscount, siteCurrency)}</span>
                    </span>
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
                  else if (step === 5) { if (totalWithDiscount === 0) { goToStep(6); } else { startPayment(); } }
                }}
              >
                <span>
                  {step === 5
                    ? (totalWithDiscount === 0 ? (t.finishBooking || 'Підтвердити') : (siteConfig?.hasPayment ? t.payNow : (t.finishBooking || 'Завершити')))
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
