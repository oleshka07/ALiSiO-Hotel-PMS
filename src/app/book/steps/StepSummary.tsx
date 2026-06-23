'use client';

import React, { useState, useEffect } from 'react';
import { formatPrice } from '../lib/pricing';

interface Props {
  accommodationType: string;
  accommodationLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: string;
  total: number;
  extras: { id: string; name: string; quantity: number; price: number }[];
  priceBreakdown: { label: string; amount: number; isDiscount?: boolean }[];
  onPayOnline: (contact: { name: string; email: string; phone: string }) => void;
  onPayAdmin: (contact: { name: string; email: string; phone: string }) => void;
  onPayAdminEur: (contact: { name: string; email: string; phone: string }) => void;
  onPayTerminal: (contact: { name: string; email: string; phone: string }) => void;
  onShowQr: (contact: { name: string; email: string; phone: string }) => Promise<{ url: string; reservationId: string } | null>;
  onQrPaid: (reservationId: string) => void;
  submitting: boolean;
}

export default function StepSummary({
  accommodationLabel, checkIn, checkOut, nights, guests,
  total, extras, priceBreakdown, onPayOnline, onPayAdmin, onPayAdminEur, onPayTerminal, onShowQr, onQrPaid, submitting,
}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [qrSession, setQrSession] = useState<{ url: string; reservationId: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlName = params.get('contact_name') || params.get('name') || '';
    const urlEmail = params.get('contact_email') || params.get('email') || '';
    const urlPhone = params.get('contact_phone') || params.get('phone') || '';
    
    let savedData: any = {};
    try {
      const saved = localStorage.getItem('alisio_guest_data'); 
      if (saved) savedData = JSON.parse(saved);
    } catch {}

    const defaultName = urlName || savedData.name || savedData.firstName || '';
    const defaultEmail = urlEmail || savedData.email || '';
    const defaultPhone = urlPhone || savedData.phone || '';

    setName(prev => prev || defaultName);
    setEmail(prev => prev || defaultEmail);
    setPhone(prev => prev || defaultPhone);
  }, []);

  const extrasTotal = extras.reduce((s, e) => s + e.price, 0);
  const grandTotal = total + extrasTotal;
  const phoneDigits = phone.replace(/\D/g, '');
  const emailValid = email.trim() === '' || (email.includes('@') && email.includes('.'));
  const valid = name.trim().length >= 2 && emailValid;

  const handleQrClick = async () => {
    setQrLoading(true);
    try {
      const sess = await onShowQr({ name, email, phone });
      if (sess) setQrSession(sess);
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <div className="kc-fade-in">
      <h1 className="kc-title">Booking summary</h1>
      <p className="kc-subtitle">Review your booking and choose payment method</p>

      <div className="kc-summary">
        <div className="kc-summary-title">🏕️ {accommodationLabel}</div>
        <div className="kc-summary-row"><span>Check-in</span><strong>{checkIn}</strong></div>
        <div className="kc-summary-row"><span>Check-out</span><strong>{checkOut}</strong></div>
        <div className="kc-summary-row"><span>Nights</span><strong>{nights}</strong></div>
        <div className="kc-summary-row"><span>Guests</span><strong>{guests}</strong></div>
        <div className="kc-summary-divider" />

        {/* Detailed accommodation breakdown — for invoice */}
        {priceBreakdown.length > 0 ? (
          priceBreakdown.map((row, i) => (
            <div key={i} className="kc-summary-row" style={row.isDiscount ? { color: 'var(--kc-green)' } : {}}>
              <span>{row.label}</span>
              <strong>{row.isDiscount ? '−' : ''}{formatPrice(Math.abs(row.amount))} Kč</strong>
            </div>
          ))
        ) : (
          <div className="kc-summary-row">
            <span>Accommodation</span>
            <strong>{formatPrice(total)} Kč</strong>
          </div>
        )}

        {/* Extras */}
        {extras.map(e => (
          <div key={e.id} className="kc-summary-row">
            <span>{e.name} ×{e.quantity}</span>
            <strong>{formatPrice(e.price)} Kč</strong>
          </div>
        ))}

        <div className="kc-summary-divider" />
        <div className="kc-summary-row" style={{ fontSize: 18 }}>
          <span><strong>Total</strong></span>
          <strong style={{ color: 'var(--kc-green)' }}>
            {formatPrice(grandTotal)} Kč
            <span style={{ fontSize: 13, fontWeight: 500, color: '#555', marginLeft: 8 }}>
              (≈ {(grandTotal / 24).toFixed(2)} €)
            </span>
          </strong>
        </div>
      </div>

      {/* Contact form */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Contact details</div>
        <div className="kc-input-group">
          <label className="kc-input-label">Full name *</label>
          <input className="kc-input" value={name} onChange={e => setName(e.target.value)} placeholder="Jan Novák" />
        </div>
        <div className="kc-input-group">
          <label className="kc-input-label">Phone *</label>
          <input className="kc-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+420 ..." />
        </div>
        <div className="kc-input-group">
          <label className="kc-input-label">Email (optional)</label>
          <input className="kc-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@email.cz" />
        </div>
      </div>

      {/* Payment buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <button className="kc-btn kc-btn-primary" disabled={!valid || submitting}
          onClick={() => onPayOnline({ name, email, phone })} type="button">
          {submitting ? <><div className="kc-spinner" /> Processing...</> : `💳 Pay online — ${formatPrice(grandTotal)} Kč`}
        </button>
        <button className="kc-btn kc-btn-secondary" disabled={!valid || submitting || qrLoading}
          onClick={handleQrClick} type="button">
          {qrLoading ? <><div className="kc-spinner" /> Generating...</> : '📱 Show QR for guest'}
        </button>
        <button className="kc-btn kc-btn-secondary" disabled={!valid || submitting}
          onClick={() => onPayAdmin({ name, email, phone })} type="button">
          🏢 Pay via administrator (cash)
        </button>
        <button className="kc-btn kc-btn-secondary" disabled={!valid || submitting}
          onClick={() => onPayAdminEur({ name, email, phone })} type="button"
          style={{ borderColor: '#166534', color: '#166534' }}>
          💶 Pay via administrator (EUR ≈ {(grandTotal / 24).toFixed(2)} €)
        </button>
        <button className="kc-btn kc-btn-secondary" disabled={!valid || submitting}
          onClick={() => onPayTerminal({ name, email, phone })} type="button"
          style={{ borderColor: '#3b82f6', color: '#1d4ed8' }}>
          💳 Pay by terminal (card)
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--kc-text-muted)', marginTop: 12 }}>
        By booking you agree to the terms of Kemp Carlsbad s.r.o.
      </div>

      {qrSession && (
        <QrPaymentModal
          url={qrSession.url}
          reservationId={qrSession.reservationId}
          amount={grandTotal}
          onPaid={() => { const rid = qrSession.reservationId; setQrSession(null); onQrPaid(rid); }}
          onClose={() => setQrSession(null)}
        />
      )}
    </div>
  );
}

function QrPaymentModal({
  url, reservationId, amount, onPaid, onClose,
}: {
  url: string;
  reservationId: string;
  amount: number;
  onPaid: () => void;
  onClose: () => void;
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(url)}`;
  const [polling, setPolling] = useState<'waiting' | 'paid'>('waiting');

  // Poll the draft endpoint for payment_status. Stops on 'paid' or unmount.
  useEffect(() => {
    if (!reservationId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/booking/drafts?reservation_id=${encodeURIComponent(reservationId)}`);
        if (!r.ok) return;
        const data = await r.json();
        const ps = data?.reservation_payment_status || data?.payment_status;
        if (!cancelled && ps === 'paid') {
          setPolling('paid');
          // Brief delay so the user sees the confirmation flash before transition.
          setTimeout(() => { if (!cancelled) onPaid(); }, 1200);
        }
      } catch { /* network blip — keep polling */ }
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [reservationId, onPaid]);

  return (
    <div
      onClick={polling === 'paid' ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, padding: 24, maxWidth: 380, width: '100%',
          textAlign: 'center', boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {polling === 'paid' ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--kc-green)', marginBottom: 4 }}>Payment received</div>
            <div style={{ fontSize: 13, color: '#666' }}>Confirming booking...</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Scan to pay</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Guest scans with their phone to open the Teya payment page
            </div>
            <div style={{
              background: '#f8fafb', borderRadius: 14, padding: 12,
              display: 'inline-block', marginBottom: 16, border: '2px solid #e2e8f0',
            }}>
              <img src={qrSrc} alt="Payment QR" width={260} height={260} style={{ display: 'block', borderRadius: 8 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--kc-green)', marginBottom: 8 }}>
              {formatPrice(amount)} Kč
            </div>
            <div style={{
              fontSize: 12, color: '#777', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span className="kc-spinner" style={{ width: 12, height: 12 }} />
              Waiting for payment...
            </div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 16, lineHeight: 1.4 }}>
              Link is valid for ~30 minutes. The booking confirms automatically once paid.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a
                href={url} target="_blank" rel="noopener noreferrer"
                className="kc-btn kc-btn-primary"
                style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}
              >
                💳 Open payment in new tab
              </a>
              <button className="kc-btn kc-btn-secondary" onClick={onClose} type="button">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
