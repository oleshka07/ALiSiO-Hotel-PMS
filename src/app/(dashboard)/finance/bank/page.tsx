'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Check, X as XIcon } from 'lucide-react';

interface Category { id: string; name: string; icon: string; color: string; }
interface BU { id: string; name: string; }

interface Statement {
  id: string; file_name: string; bank_name: string; total_transactions: number;
  matched_transactions: number; status: string; uploaded_at: string; period_from: string; period_to: string;
}

interface BankTransaction {
  id: string; transaction_date: string; amount: number; counterparty: string; description: string;
  reference: string; match_status: string; confidence: number;
  matched_category_id: string; matched_business_unit_id: string;
  category_name: string; category_icon: string; bu_name: string;
}

function formatCZK(n: number): string { return `${Math.round(n).toLocaleString('cs-CZ')} CZK`; }

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  unmatched: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '❌ Не відповідає' },
  auto_matched: { bg: 'rgba(234,179,8,0.15)', color: '#eab308', label: '🤖 Авто' },
  manual: { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: '✋ Ручне' },
  confirmed: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: '✅ Підтверджено' },
  ignored: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: '⊘ Ігнор' },
};

export default function BankPage() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bus, setBus] = useState<BU[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatement, setSelectedStatement] = useState<string>('');
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  const fetchStatements = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/bank/statements');
      setStatements(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchTransactions = useCallback(async (stmtId: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (stmtId) params.set('statement_id', stmtId);
    if (filterStatus) params.set('match_status', filterStatus);
    try {
      const [res, catRes, buRes] = await Promise.all([
        fetch(`/api/finance/bank/transactions?${params}`),
        fetch('/api/finance/expense-categories'),
        fetch('/api/finance/business-units'),
      ]);
      setTransactions(await res.json());
      setCategories(await catRes.json());
      setBus(await buRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchStatements(); }, [fetchStatements]);
  useEffect(() => {
    fetchTransactions(selectedStatement);
  }, [selectedStatement, fetchTransactions]);

  // Parse CSV text and import
  const handleImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    try {
      const lines = csvText.trim().split('\n');
      // Detect separator
      const sep = lines[0].includes(';') ? ';' : ',';
      const header = lines[0].split(sep).map(h => h.trim().replace(/"/g, '').toLowerCase());
      
      // Map header columns
      const dateIdx = header.findIndex(h => h.includes('date') || h.includes('datum') || h.includes('дата'));
      const amountIdx = header.findIndex(h => h.includes('amount') || h.includes('castka') || h.includes('částka') || h.includes('сума'));
      const counterpartyIdx = header.findIndex(h => h.includes('counterparty') || h.includes('protiucet') || h.includes('контрагент') || h.includes('nazev'));
      const descriptionIdx = header.findIndex(h => h.includes('description') || h.includes('popis') || h.includes('опис') || h.includes('poznamka') || h.includes('zpra'));
      const referenceIdx = header.findIndex(h => h.includes('reference') || h.includes('vs') || h.includes('variable') || h.includes('ref'));

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
        if (cols.length < 2) continue;

        const amount = parseFloat((cols[amountIdx >= 0 ? amountIdx : 1] || '0').replace(/\s/g, '').replace(',', '.'));
        if (isNaN(amount)) continue;

        rows.push({
          date: cols[dateIdx >= 0 ? dateIdx : 0] || '',
          amount,
          counterparty: cols[counterpartyIdx >= 0 ? counterpartyIdx : 2] || '',
          description: cols[descriptionIdx >= 0 ? descriptionIdx : 3] || '',
          reference: referenceIdx >= 0 ? (cols[referenceIdx] || '') : '',
        });
      }

      if (rows.length === 0) {
        alert('Не вдалося розпарсити CSV. Перевірте формат.');
        setImporting(false);
        return;
      }

      const res = await fetch('/api/finance/bank/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: `import_${new Date().toISOString().substring(0, 10)}.csv`, rows }),
      });
      const data = await res.json();

      if (data.statement) {
        setCsvText('');
        setSelectedStatement(data.statement.id);
        fetchStatements();
        alert(`✅ Імпортовано ${data.totalRows} транзакцій.\n🤖 Авто-matched: ${data.autoMatched}\n❌ Без категорії: ${data.unmatched}`);
      }
    } catch (e) { console.error(e); alert('Помилка імпорту'); }
    setImporting(false);
  };

  // Update a transaction (match / confirm / ignore)
  const updateTransaction = async (id: string, matched_category_id: string, matched_business_unit_id: string | null, match_status: string, create_expense: boolean) => {
    try {
      await fetch('/api/finance/bank/transactions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, matched_category_id, matched_business_unit_id, match_status, create_expense }),
      });
      if (selectedStatement) fetchTransactions(selectedStatement);
      fetchStatements();
    } catch (e) { console.error(e); }
  };

  const confirmAll = async () => {
    const unmatched = transactions.filter(t => t.match_status === 'auto_matched');
    if (unmatched.length === 0) { alert('Немає транзакцій для підтвердження'); return; }
    if (!confirm(`Підтвердити ${unmatched.length} авто-matched транзакцій та створити витрати?`)) return;
    for (const tx of unmatched) {
      await updateTransaction(tx.id, tx.matched_category_id, tx.matched_business_unit_id, 'confirmed', true);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Upload size={28} /> Банк — Імпорт виписок</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Завантаження CSV → авто-match → підтвердження</p>
        </div>
      </div>

      {/* CSV Import Area */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>📄 Завантажити виписку (CSV)</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Вставте CSV дані. Підтримуються роздільники: <code>;</code> та <code>,</code>. Колонки: date, amount, counterparty, description, reference.
        </p>
        <textarea value={csvText} onChange={e => setCsvText(e.target.value)}
          placeholder={"datum;castka;nazev_protiuctu;popis;variabilni_symbol\n2026-03-01;-5000;MAKRO;potraviny;123456\n2026-03-02;15000;BOOKING;Guest payment;789012"}
          rows={6}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical', marginBottom: '0.75rem' }}
        />
        <button className="btn btn-primary" onClick={handleImport} disabled={importing || !csvText.trim()}>
          {importing ? '⏳ Імпортую...' : '📥 Імпортувати та авто-match'}
        </button>
      </div>

      {/* Statements List */}
      {statements.length > 0 && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>📋 Завантажені виписки</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div
              onClick={() => setSelectedStatement('')}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
                border: selectedStatement === '' ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: selectedStatement === '' ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <FileText size={20} style={{ color: 'var(--accent)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>📂 Всі виписки та транзакції</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Показати всі банківські транзакції за всіма завантаженими виписками
                  </div>
                </div>
              </div>
            </div>
            {statements.map(s => (
              <div key={s.id}
                onClick={() => setSelectedStatement(selectedStatement === s.id ? '' : s.id)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
                  border: selectedStatement === s.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: selectedStatement === s.id ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <FileText size={20} style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.file_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {s.period_from} → {s.period_to} • {s.uploaded_at?.substring(0, 10)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>{s.matched_transactions}/{s.total_transactions} matched</span>
                  <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--surface-hover)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.total_transactions > 0 ? (s.matched_transactions / s.total_transactions * 100) : 0}%`, background: '#22c55e', borderRadius: 3 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions Review */}
      {(statements.length > 0 || transactions.length > 0) && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
            <h3 style={{ fontWeight: 600 }}>🔍 Перегляд транзакцій</h3>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
              <option value="">Всі</option>
              <option value="unmatched">❌ Не matched</option>
              <option value="auto_matched">🤖 Авто</option>
              <option value="confirmed">✅ Підтверджені</option>
              <option value="ignored">⊘ Ігнор</option>
            </select>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={confirmAll} style={{ fontSize: '0.85rem' }}>
              <CheckCircle size={16} /> Підтвердити всі авто-matched
            </button>
          </div>

          <div className="card" style={{ overflow: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
            ) : transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Немає транзакцій</div>
            ) : (
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr><th>Дата</th><th>Контрагент</th><th>Опис</th><th style={{ textAlign: 'right' }}>Сума</th><th>Категорія</th><th>BU</th><th>Статус</th><th style={{ width: 140 }}>Дії</th></tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const st = STATUS_COLORS[tx.match_status] || STATUS_COLORS.unmatched;
                    return (
                      <tr key={tx.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{tx.transaction_date}</td>
                        <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.counterparty || '—'}</td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: tx.amount >= 0 ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }}>{formatCZK(tx.amount)}</td>
                        <td>
                          {tx.match_status === 'confirmed' || tx.match_status === 'auto_matched' ? (
                            <span style={{ fontSize: '0.75rem' }}>{tx.category_icon} {tx.category_name}</span>
                          ) : tx.match_status === 'unmatched' ? (
                            <select defaultValue={tx.matched_category_id || ''} onChange={e => {
                              const catId = e.target.value;
                              if (catId) updateTransaction(tx.id, catId, tx.matched_business_unit_id, 'manual', false);
                            }} style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                              <option value="">Оберіть...</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tx.category_name || '—'}</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem' }}>{tx.bu_name || '—'}</td>
                        <td><span style={{ padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {(tx.match_status === 'auto_matched' || tx.match_status === 'manual') && (
                              <button className="btn-icon" title="Підтвердити" style={{ color: '#22c55e' }}
                                onClick={() => updateTransaction(tx.id, tx.matched_category_id, tx.matched_business_unit_id, 'confirmed', true)}>
                                <Check size={14} />
                              </button>
                            )}
                            {tx.match_status !== 'confirmed' && tx.match_status !== 'ignored' && (
                              <button className="btn-icon" title="Ігнорувати" style={{ color: '#6b7280' }}
                                onClick={() => updateTransaction(tx.id, tx.matched_category_id, tx.matched_business_unit_id, 'ignored', false)}>
                                <XCircle size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
