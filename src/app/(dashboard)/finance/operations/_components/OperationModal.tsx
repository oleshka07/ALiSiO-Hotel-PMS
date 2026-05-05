'use client';

import { useEffect, useState } from 'react';
import { X, Repeat, Check } from 'lucide-react';
import AttachmentsSection from './AttachmentsSection';

type OpType = 'income' | 'expense' | 'transfer';

interface Account { id: string; name: string; currency: string; color: string }
interface Category { id: string; name: string; icon: string | null; op_type: string | null }
interface Project { id: string; name: string }
interface Counterparty { id: string; name: string }

interface Props {
  opType: OpType;
  initial?: any;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

export default function OperationModal({ opType, initial, accounts, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState<string>(initial?.amount?.toString() || '');
  const [currency, setCurrency] = useState(initial?.currency || 'CZK');
  const [accountFromId, setAccountFromId] = useState<string>(initial?.account_from_id || (opType !== 'income' ? accounts[0]?.id || '' : ''));
  const [accountToId, setAccountToId] = useState<string>(initial?.account_to_id || (opType !== 'expense' ? accounts[0]?.id || '' : ''));
  const [paidAt, setPaidAt] = useState((initial?.paid_at || new Date().toISOString()).substring(0, 10));
  const [accruedAt, setAccruedAt] = useState((initial?.accrued_at || initial?.paid_at || new Date().toISOString()).substring(0, 10));
  const [accrualDiffers, setAccrualDiffers] = useState(
    !!initial && !!initial.accrued_at && !!initial.paid_at && initial.accrued_at.substring(0, 10) !== initial.paid_at.substring(0, 10)
  );
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id || '');
  const [projectId, setProjectId] = useState<string>(initial?.project_id || '');
  const [counterpartyId, setCounterpartyId] = useState<string>(initial?.counterparty_id || '');
  const [comment, setComment] = useState(initial?.comment || '');

  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/finance/categories?op_type=${opType}`).then((r) => r.json()).catch(() => []),
      fetch('/api/finance/projects').then((r) => r.json()).catch(() => []),
      fetch('/api/finance/counterparties').then((r) => r.json()).catch(() => []),
    ]).then(([cats, projs, cps]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setCounterparties(Array.isArray(cps) ? cps : []);
    });
  }, [opType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) { setError('Вкажіть додатну суму'); return; }

    const body: any = {
      op_type: opType,
      amount: amt,
      currency,
      paid_at: paidAt,
      accrued_at: accrualDiffers ? accruedAt : paidAt,
      comment: comment || null,
      source: 'manual',
      status: 'completed',
    };
    if (opType === 'income') body.account_to_id = accountToId;
    if (opType === 'expense') body.account_from_id = accountFromId;
    if (opType === 'transfer') {
      if (accountFromId === accountToId) { setError('Рахунки мають відрізнятися'); return; }
      body.account_from_id = accountFromId;
      body.account_to_id = accountToId;
    }
    if (opType !== 'transfer') body.category_id = categoryId || null;
    body.project_id = projectId || null;
    body.counterparty_id = counterpartyId || null;

    setSaving(true);
    try {
      const url = initial ? `/api/finance/operations/${initial.id}` : '/api/finance/operations';
      const method = initial ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Помилка збереження');
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  const title = opType === 'income' ? 'Новий дохід' : opType === 'expense' ? 'Нова витрата' : 'Переказ';
  const accentColor = opType === 'income' ? '#22c55e' : opType === 'expense' ? '#ef4444' : '#6366f1';

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1, color: accentColor }}>{initial ? `Редагувати: ${title}` : title}</h3>
          <button type="button" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        {(opType === 'expense' || opType === 'transfer') && (
          <Field label={opType === 'transfer' ? 'З рахунку' : 'З рахунку (витрата)'}>
            <select value={accountFromId} onChange={(e) => setAccountFromId(e.target.value)} style={input} required>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </Field>
        )}
        {(opType === 'income' || opType === 'transfer') && (
          <Field label={opType === 'transfer' ? 'На рахунок' : 'На рахунок (дохід)'}>
            <select value={accountToId} onChange={(e) => setAccountToId(e.target.value)} style={input} required>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </Field>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Field label="Сума">
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={input} autoFocus />
          </Field>
          <Field label="Валюта">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={input}>
              <option value="CZK">CZK</option><option value="EUR">EUR</option><option value="USD">USD</option>
            </select>
          </Field>
        </div>

        {opType !== 'transfer' && (
          <Field label="Категорія">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={input}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon || ''} {c.name}</option>)}
            </select>
          </Field>
        )}

        {opType !== 'transfer' && (
          <Field label="Контрагент (опц.)">
            <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} style={input}>
              <option value="">—</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Проєкт (опц.)">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={input}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field label="Дата платежу">
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} style={input} />
        </Field>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={accrualDiffers} onChange={(e) => setAccrualDiffers(e.target.checked)} />
            Дата угоди (нарахування) відрізняється
          </label>
          {accrualDiffers && (
            <div style={{ marginTop: 6 }}>
              <input type="date" value={accruedAt} onChange={(e) => setAccruedAt(e.target.value)} style={input} />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Використовується у P&L-звіті: коли гроші «зароблені» чи «витрачені» економічно (не коли фактично пройшли).
              </div>
            </div>
          )}
        </div>

        <Field label="Коментар (опц.)">
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} style={{ ...input, minHeight: 50, resize: 'vertical' }} />
        </Field>

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        {initial?.suggested_recurring_id && initial?.suggested_recurring_name && (
          <RecurringSuggestionBanner
            operationId={initial.id}
            templateName={initial.suggested_recurring_name}
            onApplied={() => { onSaved(); }}
          />
        )}

        <AttachmentsSection operationId={initial?.id || null} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSec}>Відміна</button>
          <button type="submit" disabled={saving} style={{ ...btnPrim, background: accentColor }}>
            {saving ? 'Збереження…' : initial ? 'Зберегти' : 'Додати'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RecurringSuggestionBanner({ operationId, templateName, onApplied }: {
  operationId: string; templateName: string; onApplied: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function act(confirm: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/finance/operations/${operationId}/apply-recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(`Помилка: ${j.error || 'failed'}`);
      } else {
        onApplied();
      }
    } catch (e: any) { alert(`Помилка: ${e.message}`); }
    setBusy(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: 12, marginBottom: 12, borderRadius: 8,
      background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
    }}>
      <Repeat size={16} color="#16a34a" />
      <div style={{ flex: 1, fontSize: 13 }}>
        Виглядає як <b>{templateName}</b>. Підтвердити автозаповнення категорії/проєкту/контрагента з шаблону?
      </div>
      <button
        type="button"
        onClick={() => act(false)}
        disabled={busy}
        style={{
          padding: '6px 12px', fontSize: 12, fontWeight: 500,
          background: 'transparent', border: '1px solid var(--border-primary)',
          borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
        }}
      >
        Не моє
      </button>
      <button
        type="button"
        onClick={() => act(true)}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 12px', fontSize: 12, fontWeight: 600,
          background: '#16a34a', border: 'none', borderRadius: 6,
          color: '#fff', cursor: 'pointer',
        }}
      >
        <Check size={12} /> Підтвердити
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// Side-panel layout (Finmap-style): slides in from the right, full
// viewport height, fixed 480 px wide. Clicking the dim overlay closes.
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
  display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
};
const modalStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', padding: 24,
  width: 480, maxWidth: '100%', height: '100vh', overflowY: 'auto',
  borderLeft: '1px solid var(--border-primary)',
  boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
};
const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border-primary)',
  borderRadius: 8, fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 };
const btnPrim: React.CSSProperties = { padding: '9px 18px', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: '9px 18px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, cursor: 'pointer' };
