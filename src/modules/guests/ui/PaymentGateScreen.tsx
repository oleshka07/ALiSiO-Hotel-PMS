'use client';
import { useState } from 'react';
import type { Translations, Lang } from '@/app/guest/[token]/translations';

const ALL_LANGS: Lang[] = ['en', 'de', 'cs', 'uk', 'pl', 'nl', 'fr'];
const LANG_LABELS: Record<Lang, string> = { en: 'EN', de: 'DE', cs: 'CZ', uk: 'UA', pl: 'PL', nl: 'NL', fr: 'FR' };

interface Props {
  data: any;
  t: Translations;
  lang: Lang;
  setLang?: (l: Lang) => void;
  token: string;
}

export function PaymentGateScreen({ data, t, lang, setLang, token }: Props) {
  const r = data.reservation;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = data.payments?.remaining ?? r?.total_price ?? 0;
  const currency = r?.currency || 'CZK';

  // Format date
  const fmt = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}.${m}.${y}`;
  };

  // Days until check-in
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
  const checkIn = new Date((r?.check_in || '') + 'T00:00:00');
  const dLeft = Math.max(0, Math.round((checkIn.getTime() - today.getTime()) / 86400000));

  const nights = r?.nights || 0;
  const guestName = r?.first_name || '';
  const unitName = r?.unit_name || '';

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${token}/pay-booking`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Payment error');
      if (result.session_url) {
        window.location.href = result.session_url;
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  // Locale labels
  const labels: Record<string, Record<string, string>> = {
    en: { banner: 'Complete payment to unlock full access', nights: 'nights', daysTo: `${dLeft} days to check-in`, bookedFor: 'Booking confirmed', payBtn: 'Complete payment →', remaining: 'Remaining', contact: 'Questions? Call us', locked: 'Available after payment' },
    de: { banner: 'Zahlung abschließen für vollständigen Zugang', nights: 'Nächte', daysTo: `${dLeft} Tage bis zum Check-in`, bookedFor: 'Buchung bestätigt', payBtn: 'Zahlung abschließen →', remaining: 'Ausstehend', contact: 'Fragen? Rufen Sie uns an', locked: 'Verfügbar nach Zahlung' },
    cs: { banner: 'Dokončete platbu pro plný přístup', nights: 'nocí', daysTo: `${dLeft} dní do příjezdu`, bookedFor: 'Rezervace potvrzena', payBtn: 'Dokončit platbu →', remaining: 'Zbývá uhradit', contact: 'Dotazy? Zavolejte nám', locked: 'Dostupné po platbě' },
    uk: { banner: 'Завершіть оплату для повного доступу', nights: 'ночей', daysTo: `${dLeft} днів до заїзду`, bookedFor: 'Бронювання підтверджено', payBtn: 'Оплатити бронювання →', remaining: 'До сплати', contact: 'Питання? Телефонуйте нам', locked: 'Доступно після оплати' },
    pl: { banner: 'Dokończ płatność, aby uzyskać pełny dostęp', nights: 'nocy', daysTo: `${dLeft} dni do zameldowania`, bookedFor: 'Rezerwacja potwierdzona', payBtn: 'Dokończ płatność →', remaining: 'Pozostało', contact: 'Pytania? Zadzwoń do nas', locked: 'Dostępne po płatności' },
    nl: { banner: 'Voltooi betaling voor volledige toegang', nights: 'nachten', daysTo: `${dLeft} dagen tot check-in`, bookedFor: 'Boeking bevestigd', payBtn: 'Betaling voltooien →', remaining: 'Resterend', contact: 'Vragen? Bel ons', locked: 'Beschikbaar na betaling' },
    fr: { banner: 'Finalisez le paiement pour accès complet', nights: 'nuits', daysTo: `${dLeft} jours avant arrivée`, bookedFor: 'Réservation confirmée', payBtn: 'Finaliser le paiement →', remaining: 'Reste à payer', contact: 'Questions ? Appelez-nous', locked: 'Disponible après paiement' },
  };
  const L = labels[lang] || labels.en;

  return (
    <div className="gp-payment-gate">
      {/* Language pills */}
      {setLang && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '10px 16px 0' }}>
          {ALL_LANGS.map(l => (
            <button key={l} className={`gp-lang-pill ${l === lang ? 'active' : ''}`}
              onClick={() => setLang(l)}
              style={{ fontSize: 11, padding: '4px 8px', background: l === lang ? '#000' : 'rgba(0,0,0,0.4)', color: '#FFF' }}>{LANG_LABELS[l]}</button>
          ))}
        </div>
      )}

      {/* Banner */}
      <div className="gp-payment-banner">
        ⚠️ {L.banner}
      </div>

      {/* Wallet Card */}
      <div className="gp-wallet-card" style={{ margin: '0 16px 16px' }}>
        <div className="gp-wallet-unit">{unitName}</div>
        <div className="gp-wallet-dates">
          <div>
            <div className="gp-wallet-label">{t.checkIn}</div>
            <div className="gp-wallet-val">{fmt(r?.check_in)}</div>
          </div>
          <div className="gp-wallet-sep">→</div>
          <div>
            <div className="gp-wallet-label">{t.checkOut}</div>
            <div className="gp-wallet-val">{fmt(r?.check_out)}</div>
          </div>
          <div>
            <div className="gp-wallet-label">{t.nights}</div>
            <div className="gp-wallet-val">{nights}</div>
          </div>
        </div>
        <div className="gp-wallet-countdown">{L.daysTo}</div>
      </div>

      {/* Booking confirmed */}
      <div className="gp-pg-card">
        <div className="gp-pg-row">
          <span className="gp-pg-icon">✅</span>
          <span className="gp-pg-label">{L.bookedFor}</span>
        </div>
        {guestName && (
          <div className="gp-pg-row">
            <span className="gp-pg-icon">👤</span>
            <span className="gp-pg-label">{guestName}</span>
          </div>
        )}
        <div className="gp-pg-row">
          <span className="gp-pg-icon">🏠</span>
          <span className="gp-pg-label">{unitName} · {nights} {L.nights}</span>
        </div>
      </div>

      {/* Payment block */}
      <div className="gp-pg-card gp-pg-card--pay">
        <div className="gp-pg-remaining-label">{L.remaining}</div>
        <div className="gp-pg-remaining-amount">
          {Number(remaining).toLocaleString()} {currency}
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
            ❌ {error}
          </div>
        )}

        <button className="gp-pg-pay-btn" onClick={handlePay} disabled={loading}>
          {loading ? '⏳ ...' : L.payBtn}
        </button>

        <div className="gp-pg-contact">
          {L.contact}: <a href="tel:+420773708849">+420 773 708 849</a>
        </div>
      </div>

      {/* Locked features */}
      <div className="gp-pg-locked">
        {['🧭 ' + (t.directions || 'Directions'), '🚗 ' + (t.parking || 'Parking'), '🔑 ' + (t.entry || 'Entry'), '📶 Wi-Fi', '🛎 ' + (t.services || 'Services')].map((item, i) => (
          <div key={i} className="gp-pg-locked-item">
            <span>{item}</span>
            <span className="gp-pg-locked-badge">🔒 {L.locked}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
