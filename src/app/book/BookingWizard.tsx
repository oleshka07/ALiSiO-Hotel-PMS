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

export default function BookingWizard() {
  const [step, setStep] = useState<Step>('landing');
  const [state, setState] = useState<BookingState>({
    accommodationType: null, accommodationData: {}, extras: [], contact: null, total: 0, checkIn: '', checkOut: '', priceBreakdown: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'pending' | 'admin_pending'>('pending');
  const [reservationId, setReservationId] = useState<string | undefined>();
  const [guestPageToken, setGuestPageToken] = useState<string | undefined>();
  const [paymentUrl, setPaymentUrl] = useState<string | undefined>();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | undefined>();
  const [showResume, setShowResume] = useState(false);
  const [showPriceList, setShowPriceList] = useState(false);
  const [prices, setPrices] = useState<PriceItem[]>([]);

  // Cache Teya session so "Pay online" + "Show QR" reuse the same checkout
  // instead of creating duplicate drafts / payment sessions.
  const checkoutCacheRef = useRef<{ sessionUrl: string; pmsResId: string; guestPageToken?: string } | null>(null);

  // Load price list from API
  useEffect(() => { loadPriceList().then(setPrices).catch(() => {}); }, []);

  // SW registration
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw-book.js').catch(() => {});
  }, []);

  // Restore draft
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.accommodationType && parsed.checkIn) { setShowResume(true); setState(parsed); }
      }
    } catch { /* ignore */ }
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
    const status = params.get('payment');
    const rid = params.get('reservation_id');
    const token = params.get('token');
    if (status === 'success') {
      setPaymentStatus('success'); if (rid) setReservationId(rid); if (token) setGuestPageToken(token);
      setStep('success'); sessionStorage.removeItem(STORAGE_KEY);
      window.history.replaceState({}, '', '/book');
    } else if (status === 'failed' || status === 'cancel') {
      setPaymentStatus('failed'); setStep('success');
      window.history.replaceState({}, '', '/book');
    }
  }, []);

  const resetAll = useCallback(() => {
    setState({ accommodationType: null, accommodationData: {}, extras: [], contact: null, total: 0, checkIn: '', checkOut: '', priceBreakdown: [] });
    setStep('landing'); setSubmitting(false); setPaymentStatus('pending');
    setReservationId(undefined); setGuestPageToken(undefined); setPaymentUrl(undefined); setQrCodeUrl(undefined);
    checkoutCacheRef.current = null;
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const goBack = () => { const idx = STEP_ORDER.indexOf(step); if (idx > 0) setStep(STEP_ORDER[idx - 1]); };
  const progressPct = ((STEP_ORDER.indexOf(step)) / (STEP_ORDER.length - 1)) * 100;

  // ─── Create draft helper ──────────────────────────
  const createDraft = async (contact: { name: string; email: string; phone: string }) => {
    const extrasTotal = state.extras.reduce((s, e) => s + e.price, 0);
    const grandTotal = state.total + extrasTotal;
    const res = await fetch('/api/booking/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accommodation_type: state.accommodationType,
        accommodation_data: state.accommodationData,
        check_in: state.checkIn, check_out: state.checkOut,
        extras: state.extras, guest_name: contact.name,
        guest_email: contact.email, guest_phone: contact.phone,
        total_price: grandTotal, deposit_amount: grandTotal,
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
    const returnPath = `/book?payment=success&reservation_id=${pmsResId}&token=${draft.guest_page_token || ''}`;
    const checkoutRes = await fetch('/api/booking/checkout-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: grandTotal, currency: 'CZK', description: desc,
        reservation_id: pmsResId, return_path: returnPath,
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
  const handleShowQr = async (contact: { name: string; email: string; phone: string }): Promise<string | null> => {
    setState(s => ({ ...s, contact }));
    try {
      const { sessionUrl, pmsResId, guestPageToken: tok } = await ensureCheckoutSession(contact);
      setReservationId(pmsResId);
      if (tok) setGuestPageToken(tok);
      setPaymentUrl(sessionUrl);
      return sessionUrl;
    } catch (err: unknown) {
      console.error('[Booking] QR error', err);
      alert(`Could not generate payment link: ${(err as Error)?.message || 'Unknown error'}`);
      return null;
    }
  };

  // ─── Pay via Administrator ────────────────────────
  const handlePayAdmin = async (contact: { name: string; email: string; phone: string }) => {
    setSubmitting(true); setState(s => ({ ...s, contact }));
    try {
      const { draft } = await createDraft(contact);
      setReservationId(draft.reservation_id || draft.id);
      if (draft.guest_page_token) setGuestPageToken(draft.guest_page_token);
      setPaymentStatus('admin_pending'); setStep('success');
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err: unknown) {
      console.error('[Booking]', err); setPaymentStatus('failed'); setStep('success');
    } finally { setSubmitting(false); }
  };

  // ─── Admin Confirm ────────────────────────────────
  const handleAdminConfirm = async (pin: string): Promise<{ ok: boolean; adminName?: string; error?: string }> => {
    if (!reservationId) return { ok: false, error: 'No reservation' };
    try {
      const res = await fetch('/api/booking/drafts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reservationId, reservation_id: reservationId, status: 'paid', admin_pin: pin }),
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
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, checkIn: data.checkIn, checkOut: data.checkOut, priceBreakdown: bd }));
            setStep('extras');
          }} />
        )}
        {step === 'accommodation' && state.accommodationType === 'buildings' && (
          <StepBuildings prices={prices} onNext={(data) => {
            const bd: { label: string; amount: number; isDiscount?: boolean }[] = [];
            if (data.accommodationSubtotal != null) bd.push({ label: `🏠 Accommodation`, amount: (data.accommodationSubtotal || 0) + (data.sleepingBagDiscount || 0) });
            if (data.sleepingBagDiscount != null && data.sleepingBagDiscount > 0) bd.push({ label: `🛌 Own sleeping bags`, amount: -data.sleepingBagDiscount, isDiscount: true });
            if (data.touristTax != null && data.touristTax > 0) bd.push({ label: `🏛️ Tourist tax (${data.adults} × ${data.taxRate} Kč × ${data.nights} nights)`, amount: data.touristTax });
            if (data.kauce != null && data.kauce > 0) bd.push({ label: `🔑 Security deposit (returnable)`, amount: data.kauce });
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, checkIn: data.checkIn, checkOut: data.checkOut, priceBreakdown: bd }));
            setStep('extras');
          }} />
        )}
        {step === 'accommodation' && state.accommodationType === 'camping' && (
          <StepCamping prices={prices} onNext={(data) => {
            setState(s => ({ ...s, accommodationData: data as unknown as Record<string, unknown>, total: data.total, checkIn: data.checkIn, checkOut: data.checkOut }));
            setStep('extras');
          }} />
        )}

        {step === 'extras' && (
          <StepExtras
            accommodationType={state.accommodationType || ''}
            nights={nights}
            onNext={(extras) => { setState(s => ({ ...s, extras })); setStep('summary'); }}
            onSkip={() => { setState(s => ({ ...s, extras: [] })); setStep('summary'); }}
          />
        )}

        {step === 'summary' && (
          <StepSummary
            accommodationType={state.accommodationType || ''}
            accommodationLabel={getAccommodationLabel(state)}
            checkIn={state.checkIn} checkOut={state.checkOut}
            nights={nights} guests={getGuestsLabel(state)}
            total={state.total} extras={state.extras}
            priceBreakdown={state.priceBreakdown}
            onPayOnline={handlePayOnline} onPayAdmin={handlePayAdmin}
            onShowQr={handleShowQr}
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
            guestPageToken={guestPageToken}
            paymentUrl={paymentUrl} qrCodeUrl={qrCodeUrl}
            onReset={resetAll} onAdminConfirm={handleAdminConfirm}
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
