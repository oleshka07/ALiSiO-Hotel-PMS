'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lock, ShieldCheck, ShieldPlus, X, Loader2 } from 'lucide-react';

type Status = { hasPassphrase: boolean; unlocked: boolean };

export default function FinanceGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const [panel, setPanel] = useState<null | 'setup' | 'manage'>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/security/status', { cache: 'no-store' });
      if (res.ok) {
        setStatus(await res.json());
      } else {
        // Not the owner, or a transient error — enforcement still lives in the
        // API layer, so fail open here and let the page's own calls 401/403.
        setStatus({ hasPassphrase: false, unlocked: true });
      }
    } catch {
      setStatus({ hasPassphrase: false, unlocked: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  if (loading) {
    return (
      <div style={center}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    );
  }

  const locked = !!status && status.hasPassphrase && !status.unlocked;

  if (locked) {
    return <UnlockScreen onUnlocked={loadStatus} />;
  }

  return (
    <>
      {children}

      <button
        onClick={() => setPanel(status?.hasPassphrase ? 'manage' : 'setup')}
        title="Безпека фінансів"
        style={fab}
      >
        {status?.hasPassphrase
          ? <ShieldCheck size={16} color="#16a34a" />
          : <ShieldPlus size={16} color="#64748b" />}
        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
          {status?.hasPassphrase ? 'Пароль увімкнено' : 'Увімкнути пароль'}
        </span>
      </button>

      {panel === 'setup' && (
        <SetupModal onClose={() => setPanel(null)} onDone={() => { setPanel(null); loadStatus(); }} />
      )}
      {panel === 'manage' && (
        <ManageModal onClose={() => setPanel(null)} onLocked={() => { setPanel(null); loadStatus(); }} />
      )}
    </>
  );
}

// ─── Unlock (full-screen, blocks finance) ──────────────────────────────────
function UnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/finance/security/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: pass }),
      });
      if (res.ok) { onUnlocked(); return; }
      const j = await res.json().catch(() => ({}));
      setErr(j.error || 'Помилка');
    } catch { setErr('Помилка мережі'); }
    finally { setBusy(false); }
  };

  return (
    <div style={center}>
      <form onSubmit={submit} style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={iconCircle}><Lock size={22} color="#b91c1c" /></div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Фінансовий розділ заблоковано</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            Введіть пароль фінансів, щоб отримати доступ.
          </p>
        </div>
        <input
          type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)}
          placeholder="Пароль фінансів" style={input}
        />
        {err && <div style={errBox}>{err}</div>}
        <button type="submit" disabled={busy || !pass} style={primaryBtn}>
          {busy ? 'Перевірка…' : 'Розблокувати'}
        </button>
      </form>
    </div>
  );
}

// ─── Setup (enable the passphrase) ─────────────────────────────────────────
function SetupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (p1.length < 8) { setErr('Мінімум 8 символів'); return; }
    if (p1 !== p2) { setErr('Паролі не збігаються'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/finance/security/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: p1 }),
      });
      if (res.ok) { onDone(); return; }
      const j = await res.json().catch(() => ({}));
      setErr(j.error || 'Помилка');
    } catch { setErr('Помилка мережі'); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} title="Увімкнути пароль фінансів">
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
        Окремий пароль, який запитуватиметься при вході у Фінанси — додатковий
        захист, навіть якщо хтось отримає доступ до вашого облікового запису.
        Запам’ятайте його: відновлення немає.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input type="password" autoFocus value={p1} onChange={(e) => setP1(e.target.value)} placeholder="Новий пароль фінансів" style={input} />
        <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Повторіть пароль" style={input} />
        {err && <div style={errBox}>{err}</div>}
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Збереження…' : 'Увімкнути'}</button>
      </form>
    </Modal>
  );
}

// ─── Manage (lock now) ─────────────────────────────────────────────────────
function ManageModal({ onClose, onLocked }: { onClose: () => void; onLocked: () => void }) {
  const [busy, setBusy] = useState(false);
  const lockNow = async () => {
    setBusy(true);
    try {
      await fetch('/api/finance/security/lock', { method: 'POST' });
      onLocked();
    } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} title="Безпека фінансів">
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
        Пароль фінансів увімкнено. Розділ автоматично блокується після періоду
        неактивності. Можете заблокувати зараз вручну.
      </p>
      <button onClick={lockNow} disabled={busy} style={primaryBtn}>
        {busy ? '…' : 'Заблокувати зараз'}
      </button>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...card, width: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Inline styles ─────────────────────────────────────────────────────────
const center: React.CSSProperties = { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 24, width: 360, maxWidth: '92vw', boxShadow: '0 10px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 14 };
const iconCircle: React.CSSProperties = { width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const input: React.CSSProperties = { padding: '11px 13px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };
const primaryBtn: React.CSSProperties = { padding: '11px 14px', borderRadius: 9, border: 'none', background: '#0f172a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const errBox: React.CSSProperties = { fontSize: 13, color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: '8px 10px' };
const fab: React.CSSProperties = { position: 'fixed', right: 18, bottom: 18, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.1)', cursor: 'pointer', zIndex: 900 };
