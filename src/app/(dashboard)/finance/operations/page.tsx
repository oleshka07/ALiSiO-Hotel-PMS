'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Minus, ArrowLeftRight, Settings, Search, Trash2, Copy, Calendar, BarChart3, Wallet, Paperclip, Repeat, Pencil } from 'lucide-react';
import OperationModal from './_components/OperationModal';
import InlinePicker, { type InlinePickerOption } from './_components/InlinePicker';
import ExportButton from '../_components/ExportButton';

type OpType = 'income' | 'expense' | 'transfer';

interface Operation {
  id: string;
  op_type: OpType;
  paid_at: string;
  amount: number;
  currency: string;
  account_from_id: string | null;
  account_to_id: string | null;
  account_from_name: string | null;
  account_to_name: string | null;
  account_from_color: string | null;
  account_to_color: string | null;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  project_id: string | null;
  project_name: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  comment: string | null;
  status: string;
  source: string;
  reservation_id: string | null;
  tags: string[];
  suggested_recurring_id: string | null;
  suggested_recurring_name: string | null;
}

interface Account { id: string; name: string; color: string; balance: number; currency: string }
interface CategoryRow { id: string; name: string; icon: string | null; op_type: string | null }
interface NamedRow { id: string; name: string }

function formatMoney(n: number, currency: string): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export default function OperationsPage() {
  const [ops, setOps] = useState<Operation[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [projects, setProjects] = useState<NamedRow[]>([]);
  const [counterparties, setCounterparties] = useState<NamedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<OpType | null>(null);
  const [editOp, setEditOp] = useState<Operation | null>(null);

  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().substring(0, 10));
  const [to, setTo] = useState(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10));
  const [filterType, setFilterType] = useState<OpType | ''>('');
  const [search, setSearch] = useState('');
  // «Legacy markers» mode: surface manual non-cash ops that pre-date the
  // POST /api/payments fix (PR #19). Helps the operator find and delete
  // them so they don't double-count once the real Teya / bank txn arrives.
  const [legacyMarkers, setLegacyMarkers] = useState(false);
  const [attachCounts, setAttachCounts] = useState<Record<string, number>>({});

  const fetchOps = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to, pageSize: '500' });
    if (filterType) params.set('op_type', filterType);
    if (search.trim()) params.set('search', search.trim());
    if (legacyMarkers) {
      params.set('source', 'manual');
      params.set('method', 'card,bank_transfer,booking_platform,invoice,online');
    }
    try {
      const res = await fetch(`/api/finance/operations?${params}`);
      const json = await res.json();
      const items: Operation[] = json.items || [];
      setOps(items);
      // Bulk-fetch attachment counts for visible ops (📎 badge)
      if (items.length > 0) {
        const ids = items.map((o) => o.id).join(',');
        try {
          const ar = await fetch(`/api/finance/operations/attachment-counts?ids=${ids}`);
          const aj = await ar.json();
          setAttachCounts(aj.counts || {});
        } catch { setAttachCounts({}); }
      } else {
        setAttachCounts({});
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [from, to, filterType, search, legacyMarkers]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/accounts');
      const json = await res.json();
      setAccounts(Array.isArray(json) ? json : []);
    } catch (e) { console.error(e); }
  }, []);

  // Lookup lists for inline pickers — fetched once per visit, not per row.
  const fetchLookups = useCallback(async () => {
    try {
      const [cats, projs, cps] = await Promise.all([
        fetch('/api/finance/categories').then((r) => r.json()).catch(() => []),
        fetch('/api/finance/projects').then((r) => r.json()).catch(() => []),
        fetch('/api/finance/counterparties').then((r) => r.json()).catch(() => []),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setCounterparties(Array.isArray(cps) ? cps : []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchOps(); }, [fetchOps]);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // PATCH a single field on the operation (used by inline pickers).
  // Updates the local row optimistically + refetches on failure.
  async function patchOperation(opId: string, patch: Partial<Operation> & { category_id?: string | null; project_id?: string | null; counterparty_id?: string | null }) {
    setOps((prev) => prev.map((o) => (o.id === opId ? { ...o, ...patch } as Operation : o)));
    try {
      const res = await fetch(`/api/finance/operations/${opId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('PATCH failed');
      // Refetch in background to pull joined names back from the server.
      fetchOps();
    } catch (e) {
      console.error('inline patch error', e);
      fetchOps();
    }
  }

  async function handleDelete(op: Operation) {
    if (!confirm(`Видалити операцію на ${formatMoney(op.amount, op.currency)}?`)) return;
    const res = await fetch(`/api/finance/operations/${op.id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Не вдалося видалити'); return; }
    fetchOps(); fetchAccounts();
  }

  async function handleDuplicate(op: Operation) {
    const res = await fetch(`/api/finance/operations/${op.id}/duplicate`, { method: 'POST' });
    if (!res.ok) { alert('Не вдалося дублювати'); return; }
    fetchOps(); fetchAccounts();
  }

  const totalIncome = ops.filter((o) => o.op_type === 'income').reduce((s, o) => s + o.amount, 0);
  const totalExpense = ops.filter((o) => o.op_type === 'expense').reduce((s, o) => s + o.amount, 0);
  const netTotal = totalIncome - totalExpense;
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="page-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, flex: 1 }}>💰 Операції</h1>

        <button onClick={() => { setEditOp(null); setModalType('income'); }} style={{ ...btn, background: '#22c55e' }}>
          <Plus size={16} /> Дохід
        </button>
        <button onClick={() => { setEditOp(null); setModalType('expense'); }} style={{ ...btn, background: '#ef4444' }}>
          <Minus size={16} /> Витрата
        </button>
        <button onClick={() => { setEditOp(null); setModalType('transfer'); }} style={{ ...btn, background: '#6366f1' }}>
          <ArrowLeftRight size={16} /> Переказ
        </button>

        <ExportButton
          endpoint="/api/finance/export/operations"
          params={{ from, to, op_type: filterType, search: search.trim() }}
        />

        <Link href="/finance/clearing" style={{ ...btn, background: 'var(--bg-secondary)', color: 'var(--text-primary)', textDecoration: 'none' }}>
          <Wallet size={16} /> Clearing
        </Link>
        <Link href="/finance/reports" style={{ ...btn, background: 'var(--bg-secondary)', color: 'var(--text-primary)', textDecoration: 'none' }}>
          <BarChart3 size={16} /> Звіти
        </Link>
        <Link href="/finance/calendar" style={{ ...btn, background: 'var(--bg-secondary)', color: 'var(--text-primary)', textDecoration: 'none' }}>
          <Calendar size={16} /> Календар
        </Link>
        <Link href="/finance/settings" style={{ ...btn, background: 'var(--bg-secondary)', color: 'var(--text-primary)', textDecoration: 'none' }}>
          <Settings size={16} /> Налаштування
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 16 }}>
        {/* Accounts sidebar */}
        <aside style={{ minWidth: 240, background: 'var(--bg-secondary)', padding: 16, borderRadius: 10, border: '1px solid var(--border-primary)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Всього на рахунках</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{formatMoney(totalBalance, 'CZK')}</div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-primary)', margin: '16px 0' }} />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>Мої рахунки</div>
          {accounts.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: a.color, marginRight: 6, verticalAlign: 'middle' }} />{a.name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatMoney(a.balance, a.currency)}</span>
            </div>
          ))}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* Filters + summary */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
            <span style={{ color: 'var(--text-secondary)' }}>—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as OpType | '')} style={input}>
              <option value="">Усі типи</option>
              <option value="income">Доходи</option>
              <option value="expense">Витрати</option>
              <option value="transfer">Перекази</option>
            </select>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Пошук у коментарях..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...input, paddingLeft: 30, width: '100%' }}
              />
            </div>
            <label
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13,
                background: legacyMarkers ? 'rgba(245,158,11,0.12)' : 'var(--bg-primary)',
                color: legacyMarkers ? '#92400e' : 'var(--text-primary)', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Знайти manual ops методу card / bank / platform / invoice / online — це legacy записи з PMS, які тепер не повинні створюватись. Видали їх щоб уникнути подвоєння з реальною Teya/банк транзакцією."
            >
              <input
                type="checkbox"
                checked={legacyMarkers}
                onChange={(e) => setLegacyMarkers(e.target.checked)}
                style={{ margin: 0 }}
              />
              ⚠️ Legacy markers
            </label>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <span style={{ color: '#22c55e' }}>Доходи: <b>{formatMoney(totalIncome, 'CZK')}</b></span>
            <span style={{ color: '#ef4444' }}>Витрати: <b>{formatMoney(totalExpense, 'CZK')}</b></span>
            <span style={{ fontWeight: 600, marginLeft: 'auto' }}>
              Чистий потік: <b style={{ color: netTotal >= 0 ? '#22c55e' : '#ef4444' }}>{formatMoney(netTotal, 'CZK')}</b>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>Операцій: {ops.length}</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
          ) : ops.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 10 }}>
              Операцій не знайдено.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={th}>Дата</th>
                    <th style={{ ...th, textAlign: 'right' }}>Сума</th>
                    <th style={th}>Рахунок</th>
                    <th style={th}>Контрагент</th>
                    <th style={th}>Категорія</th>
                    <th style={th}>Проєкт</th>
                    <th style={th}>Коментар</th>
                    <th style={{ ...th, width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map((o) => {
                    const isExpense = o.op_type === 'expense';
                    const isTransfer = o.op_type === 'transfer';
                    const amountColor = isTransfer ? 'var(--text-secondary)' : isExpense ? '#ef4444' : '#22c55e';
                    const sign = isTransfer ? '⇄' : isExpense ? '−' : '+';
                    const openModal = () => { setEditOp(o); setModalType(o.op_type); };
                    // Categories filtered by op_type so an income row only sees
                    // income categories, etc. Transfers don't take a category.
                    const categoryOptions: InlinePickerOption[] = isTransfer
                      ? []
                      : categories
                          .filter((c) => !c.op_type || c.op_type === o.op_type)
                          .map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
                    const projectOptions: InlinePickerOption[] = projects.map((p) => ({ id: p.id, name: p.name }));
                    const counterpartyOptions: InlinePickerOption[] = counterparties.map((c) => ({ id: c.id, name: c.name }));
                    return (
                      <tr
                        key={o.id}
                        onClick={openModal}
                        style={{ borderTop: '1px solid var(--border-primary)', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={td}>{o.paid_at?.substring(0, 10)}</td>
                        <td style={{ ...td, textAlign: 'right', color: amountColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {sign} {Math.abs(o.amount).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {o.currency}
                        </td>
                        <td style={td}>
                          {isTransfer ? `${o.account_from_name} → ${o.account_to_name}` : (o.account_from_name || o.account_to_name || '—')}
                        </td>
                        <td style={td}>
                          <InlinePicker
                            value={o.counterparty_id}
                            displayName={o.counterparty_name}
                            options={counterpartyOptions}
                            onPick={(id) => patchOperation(o.id, { counterparty_id: id })}
                            onClear={() => patchOperation(o.id, { counterparty_id: null })}
                          />
                        </td>
                        <td style={td}>
                          {isTransfer ? (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          ) : (
                            <InlinePicker
                              value={o.category_id}
                              displayName={o.category_name}
                              displayIcon={o.category_icon}
                              options={categoryOptions}
                              onPick={(id) => patchOperation(o.id, { category_id: id })}
                              onClear={() => patchOperation(o.id, { category_id: null })}
                            />
                          )}
                        </td>
                        <td style={td}>
                          <InlinePicker
                            value={o.project_id}
                            displayName={o.project_name}
                            options={projectOptions}
                            onPick={(id) => patchOperation(o.id, { project_id: id })}
                            onClear={() => patchOperation(o.id, { project_id: null })}
                          />
                        </td>
                        <td style={{ ...td, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.comment || undefined}>
                          {o.comment || <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                          {o.tags.length > 0 && (
                            <span style={{ marginLeft: 6 }}>
                              {o.tags.map((t) => (
                                <span key={t} style={{ fontSize: 10, padding: '1px 5px', marginRight: 3, background: 'var(--bg-secondary)', borderRadius: 3 }}>{t}</span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          {o.suggested_recurring_id && (
                            <span
                              onClick={openModal}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 2,
                                padding: '1px 5px', marginRight: 4, borderRadius: 4,
                                background: 'rgba(34,197,94,0.12)', color: '#16a34a',
                                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                              }}
                              title={`Виглядає як ${o.suggested_recurring_name}. Клік щоб підтвердити.`}
                            >
                              <Repeat size={10} /> {o.suggested_recurring_name}
                            </span>
                          )}
                          {attachCounts[o.id] > 0 && (
                            <span
                              onClick={openModal}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 2,
                                padding: '1px 5px', marginRight: 4, borderRadius: 4,
                                background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                              }}
                              title={`${attachCounts[o.id]} прикріплених документ(ів)`}
                            >
                              <Paperclip size={10} /> {attachCounts[o.id]}
                            </span>
                          )}
                          <button onClick={openModal} style={iconBtn} title="Редагувати"><Pencil size={14} /></button>
                          <button onClick={() => handleDuplicate(o)} style={iconBtn} title="Дублювати"><Copy size={14} /></button>
                          <button onClick={() => handleDelete(o)} style={{ ...iconBtn, color: '#dc2626' }} title="Видалити"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {modalType && (
        <OperationModal
          opType={modalType}
          initial={editOp || undefined}
          accounts={accounts}
          onClose={() => { setModalType(null); setEditOp(null); }}
          onSaved={() => { setModalType(null); setEditOp(null); fetchOps(); fetchAccounts(); }}
        />
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontWeight: 600, fontSize: 13,
};
const input: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border-primary)',
  borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 12,
  color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)',
};
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 5, margin: '0 1px',
  cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 6,
};
