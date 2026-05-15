'use client';

import React, { useState, useRef, useCallback } from 'react';
import { formatPrice } from '../lib/pricing';

interface Props {
  status: 'success' | 'failed' | 'pending' | 'admin_pending';
  reservationId?: string;
  accommodationLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  adults?: number;
  guestEmail?: string | null;
  guestPageToken?: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  onReset: () => void;
  onAdminConfirm?: (pin: string) => Promise<{ ok: boolean; adminName?: string; error?: string }>;
}

// ─── Admin PIN Popup ──────────────────────────────────────────────────────────
function AdminPinPopup({
  onConfirm,
  onClose,
}: {
  onConfirm: (pin: string) => Promise<{ ok: boolean; adminName?: string; error?: string }>;
  onClose: () => void;
}) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (pin.length < 4) { setError('Введіть PIN-код'); return; }
    setLoading(true);
    setError(null);
    const result = await onConfirm(pin);
    setLoading(false);
    if (result.ok) {
      setSuccess(`✅ Оплату підтверджено · ${result.adminName}`);
      setTimeout(() => onClose(), 2200);
    } else {
      setError(result.error || 'Помилка');
      setPin('');
    }
  };

  return (
    <div
      onClick={() => { if (!loading && !success) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, padding: '28px 24px',
          maxWidth: 320, width: '100%', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {success ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>{success}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111', marginBottom: 4 }}>
              Підтвердження оплати
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
              Введіть PIN-код адміністратора
            </div>

            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="••••"
              style={{
                width: '100%', padding: '14px 16px',
                fontSize: 24, letterSpacing: 8, textAlign: 'center',
                border: error ? '2px solid #ef4444' : '2px solid #e2e8f0',
                borderRadius: 12, outline: 'none', boxSizing: 'border-box',
                marginBottom: error ? 8 : 20,
                background: '#f8fafc',
                fontFamily: 'monospace',
              }}
            />

            {error && (
              <div style={{
                background: '#fef2f2', color: '#dc2626', fontSize: 13,
                padding: '8px 12px', borderRadius: 8, marginBottom: 16,
                border: '1px solid #fecaca',
              }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                style={{
                  flex: 1, padding: '11px 0',
                  background: '#f1f5f9', color: '#475569',
                  border: 'none', borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || pin.length < 4}
                style={{
                  flex: 2, padding: '11px 0',
                  background: loading || pin.length < 4 ? '#94a3b8' : '#2e6b4f',
                  color: '#fff', border: 'none', borderRadius: 12,
                  fontWeight: 700, fontSize: 14, cursor: loading || pin.length < 4 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background .2s',
                }}
              >
                {loading ? <><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} /> Перевірка...</> : '✅ Підтвердити'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── QR Code Popup ────────────────────────────────────────────────────────────
function QrPopup({ url, onClose }: { url: string; onClose: () => void }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=16&data=${encodeURIComponent(url)}`;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, padding: 28,
          maxWidth: 340, width: '100%', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111', marginBottom: 4 }}>🏕️ Guest Page</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 20, wordBreak: 'break-all' }}>{url}</div>
        <div style={{
          background: '#f8fafb', borderRadius: 16, padding: 12,
          display: 'inline-block', marginBottom: 20, border: '2px solid #e2e8f0',
        }}>
          <img src={qrSrc} alt="QR code" width={220} height={220} style={{ display: 'block', borderRadius: 8 }} />
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 20, lineHeight: 1.5 }}>
          Відскануй камерою телефону для переходу на гостьову сторінку
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={qrSrc} download="guest-page-qr.png"
            style={{
              flex: 1, padding: '10px 0', background: '#2e6b4f', color: '#fff',
              borderRadius: 12, textDecoration: 'none', fontWeight: 600, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >⬇️ Download</a>
          <button
            onClick={onClose} type="button"
            style={{
              flex: 1, padding: '10px 0', background: '#f1f5f9', color: '#334155',
              border: 'none', borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Guest Page Link Row ──────────────────────────────────────────────────────
function GuestPageLink({ token }: { token: string }) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const guestUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/guest/${token}`
    : `/guest/${token}`;

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [guestUrl]);

  return (
    <>
      {showQr && <QrPopup url={guestUrl} onClose={() => setShowQr(false)} />}
      <div style={{
        background: 'var(--kc-green-light, #f0f9f4)',
        border: '1.5px solid var(--kc-green, #2e6b4f)',
        borderRadius: 14, padding: '14px 16px', marginTop: 20, textAlign: 'left',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--kc-green, #2e6b4f)', marginBottom: 8 }}>
          🏠 Your Guest Page
        </div>
        <div style={{ fontSize: 12, color: 'var(--kc-text-muted, #888)', marginBottom: 10, wordBreak: 'break-all' }}>
          {guestUrl}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/guest/${token}`} style={{
            flex: '1 1 auto', minWidth: 90, padding: '9px 14px',
            background: 'var(--kc-green, #2e6b4f)', color: '#fff',
            borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>Open →</a>
          <button type="button" onClick={copyLink} style={{
            flex: '1 1 auto', minWidth: 90, padding: '9px 14px',
            background: copied ? '#d1fae5' : 'var(--kc-bg-card, #f8fafb)',
            color: copied ? '#065f46' : 'var(--kc-text, #334155)',
            border: '1.5px solid var(--kc-border, #e2e8f0)',
            borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .2s',
          }}>
            {copied ? '✓ Copied' : '📋 Copy link'}
          </button>
          <button type="button" onClick={() => setShowQr(true)} style={{
            flex: '1 1 auto', minWidth: 90, padding: '9px 14px',
            background: 'var(--kc-bg-card, #f8fafb)', color: 'var(--kc-text, #334155)',
            border: '1.5px solid var(--kc-border, #e2e8f0)',
            borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>📱 QR code</button>
        </div>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StepSuccess({
  status, reservationId, accommodationLabel, checkIn, checkOut,
  nights, total, adults = 1, guestEmail, guestPageToken, paymentUrl, qrCodeUrl,
  onReset, onAdminConfirm,
}: Props) {
  const hasEmail = !!(guestEmail && guestEmail.trim());
  const [regStep, setRegStep] = useState<'none' | 'photo' | 'done'>('none');
  const [currentGuest, setCurrentGuest] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [registeredNames, setRegisteredNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPinPopup, setShowPinPopup] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setPhotos([]);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) setPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const submitPhotos = async () => {
    if (photos.length === 0 || !reservationId) return;
    setUploading(true);
    setError(null);
    try {
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        const blob = await fetch(photo).then(r => r.blob());
        const formData = new FormData();
        formData.append('file', blob, `doc_guest${currentGuest + 1}_${Date.now()}.jpg`);
        formData.append('folder', `guest_docs/${reservationId}`);
        const uploadRes = await fetch('/api/file-upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.url) uploadedUrls.push(uploadData.url);
      }
      if (uploadedUrls.length > 0) {
        const regRes = await fetch('/api/booking/register-guest', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservation_id: reservationId, document_urls: uploadedUrls }),
        });
        const regData = await regRes.json();
        if (regData.ocr_results) {
          const names = (regData.ocr_results as { firstName: string; lastName: string }[])
            .map(r => `${r.firstName} ${r.lastName}`.trim()).filter(Boolean);
          setRegisteredNames(prev => [...prev, ...names]);
        }
      }
      const nextGuest = currentGuest + 1;
      if (nextGuest < adults) { setCurrentGuest(nextGuest); setPhotos([]); }
      else setRegStep('done');
    } catch (err) {
      console.error('[Registration]', err);
      setError('Upload failed. Please try again.');
    } finally { setUploading(false); }
  };

  // ─── Failed ────────────────────────────────────────
  if (status === 'failed') {
    return (
      <div className="kc-fade-in kc-success">
        <div className="kc-success-icon" style={{ background: 'var(--kc-error-light)', color: 'var(--kc-error)' }}>✗</div>
        <h2>Payment failed</h2>
        <p>Your payment was not completed. Please try again or contact us.</p>
        {reservationId && (
          <div style={{ background: 'var(--kc-bg-card, #f8fafb)', borderRadius: 'var(--kc-radius-sm)', padding: '10px 14px', margin: '12px auto', display: 'inline-block', border: '1px solid var(--kc-border, #e2e8f0)' }}>
            <div style={{ fontSize: 11, color: 'var(--kc-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Booking reference</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace' }}>{reservationId}</div>
          </div>
        )}
        <button className="kc-btn kc-btn-primary" onClick={onReset} type="button">Try again</button>
        <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" className="kc-help-link">💬 Contact us via WhatsApp</a>
      </div>
    );
  }

  // ─── Processing ────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="kc-fade-in kc-success">
        <div className="kc-success-icon" style={{ background: '#fff8e1', color: '#8b6914' }}>⏳</div>
        <h2>Processing payment...</h2>
        <p>Please wait while we confirm your payment.</p>
        <div className="kc-spinner" style={{ margin: '16px auto', borderColor: 'rgba(46,107,79,0.2)', borderTopColor: 'var(--kc-green)' }} />
        {qrCodeUrl && (
          <div style={{ margin: '20px auto', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Scan to pay</div>
            <img src={qrCodeUrl} alt="Payment QR" style={{ width: 200, height: 200, borderRadius: 12, border: '2px solid var(--kc-border)' }} />
          </div>
        )}
        {paymentUrl && (
          <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="kc-btn kc-btn-primary" style={{ textDecoration: 'none', display: 'flex', marginTop: 12 }}>
            💳 Open payment page →
          </a>
        )}
      </div>
    );
  }

  // ─── Admin pending ─────────────────────────────────
  if (status === 'admin_pending') {
    return (
      <div className="kc-fade-in kc-success">
        {/* PIN popup */}
        {showPinPopup && onAdminConfirm && (
          <AdminPinPopup
            onConfirm={onAdminConfirm}
            onClose={() => setShowPinPopup(false)}
          />
        )}

        <div className="kc-success-icon" style={{ background: '#fff8e1', color: '#8b6914' }}>🏢</div>
        <h2>Waiting for administrator</h2>
        <p>Please pay at the reception. The administrator will confirm your payment.</p>

        <div className="kc-summary" style={{ textAlign: 'left', marginTop: 20 }}>
          {reservationId && <div className="kc-summary-row"><span>Booking ID</span><strong>{reservationId}</strong></div>}
          <div className="kc-summary-row"><span>Total to pay</span><strong style={{ color: 'var(--kc-green)' }}>{formatPrice(total)} Kč</strong></div>
        </div>

        {/* Guest page QR */}
        {guestPageToken && <GuestPageLink token={guestPageToken} />}

        {/* Admin confirm — protected by PIN popup */}
        {onAdminConfirm && (
          <button
            className="kc-btn kc-btn-primary"
            onClick={() => setShowPinPopup(true)}
            type="button"
            style={{ marginTop: 20 }}
          >
            ✅ Адміністратор: Підтвердити оплату
          </button>
        )}

        <a href="https://wa.me/420723565616" target="_blank" rel="noopener noreferrer" className="kc-help-link">💬 Contact administrator</a>
      </div>
    );
  }

  // ─── Success ───────────────────────────────────────
  return (
    <div className="kc-fade-in kc-success">
      <div className="kc-success-icon">✓</div>
      <h2>Booking confirmed!</h2>
      <p>
        Thank you for your reservation.
        {hasEmail
          ? ' A confirmation email has been sent to the address you provided.'
          : ' Please save your booking ID below — we can use it to look up your stay at check-in.'}
      </p>

      {reservationId && (
        <div style={{ background: 'var(--kc-green-light)', borderRadius: 'var(--kc-radius-sm)', padding: '12px 16px', margin: '16px auto', display: 'inline-block' }}>
          <div style={{ fontSize: 12, color: 'var(--kc-text-muted)' }}>Booking ID</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--kc-green)' }}>{reservationId}</div>
        </div>
      )}

      <div className="kc-summary" style={{ textAlign: 'left', marginTop: 20 }}>
        <div className="kc-summary-row"><span>Accommodation</span><strong>{accommodationLabel}</strong></div>
        <div className="kc-summary-row"><span>Check-in</span><strong>{checkIn}</strong></div>
        <div className="kc-summary-row"><span>Check-out</span><strong>{checkOut}</strong></div>
        <div className="kc-summary-row"><span>Nights</span><strong>{nights}</strong></div>
        <div className="kc-summary-divider" />
        <div className="kc-summary-row" style={{ color: 'var(--kc-green)' }}><span>Paid</span><strong>{formatPrice(total)} Kč</strong></div>
      </div>

      {/* Guest Page link + QR */}
      {guestPageToken && <GuestPageLink token={guestPageToken} />}

      {/* ─── Guest Registration ─────────────────────── */}
      {regStep === 'none' && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, textAlign: 'left' }}>Guest registration</div>
          <p style={{ fontSize: 14, color: 'var(--kc-text-secondary)', textAlign: 'left', marginBottom: 12 }}>
            Upload a photo of your ID or passport for each guest ({adults} adult{adults > 1 ? 's' : ''}).
          </p>
          <button className="kc-btn kc-btn-primary" onClick={() => setRegStep('photo')} type="button">
            📷 Register via photo
          </button>
        </div>
      )}

      {regStep === 'photo' && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, textAlign: 'left' }}>
            📷 Guest {currentGuest + 1} of {adults} — Document photo
          </div>
          {adults > 1 && (
            <div style={{ fontSize: 13, color: 'var(--kc-text-muted)', marginBottom: 12 }}>
              {currentGuest + 1 < adults ? `After this, ${adults - currentGuest - 1} more guest(s) to register` : 'Last guest'}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {photos.map((src, i) => (
                <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--kc-green)' }}>
                  <img src={src} alt={`Doc ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} type="button"
                    style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="kc-btn kc-btn-secondary" style={{ flex: 1 }}
              onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute('capture'); fileRef.current.click(); } }} type="button">
              🖼️ Gallery
            </button>
            <button className="kc-btn kc-btn-secondary" style={{ flex: 1 }}
              onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); } }} type="button">
              📸 Camera
            </button>
          </div>
          {error && <div className="kc-alert" style={{ color: 'var(--kc-error)', marginBottom: 8 }}>⚠️ {error}</div>}
          {photos.length > 0 && (
            <button className="kc-btn kc-btn-primary" onClick={submitPhotos} disabled={uploading} type="button">
              {uploading ? <><div className="kc-spinner" /> Processing...</> : currentGuest + 1 < adults ? `Upload & continue to guest ${currentGuest + 2}` : `Upload & complete registration`}
            </button>
          )}
          <button className="kc-btn kc-btn-ghost" onClick={() => setRegStep('none')} type="button">Skip registration</button>
        </div>
      )}

      {regStep === 'done' && (
        <div className="kc-alert info" style={{ marginTop: 20 }}>
          <span className="kc-alert-icon">✅</span>
          <div>
            Registration complete!
            {registeredNames.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 13 }}>Registered: <strong>{registeredNames.join(', ')}</strong></div>
            )}
          </div>
        </div>
      )}

      <button className="kc-btn kc-btn-secondary" onClick={onReset} style={{ marginTop: 16 }} type="button">
        Book another stay
      </button>

      <div className="kc-footer">
        {hasEmail && <>📧 Confirmation sent to <strong>{guestEmail}</strong><br /></>}
        📞 +420 723 565 616
      </div>
    </div>
  );
}
