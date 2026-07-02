'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw, TrendingUp, TrendingDown, Wallet,
  Receipt, BarChart3, FileText, ArrowRight, Plus, Minus, ArrowLeftRight,
} from 'lucide-react';

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  color: string;
  balance: number;
}

interface KPI {
  revenue: number;
  expenses: number;
  ebitda: number;
  margin: number;
  expectedPayments: number;
}

interface Transaction {
  tx_type: string;
  id: string;
  date: string;
  amount_raw: number;
  currency: string;
  account_name: string | null;
  counterparty: string | null;
  category: string | null;
  notes: string | null;
}

const TX_COLORS: Record<string, string> = {
  income: '#22c55e',
  expense: '#ef4444',
  payment: '#22c55e',
  transfer: '#8b5cf6',
};

const TX_LABELS: Record<string, string> = {
  income: 'Дохід',
  expense: 'Витрата',
  payment: 'Оплата',
  transfer: 'Переказ',
};

function fmt(n: number) {
  return `${Math.round(Math.abs(n)).toLocaleString('cs-CZ')} Kč`;
}

export default function MobileFinanceOverview() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const month = new Date().toISOString().substring(0, 7);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, kpiRes, txRes] = await Promise.all([
        fetch('/api/finance/accounts'),
        fetch(`/api/finance/overview?month=${month}`),
        fetch(`/api/finance/log?month=${month}&limit=10`),
      ]);
      if (accRes.ok) setAccounts(await accRes.json());
      if (kpiRes.ok) { const d = await kpiRes.json(); setKpi(d.kpi || null); }
      if (txRes.ok) { const d = await txRes.json(); setRecentTx(d.transactions || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div>
      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button onClick={fetchAll} disabled={loading} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} />
        </button>
      </div>

      {/* Total balance */}
      <div style={{ background: 'linear-gradient(135deg, #14b8a6, #3b82f6)', borderRadius: 18, padding: '20px 18px', marginBottom: 14, color: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Загальний баланс
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
          {Math.round(totalBalance).toLocaleString('cs-CZ')} Kč
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          {accounts.length} рахунків
        </div>
      </div>

      {/* Account pills */}
      {accounts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 8, scrollbarWidth: 'none' }}>
          {accounts.map(a => (
            <div key={a.id} style={{
              flexShrink: 0, background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
              borderRadius: 12, padding: '10px 14px', minWidth: 120,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color }} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{a.name}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: a.balance >= 0 ? 'var(--text-primary)' : '#ef4444' }}>
                {Math.round(a.balance).toLocaleString('cs-CZ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI grid for current month */}
      {kpi && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 8px' }}>
            {month} — підсумок
          </div>
          <div className="m-kpi-grid" style={{ marginBottom: 14 }}>
            <div className="m-kpi-card">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <TrendingUp size={18} color="#22c55e" />
              </div>
              <div className="m-kpi-value" style={{ color: '#22c55e', fontSize: 20 }}>{fmt(kpi.revenue)}</div>
              <div className="m-kpi-label">Дохід</div>
            </div>
            <div className="m-kpi-card">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <TrendingDown size={18} color="#ef4444" />
              </div>
              <div className="m-kpi-value" style={{ color: '#ef4444', fontSize: 20 }}>{fmt(kpi.expenses)}</div>
              <div className="m-kpi-label">Витрати</div>
            </div>
            <div className="m-kpi-card">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <BarChart3 size={18} color={kpi.ebitda >= 0 ? '#22c55e' : '#ef4444'} />
              </div>
              <div className="m-kpi-value" style={{ color: kpi.ebitda >= 0 ? '#22c55e' : '#ef4444', fontSize: 20 }}>
                {fmt(kpi.ebitda)}
              </div>
              <div className="m-kpi-label">EBITDA</div>
            </div>
            <div className="m-kpi-card">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <Wallet size={18} color="#8b5cf6" />
              </div>
              <div className="m-kpi-value" style={{ color: '#8b5cf6', fontSize: 20 }}>{kpi.margin}%</div>
              <div className="m-kpi-label">Маржа</div>
            </div>
          </div>
        </>
      )}

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <Link href="/finance/operations" style={{ textDecoration: 'none' }}>
          <div style={{ background: 'rgba(99,102,241,0.12)', borderRadius: 14, padding: '12px 8px', textAlign: 'center', cursor: 'pointer' }}>
            <FileText size={20} color="#6366f1" style={{ marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1' }}>Журнал</div>
          </div>
        </Link>
        <Link href="/finance/expenses" style={{ textDecoration: 'none' }}>
          <div style={{ background: 'rgba(239,68,68,0.10)', borderRadius: 14, padding: '12px 8px', textAlign: 'center', cursor: 'pointer' }}>
            <Receipt size={20} color="#ef4444" style={{ marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Витрати</div>
          </div>
        </Link>
        <Link href="/finance/cashflow" style={{ textDecoration: 'none' }}>
          <div style={{ background: 'rgba(20,184,166,0.12)', borderRadius: 14, padding: '12px 8px', textAlign: 'center', cursor: 'pointer' }}>
            <BarChart3 size={20} color="#14b8a6" style={{ marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#14b8a6' }}>Cash Flow</div>
          </div>
        </Link>
      </div>

      {/* Recent transactions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Останні транзакції
        </div>
        <Link href="/finance/operations" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
          Всі <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} className="m-skeleton" style={{ height: 56, borderRadius: 12 }} />)}
        </div>
      ) : recentTx.length === 0 ? (
        <div className="m-empty" style={{ padding: 24 }}>
          <div className="m-empty-icon">💳</div>
          <div>Немає транзакцій за цей місяць</div>
        </div>
      ) : (
        recentTx.map(tx => {
          const isPos = tx.amount_raw >= 0;
          return (
            <div key={`${tx.tx_type}-${tx.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12, marginBottom: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `${TX_COLORS[tx.tx_type]}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tx.tx_type === 'income' || tx.tx_type === 'payment' ? <Plus size={16} color={TX_COLORS[tx.tx_type]} /> :
                  tx.tx_type === 'transfer' ? <ArrowLeftRight size={16} color={TX_COLORS[tx.tx_type]} /> :
                  <Minus size={16} color={TX_COLORS[tx.tx_type]} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tx.notes || tx.counterparty || TX_LABELS[tx.tx_type]}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {tx.date?.split('T')[0]} · {tx.category || TX_LABELS[tx.tx_type]}
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: isPos ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }}>
                {isPos ? '+' : '−'}{Math.abs(Math.round(tx.amount_raw)).toLocaleString('cs-CZ')}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
