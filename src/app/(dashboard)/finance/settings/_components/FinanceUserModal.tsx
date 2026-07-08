'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { FinanceAccess } from './FinanceUsersTab';

interface Props {
  user: { id: string; full_name: string; email: string; role: string; access: FinanceAccess | null };
  accounts: Array<{ id: string; name: string; type: string; currency: string }>;
  onClose: () => void;
  onSaved: () => void;
}

const ALL_TABS: Array<{ value: string; label: string }> = [
  { value: 'operations', label: 'Операції' },
  { value: 'reports', label: 'Звіти' },
  { value: 'bank', label: 'Банк' },
  { value: 'clearing', label: 'Clearing (платформи)' },
  { value: 'receipts', label: 'Чеки з пошти' },
  { value: 'calendar', label: 'Календар' },
  { value: 'expected-payments', label: 'Очікувані оплати' },
  { value: 'capex', label: 'CAPEX' },
  { value: 'accruals', label: 'Нарахування' },
  { value: 'history', label: 'Історія змін' },
  { value: 'import', label: 'Імпорт' },
  { value: 'reconcile', label: 'Reconcile' },
  { value: 'investors', label: 'Інвестори' },
  { value: 'settings', label: 'Налаштування' },
];

const DEFAULT_ACCESS: FinanceAccess = {
  is_enabled: true,
  period_mode: 'month',
  allowed_tabs: [],
  allowed_accounts: [],
  can_export: false,
  read_only: true,
};

export default function FinanceUserModal({ user, accounts, onClose, onSaved }: Props) {
  const initial = user.access ?? DEFAULT_ACCESS;

  const [isEnabled, setIsEnabled] = useState(initial.is_enabled);
  const [periodMode, setPeriodMode] = useState<'all' | 'month'>(initial.period_mode);
  const [readOnly, setReadOnly] = useState(initial.read_only);
  const [allowedTabs, setAllowedTabs] = useState<string[]>(initial.allowed_tabs);
  const [canExport, setCanExport] = useState(initial.can_export);
  const [allowedAccounts, setAllowedAccounts] = useState<string[]>(initial.allowed_accounts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAccountIds = accounts.map((a) => a.id);
  const allAccountsSelected = allAccountIds.length > 0 && allAccountIds.every((id) => allowedAccounts.includes(id));

  function toggleTab(value: string) {
    setAllowedTabs((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function toggleAccount(id: string) {
    setAllowedAccounts((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }

  function toggleAllAccounts() {
    if (allAccountsSelected) {
      setAllowedAccounts([]);
    } else {
      setAllowedAccounts([...allAccountIds]);
    }
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const body: FinanceAccess = {
        is_enabled: isEnabled,
        period_mode: periodMode,
        allowed_tabs: allowedTabs,
        allowed_accounts: allowedAccounts,
        can_export: canExport,
        read_only: readOnly,
      };
      const res = await fetch(`/api/finance/access/${user.id}`, {
        method: 'PUT',
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

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1 }}>⚙️ Доступ: {user.full_name}</h3>
          <button type="button" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        {/* Toggle: enable access */}
        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            style={checkboxInput}
          />
          <span>Увімкнути доступ до фінансів</span>
        </label>

        <div style={{ opacity: isEnabled ? 1 : 0.4, pointerEvents: isEnabled ? 'auto' : 'none' }}>
          {/* Period mode */}
          <div style={sectionDivider}>📅 Період даних</div>
          <label style={radioRow}>
            <input
              type="radio"
              name="period"
              checked={periodMode === 'month'}
              onChange={() => setPeriodMode('month')}
            />
            <span>Тільки останній місяць</span>
          </label>
          <label style={radioRow}>
            <input
              type="radio"
              name="period"
              checked={periodMode === 'all'}
              onChange={() => setPeriodMode('all')}
            />
            <span>Весь період</span>
          </label>

          {/* Read-only */}
          <label style={{ ...checkboxRow, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              style={checkboxInput}
            />
            <span>Тільки перегляд (без створення/редагування)</span>
          </label>

          {/* Tabs */}
          <div style={sectionDivider}>📊 Доступні вкладки</div>
          <div style={checkboxGrid}>
            {ALL_TABS.map((tab) => (
              <label key={tab.value} style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={allowedTabs.includes(tab.value)}
                  onChange={() => toggleTab(tab.value)}
                  style={checkboxInput}
                />
                <span>{tab.label}</span>
              </label>
            ))}
          </div>

          {/* Export */}
          <label style={{ ...checkboxRow, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={canExport}
              onChange={(e) => setCanExport(e.target.checked)}
              style={checkboxInput}
            />
            <span>Дозволити експорт даних</span>
          </label>

          {/* Accounts */}
          <div style={sectionDivider}>💰 Видимі рахунки</div>
          {accounts.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Немає рахунків. Додайте їх у вкладці «Рахунки».
            </div>
          ) : (
            <>
              <label style={{ ...checkboxRow, fontWeight: 600, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={allAccountsSelected}
                  onChange={toggleAllAccounts}
                  style={checkboxInput}
                />
                <span>Всі рахунки</span>
              </label>
              <div style={checkboxGrid}>
                {accounts.map((acc) => (
                  <label key={acc.id} style={checkboxRow}>
                    <input
                      type="checkbox"
                      checked={allowedAccounts.includes(acc.id)}
                      onChange={() => toggleAccount(acc.id)}
                      style={checkboxInput}
                    />
                    <span>
                      {acc.name}
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginLeft: 4 }}>
                        ({acc.currency})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{error}</div>}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onClose} style={btnSec}>Скасувати</button>
          <button type="button" onClick={handleSave} disabled={saving} style={btnPrim}>
            {saving ? 'Збереження…' : '💾 Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────── */

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const modalStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 580, maxHeight: '92vh', overflowY: 'auto',
  border: '1px solid var(--border-primary)',
};
const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)', padding: 4,
};
const btnPrim: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--accent, #6366f1)', color: '#fff',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
};
const btnSec: React.CSSProperties = {
  padding: '9px 18px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-primary)', borderRadius: 8, cursor: 'pointer',
};
const sectionDivider: React.CSSProperties = {
  marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: 600,
  color: 'var(--text-secondary)', textTransform: 'uppercase',
  paddingTop: 10, borderTop: '1px solid var(--border-primary)',
};
const checkboxRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
  marginBottom: 6, cursor: 'pointer',
};
const radioRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
  marginBottom: 6, cursor: 'pointer',
};
const checkboxInput: React.CSSProperties = {
  margin: 0, flexShrink: 0,
};
const checkboxGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2px 16px',
};
