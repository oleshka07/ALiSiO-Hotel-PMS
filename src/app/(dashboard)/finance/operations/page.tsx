'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Minus, ArrowLeftRight, Settings, Search, Trash2, Copy, Calendar, BarChart3, Wallet, Paperclip, Repeat, Pencil, ArrowUp, ArrowDown, X, History, Filter } from 'lucide-react';
import OperationModal from './_components/OperationModal';
import AdvancedFilterModal from './_components/AdvancedFilterModal';
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
  account_from_currency: string | null;
  account_to_currency: string | null;
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
  balance_after_to?: number | null;
  balance_after_from?: number | null;
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
  const [tags, setTags] = useState<NamedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<OpType | null>(null);
  const [editOp, setEditOp] = useState<Operation | null>(null);

  // Default window: current month. Narrower default = faster initial load.
  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0, 10));
  const [to, setTo] = useState(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10));
  const [filterType, setFilterType] = useState<OpType | ''>('');
  const [search, setSearch] = useState('');
  // Debounced search: actual API query only fires after 300ms idle.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);
  // Multi-select account filter — toggled from the sidebar by clicking
  // an account row. Empty set = no filter. Not persisted; resets on
  // reload so the operator gets the full view back by default.
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [filterCategoryIds, setFilterCategoryIds] = useState<Set<string>>(new Set());
  const [filterCounterpartyIds, setFilterCounterpartyIds] = useState<Set<string>>(new Set());
  const [filterProjectIds, setFilterProjectIds] = useState<Set<string>>(new Set());
  const [filterTagIds, setFilterTagIds] = useState<Set<string>>(new Set());
  const [filterOpTypes, setFilterOpTypes] = useState<Set<string>>(new Set());
  
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  
  // Temporary client-side sort. Click a column header to toggle:
  // none → asc → desc → none. Resets on reload.
  const [sortKey, setSortKey] = useState<'paid_at' | 'amount' | 'account' | 'counterparty' | 'category' | 'project' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // History modal: holds the id of the operation whose audit trail is open.
  const [historyOpId, setHistoryOpId] = useState<string | null>(null);
  const [attachCounts, setAttachCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);

  const [selectedOpsForMerge, setSelectedOpsForMerge] = useState<Set<string>>(new Set());
  const [isMerging, setIsMerging] = useState(false);

  const handleMerge = async () => {
    if (selectedOpsForMerge.size !== 2) return;
    setIsMerging(true);
    try {
      const res = await fetch('/api/finance/operations/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedOpsForMerge) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to merge');
      setSelectedOpsForMerge(new Set());
      await fetchOps();
    } catch (err: any) {
      alert("Помилка об'єднання: " + err.message);
    } finally {
      setIsMerging(false);
    }
  };

  const toggleMergeSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedOpsForMerge);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedOpsForMerge(newSet);
  };

  const fetchOps = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to, pageSize: '5000' });
    if (filterType) params.set('op_type', filterType);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (selectedAccountIds.size > 0) params.set('account_id', [...selectedAccountIds].join(','));
    if (filterCategoryIds.size > 0) params.set('category_id', [...filterCategoryIds].join(','));
    if (filterCounterpartyIds.size > 0) params.set('counterparty_id', [...filterCounterpartyIds].join(','));
    if (filterProjectIds.size > 0) params.set('project_id', [...filterProjectIds].join(','));
    if (filterTagIds.size > 0) params.set('tag_id', [...filterTagIds].join(','));
    if (filterOpTypes.size > 0) params.set('op_type', [...filterOpTypes].join(','));
    
    try {
      const res = await fetch(`/api/finance/operations?${params}`);
      const json = await res.json();
      const items: Operation[] = json.items || [];
      setOps(items);
      setTotal(json.total || items.length);
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
  }, [from, to, filterType, debouncedSearch, selectedAccountIds, filterCategoryIds, filterCounterpartyIds, filterProjectIds, filterTagIds, filterOpTypes]);

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
      const [cats, projs, cps, tgs] = await Promise.all([
        fetch('/api/finance/categories').then((r) => r.json()).catch(() => []),
        fetch('/api/finance/projects').then((r) => r.json()).catch(() => []),
        fetch('/api/finance/counterparties').then((r) => r.json()).catch(() => []),
        fetch('/api/finance/tags').then((r) => r.json()).catch(() => []),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setCounterparties(Array.isArray(cps) ? cps : []);
      setTags(Array.isArray(tgs) ? tgs : []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchOps(); }, [fetchOps]);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // PATCH a single field on the operation (used by inline pickers).
  // Updates the local row optimistically; only re-fetches on failure.
  async function patchOperation(opId: string, patch: Partial<Operation> & { category_id?: string | null; project_id?: string | null; counterparty_id?: string | null }) {
    // Optimistic: enrich with display names from lookup data
    const enriched: Record<string, any> = { ...patch };
    if ('category_id' in patch) {
      const cat = categories.find((c) => c.id === patch.category_id);
      enriched.category_name = cat?.name || null;
      enriched.category_icon = cat?.icon || null;
    }
    if ('project_id' in patch) {
      enriched.project_name = projects.find((p) => p.id === patch.project_id)?.name || null;
    }
    if ('counterparty_id' in patch) {
      enriched.counterparty_name = counterparties.find((c) => c.id === patch.counterparty_id)?.name || null;
    }
    setOps((prev) => prev.map((o) => (o.id === opId ? { ...o, ...enriched } as Operation : o)));
    try {
      const res = await fetch(`/api/finance/operations/${opId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('PATCH failed');
      // No full re-fetch — optimistic update is sufficient for inline fields
    } catch (e) {
      console.error('inline patch error', e);
      fetchOps(); // re-fetch only on failure to restore correct state
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

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clickSort(key: NonNullable<typeof sortKey>) {
    // Cycle: nothing | other → asc → desc → off
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); return; }
    if (sortDir === 'asc') { setSortDir('desc'); return; }
    setSortKey(null);
  }

  function sortValue(o: Operation, key: NonNullable<typeof sortKey>): string | number {
    switch (key) {
      case 'paid_at':      return o.paid_at;
      case 'amount':       return o.amount;
      case 'account':      return (o.account_from_name || o.account_to_name || '').toLowerCase();
      case 'counterparty': return (o.counterparty_name || '').toLowerCase();
      case 'category':     return (o.category_name || '').toLowerCase();
      case 'project':      return (o.project_name || '').toLowerCase();
    }
  }

  const displayedOps = sortKey
    ? [...ops].sort((a, b) => {
        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        // Empty strings always sink to bottom so they're easy to triage
        // when the operator sorts «по категорії» to fill missing ones.
        const aEmpty = va === '' || va == null;
        const bEmpty = vb === '' || vb == null;
        if (aEmpty && !bEmpty) return 1;
        if (!aEmpty && bEmpty) return -1;
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ?  1 : -1;
        return 0;
      })
    : ops;

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
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Мої рахунки</div>
            {selectedAccountIds.size > 0 && (
              <button onClick={() => setSelectedAccountIds(new Set())}
                      style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer', padding: 0 }}
                      title="Скинути фільтр по рахунках">
                <X size={11} /> Скинути ({selectedAccountIds.size})
              </button>
            )}
          </div>
          {accounts.map((a) => {
            const active = selectedAccountIds.has(a.id);
            return (
              <button key={a.id} onClick={() => toggleAccount(a.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', padding: '6px 8px', fontSize: 13,
                        background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                        border: active ? '1px solid #6366f1' : '1px solid transparent',
                        borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)',
                        marginBottom: 2, textAlign: 'left',
                      }}
                      title={active ? 'Зняти фільтр' : 'Фільтрувати по цьому рахунку (можна обрати кілька)'}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: a.color, marginRight: 6, verticalAlign: 'middle' }} />{a.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatMoney(a.balance, a.currency)}</span>
              </button>
            );
          })}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* Filters + summary */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
            <span style={{ color: 'var(--text-secondary)' }}>—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
            
            <button 
              type="button"
              onClick={() => {
                console.log('Filter button clicked!');
                setFilterModalOpen(true);
              }}
              style={{ ...btn, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <Filter size={14} /> Фільтр
              {(filterCategoryIds.size + filterCounterpartyIds.size + filterProjectIds.size + filterTagIds.size + filterOpTypes.size + selectedAccountIds.size) > 0 && (
                <span style={{ background: '#34d399', color: '#064e3b', padding: '0 6px', borderRadius: 10, fontSize: 11, marginLeft: 4 }}>
                  {filterCategoryIds.size + filterCounterpartyIds.size + filterProjectIds.size + filterTagIds.size + filterOpTypes.size + selectedAccountIds.size}
                </span>
              )}
            </button>
            
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Пошук по сумі, коментарях, рахунках, проєктах..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...input, paddingLeft: 30, width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <span style={{ color: '#22c55e' }}>Доходи: <b>{formatMoney(totalIncome, 'CZK')}</b></span>
            <span style={{ color: '#ef4444' }}>Витрати: <b>{formatMoney(totalExpense, 'CZK')}</b></span>
            <span style={{ fontWeight: 600, marginLeft: 'auto' }}>
              Чистий потік: <b style={{ color: netTotal >= 0 ? '#22c55e' : '#ef4444' }}>{formatMoney(netTotal, 'CZK')}</b>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Операцій: {ops.length}{total > ops.length && <b style={{ color: '#f59e0b' }}> з {total}</b>}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
          ) : ops.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 10 }}>
              Операцій не знайдено.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
              {selectedOpsForMerge.size === 2 && (
                <div style={{ padding: 12, background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, color: '#4f46e5' }}>Вибрано 2 операції для об'єднання.</span>
                  <button 
                    onClick={handleMerge}
                    disabled={isMerging}
                    style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 500, cursor: isMerging ? 'not-allowed' : 'pointer', opacity: isMerging ? 0.7 : 1 }}
                  >
                    {isMerging ? "Об'єднання..." : "З'єднати в переміщення"}
                  </button>
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ ...th, width: 30, textAlign: 'center' }}></th>
                    <SortableTh label="Дата" sortKey="paid_at" currentKey={sortKey} dir={sortDir} onClick={clickSort} />
                    <SortableTh label="Сума" sortKey="amount" currentKey={sortKey} dir={sortDir} onClick={clickSort} align="right" />
                    <SortableTh label="Рахунок / залишок" sortKey="account" currentKey={sortKey} dir={sortDir} onClick={clickSort} />
                    <SortableTh label="Контрагент" sortKey="counterparty" currentKey={sortKey} dir={sortDir} onClick={clickSort} />
                    <SortableTh label="Категорія" sortKey="category" currentKey={sortKey} dir={sortDir} onClick={clickSort} />
                    <SortableTh label="Проєкт" sortKey="project" currentKey={sortKey} dir={sortDir} onClick={clickSort} />
                    <th style={th}>Коментар</th>
                    <th style={{ ...th, width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedOps.map((o) => {
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
                    const isSelected = selectedOpsForMerge.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        onClick={openModal}
                        style={{ borderTop: '1px solid var(--border-primary)', cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent' }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ ...td, textAlign: 'center' }} onClick={(e) => toggleMergeSelect(o.id, e)}>
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => {}} 
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={td}>{o.paid_at?.substring(0, 10)}</td>
                        <td style={{ ...td, textAlign: 'right', color: amountColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {sign} {Math.abs(o.amount).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {o.currency}
                        </td>
                        <td style={td}>
                          {isTransfer ? (
                            <>
                              <div>{o.account_from_name} → {o.account_to_name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                                {o.balance_after_from != null && <span>{formatMoney(o.balance_after_from, o.account_from_currency || o.currency)}</span>}
                                {o.balance_after_from != null && o.balance_after_to != null && <span> → </span>}
                                {o.balance_after_to != null && <span>{formatMoney(o.balance_after_to, o.account_to_currency || o.currency)}</span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <div>{o.account_from_name || o.account_to_name || '—'}</div>
                              {(o.balance_after_to != null || o.balance_after_from != null) && (
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                                  {formatMoney(
                                    (o.balance_after_to ?? o.balance_after_from)!,
                                    (o.balance_after_to != null ? o.account_to_currency : o.account_from_currency) || o.currency
                                  )}
                                </div>
                              )}
                            </>
                          )}
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
                          <button onClick={() => setHistoryOpId(o.id)} style={iconBtn} title="Історія змін (хто створив / редагував)"><History size={14} /></button>
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

      {historyOpId && (
        <AuditHistoryModal operationId={historyOpId} onClose={() => setHistoryOpId(null)} />
      )}

      <AdvancedFilterModal 
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        categories={categories}
        counterparties={counterparties}
        projects={projects}
        tags={tags}
        accounts={accounts}
        initialCategoryIds={filterCategoryIds}
        initialCounterpartyIds={filterCounterpartyIds}
        initialProjectIds={filterProjectIds}
        initialTagIds={filterTagIds}
        initialAccountIds={selectedAccountIds}
        initialOpTypes={filterOpTypes}
        onApply={(catIds, cpIds, projIds, tIds, accIds, opTypes) => {
          setFilterCategoryIds(catIds);
          setFilterCounterpartyIds(cpIds);
          setFilterProjectIds(projIds);
          setFilterTagIds(tIds);
          setSelectedAccountIds(accIds);
          setFilterOpTypes(opTypes);
        }}
      />
    </div>
  );
}

type SortKey = 'paid_at' | 'amount' | 'account' | 'counterparty' | 'category' | 'project';

function SortableTh({ label, sortKey, currentKey, dir, onClick, align }: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = currentKey === sortKey;
  return (
    <th style={{ ...th, textAlign: align || 'left', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => onClick(sortKey)}
        title={active ? `Сортовано ${dir === 'asc' ? '↑' : '↓'} — клік щоб ${dir === 'asc' ? 'обернути' : 'скинути'}` : 'Клік щоб сортувати'}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );
}

interface AuditEntry {
  id: string;
  operation_id: string;
  action: 'create' | 'update' | 'delete' | 'convert';
  user_id: string | null;
  user_name: string | null;
  before_json: string | null;
  after_json: string | null;
  performed_at: string;
}

// Fields we care to surface when computing the «what changed» summary
// between before_json and after_json. Internal/computed fields like
// `amount_company` or `updated_at` are intentionally hidden.
const AUDIT_TRACK_FIELDS = [
  'op_type', 'amount', 'currency', 'paid_at', 'accrued_at',
  'account_from_id', 'account_to_id',
  'category_id', 'project_id', 'counterparty_id',
  'comment', 'status', 'method', 'payment_subtype', 'reservation_id',
] as const;

function AuditHistoryModal({ operationId, onClose }: { operationId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/finance/operations/${operationId}/audit`)
      .then((r) => r.json())
      .then((j) => { if (alive) { setEntries(j.items || []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [operationId]);

  function diffSummary(beforeJson: string | null, afterJson: string | null): string[] {
    try {
      const before = beforeJson ? JSON.parse(beforeJson) : null;
      const after = afterJson ? JSON.parse(afterJson) : null;
      const out: string[] = [];
      for (const key of AUDIT_TRACK_FIELDS) {
        const b = before?.[key];
        const a = after?.[key];
        if (b !== a) {
          const fmt = (v: any) => (v == null || v === '' ? '∅' : String(v));
          out.push(`${key}: ${fmt(b)} → ${fmt(a)}`);
        }
      }
      return out;
    } catch { return []; }
  }

  const actionMeta: Record<AuditEntry['action'], { label: string; color: string; bg: string }> = {
    create:  { label: 'Створено',  color: '#16a34a', bg: 'rgba(34,197,94,0.10)' },
    update:  { label: 'Редаговано', color: '#3b82f6', bg: 'rgba(59,130,246,0.10)' },
    convert: { label: 'Конвертовано', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
    delete:  { label: 'Видалено',  color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 540, maxWidth: 720, maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} /> Історія змін
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, fontFamily: 'monospace' }}>op: {operationId}</div>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
            Історії немає. Цю операцію створили до того як ввімкнули аудит (W4a).
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map((e) => {
              const meta = actionMeta[e.action];
              const changes = e.action === 'update' || e.action === 'convert' ? diffSummary(e.before_json, e.after_json) : [];
              const isSystem = !e.user_id;
              return (
                <div key={e.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg, textTransform: 'uppercase' }}>
                      {meta.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {isSystem ? <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>System</span> : e.user_name}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {new Date(e.performed_at).toLocaleString('cs-CZ')}
                    </span>
                  </div>
                  {(e.action === 'update' || e.action === 'convert') && (
                    changes.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>(зміни поза tracked fields)</div>
                    ) : (
                      <ul style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                        {changes.map((c, i) => <li key={i} style={{ fontFamily: 'monospace' }}>{c}</li>)}
                      </ul>
                    )
                  )}
                  {(e.action === 'create' || e.action === 'delete') && (
                    <details style={{ fontSize: 11, marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Повний snapshot</summary>
                      <pre style={{ fontFamily: 'monospace', fontSize: 10, background: 'var(--bg-secondary)', padding: 8, borderRadius: 4, marginTop: 6, overflow: 'auto', maxHeight: 260 }}>
                        {(() => {
                          const raw = e.action === 'create' ? e.after_json : e.before_json;
                          try { return JSON.stringify(JSON.parse(raw || '{}'), null, 2); } catch { return raw || ''; }
                        })()}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
