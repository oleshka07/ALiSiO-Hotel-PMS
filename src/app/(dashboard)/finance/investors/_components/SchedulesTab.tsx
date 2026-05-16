'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit, Calendar, Plus, Trash2, Wand2 } from 'lucide-react';

interface Investment {
  id: string;
  investor_name: string;
  project_name: string;
  amount: number;
  currency: string;
  equity_pct: number | null;
  invested_at: string;
  target_apy: number | null;
  cashback_schedule_json: string | null;
}

interface SchedulePeriod {
  period: string;
  planned_eur: number;
  planned_kc?: number;
}

interface CashbackScheduleJson {
  type: 'monthly' | 'quarterly';
  currency: string;
  schedule: SchedulePeriod[];
  total_planned_eur: number;
  expected_repayment_date: string;
  irr_target?: number;
}

function safeParse(s: string | null): CashbackScheduleJson | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function fmt(n: number, cur: string): string {
  return `${n.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${cur}`;
}

/** Generate N periods starting from start_month with equal-amount plan. */
function generateEqualSchedule(
  type: 'monthly' | 'quarterly',
  startMonth: string,
  count: number,
  totalEur: number,
): SchedulePeriod[] {
  const perPeriod = +(totalEur / count).toFixed(2);
  const out: SchedulePeriod[] = [];
  const [yStr, mStr] = startMonth.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  for (let i = 0; i < count; i++) {
    if (type === 'monthly') {
      out.push({ period: `${y}-${String(m).padStart(2, '0')}`, planned_eur: perPeriod });
      m++;
      if (m > 12) { m = 1; y++; }
    } else {
      const q = Math.ceil(m / 3);
      out.push({ period: `${y}-Q${q}`, planned_eur: perPeriod });
      m += 3;
      if (m > 12) { m -= 12; y++; }
    }
  }
  return out;
}

export default function SchedulesTab() {
  const [items, setItems] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CashbackScheduleJson | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/investor-investments');
      const json = await res.json();
      setItems(json.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openEditor(inv: Investment) {
    const existing = safeParse(inv.cashback_schedule_json);
    setEditingId(inv.id);
    setEditing(existing || {
      type: 'monthly',
      currency: inv.currency || 'EUR',
      schedule: [],
      total_planned_eur: 0,
      expected_repayment_date: '',
    });
  }

  function generate(args: { type: 'monthly' | 'quarterly'; start: string; count: number; total: number }) {
    const schedule = generateEqualSchedule(args.type, args.start, args.count, args.total);
    setEditing({
      type: args.type,
      currency: editing?.currency || 'EUR',
      schedule,
      total_planned_eur: args.total,
      expected_repayment_date: schedule.length ? schedule[schedule.length - 1].period.replace('-Q', '-') : '',
      irr_target: editing?.irr_target,
    });
  }

  async function save() {
    if (!editing || !editingId) return;
    // Recompute totals from schedule
    const total = editing.schedule.reduce((s, p) => s + (p.planned_eur || 0), 0);
    const payload = { ...editing, total_planned_eur: +total.toFixed(2) };
    const res = await fetch(`/api/finance/investor-investments/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashback_schedule_json: JSON.stringify(payload) }),
    });
    const j = await res.json();
    if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
    setEditing(null);
    setEditingId(null);
    fetchAll();
  }

  async function clearSchedule(invId: string) {
    if (!confirm('Очистити графік виплат для цієї інвестиції?')) return;
    const res = await fetch(`/api/finance/investor-investments/${invId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashback_schedule_json: null }),
    });
    const j = await res.json();
    if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
    fetchAll();
  }

  if (loading) return <div>Завантаження…</div>;

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Графік контрактних виплат для кожної інвестиції. Engine використовує його для розрахунку статусу «Plan vs Actual» на інвесторському порталі.
      </p>

      {items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Жодної інвестиції. Створіть їх на вкладці «Інвестиції (лоти)».
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={th}>Інвестор</th>
                <th style={th}>Проєкт</th>
                <th style={{ ...th, textAlign: 'right' }}>Сума</th>
                <th style={{ ...th, textAlign: 'right' }}>Target APY</th>
                <th style={th}>Графік</th>
                <th style={{ ...th, textAlign: 'right' }}>Запланована сума</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const sched = safeParse(i.cashback_schedule_json);
                return (
                  <tr key={i.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                    <td style={td}><b>{i.investor_name}</b></td>
                    <td style={td}>{i.project_name}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(i.amount, i.currency)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{i.target_apy != null ? `${(i.target_apy * 100).toFixed(1)}%` : '—'}</td>
                    <td style={td}>
                      {sched ? (
                        <span style={{ color: '#16a34a' }}>
                          {sched.type === 'monthly' ? '📅' : '🗓'} {sched.schedule.length} періодів · {sched.type === 'monthly' ? 'monthly' : 'quarterly'}
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b' }}>⚠ Не задано</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {sched ? fmt(sched.total_planned_eur, sched.currency) : '—'}
                    </td>
                    <td style={td}>
                      <button onClick={() => openEditor(i)} style={iconBtn} title="Редагувати графік">
                        <Edit size={14} />
                      </button>
                      {sched && (
                        <button onClick={() => clearSchedule(i.id)} style={{ ...iconBtn, color: '#dc2626' }} title="Очистити">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && editingId && (
        <div style={overlayStyle} onClick={() => { setEditing(null); setEditingId(null); }}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={20} /> Графік виплат
            </h3>

            {/* Generator */}
            <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Wand2 size={14} /> Згенерувати рівномірний графік
              </div>
              <GeneratorForm onGenerate={generate} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="Тип">
                  <select style={input} value={editing.type}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value as 'monthly' | 'quarterly' })}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Валюта">
                  <select style={input} value={editing.currency}
                    onChange={(e) => setEditing({ ...editing, currency: e.target.value })}>
                    <option>EUR</option><option>CZK</option><option>USD</option>
                  </select>
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="IRR target (0.12 = 12%)">
                  <input type="number" step="0.001" style={input}
                    value={editing.irr_target ?? ''}
                    onChange={(e) => setEditing({ ...editing, irr_target: e.target.value ? parseFloat(e.target.value.replace(',', '.')) : undefined })} />
                </Field>
              </div>
            </div>

            <Field label="Очікувана дата повного повернення (YYYY-MM)">
              <input style={input} value={editing.expected_repayment_date}
                placeholder="2031-08"
                onChange={(e) => setEditing({ ...editing, expected_repayment_date: e.target.value })} />
            </Field>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Періоди ({editing.schedule.length})</div>
                <button onClick={() => setEditing({ ...editing, schedule: [...editing.schedule, { period: '', planned_eur: 0 }] })}
                  style={{ ...btn, fontSize: 11, padding: '4px 10px' }}>
                  <Plus size={11} /> Додати рядок
                </button>
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ ...thSmall, width: '40%' }}>Період</th>
                      <th style={{ ...thSmall, textAlign: 'right' }}>Plan {editing.currency}</th>
                      <th style={{ ...thSmall, width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.schedule.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-primary)' }}>
                        <td style={tdSmall}>
                          <input style={{ ...input, padding: '4px 6px', fontSize: 12 }}
                            value={p.period}
                            placeholder="2025-08 або 2025-Q3"
                            onChange={(e) => {
                              const sched = [...editing.schedule];
                              sched[i] = { ...sched[i], period: e.target.value };
                              setEditing({ ...editing, schedule: sched });
                            }} />
                        </td>
                        <td style={{ ...tdSmall, textAlign: 'right' }}>
                          <input type="number" step="0.01" style={{ ...input, padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                            value={p.planned_eur || 0}
                            onChange={(e) => {
                              const sched = [...editing.schedule];
                              sched[i] = { ...sched[i], planned_eur: parseFloat(e.target.value.replace(',', '.')) || 0 };
                              setEditing({ ...editing, schedule: sched });
                            }} />
                        </td>
                        <td style={tdSmall}>
                          <button onClick={() => setEditing({ ...editing, schedule: editing.schedule.filter((_, j) => j !== i) })}
                            style={iconBtn}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--bg-secondary)', fontWeight: 600 }}>
                      <td style={tdSmall}>РАЗОМ</td>
                      <td style={{ ...tdSmall, textAlign: 'right' }}>
                        {fmt(editing.schedule.reduce((s, p) => s + (p.planned_eur || 0), 0), editing.currency)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setEditing(null); setEditingId(null); }} style={btn}>Відміна</button>
              <button onClick={save} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GeneratorForm({ onGenerate }: { onGenerate: (args: { type: 'monthly' | 'quarterly'; start: string; count: number; total: number }) => void }) {
  const [type, setType] = useState<'monthly' | 'quarterly'>('monthly');
  const [start, setStart] = useState(() => new Date().toISOString().substring(0, 7));
  const [count, setCount] = useState(60);
  const [total, setTotal] = useState(0);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ width: 110 }}>
        <label style={lblSmall}>Тип</label>
        <select style={input} value={type} onChange={(e) => setType(e.target.value as 'monthly' | 'quarterly')}>
          <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
        </select>
      </div>
      <div style={{ width: 110 }}>
        <label style={lblSmall}>Початок (YYYY-MM)</label>
        <input style={input} value={start} onChange={(e) => setStart(e.target.value)} placeholder="2025-08" />
      </div>
      <div style={{ width: 70 }}>
        <label style={lblSmall}>Періодів</label>
        <input type="number" style={input} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} />
      </div>
      <div style={{ width: 110 }}>
        <label style={lblSmall}>Total EUR</label>
        <input type="number" style={input} value={total} onChange={(e) => setTotal(parseFloat(e.target.value.replace(',', '.')) || 0)} placeholder="279000" />
      </div>
      <button onClick={() => onGenerate({ type, start, count, total })}
        style={{ ...btn, fontSize: 12, padding: '7px 12px', background: '#3b82f6', color: '#fff', border: 'none' }}>
        Згенерувати
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>{children}</div>;
}

const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: 5, cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 6 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '8px 12px' };
const thSmall: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' };
const tdSmall: React.CSSProperties = { padding: '3px 6px' };
const lblSmall: React.CSSProperties = { display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2, textTransform: 'uppercase' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 640, maxWidth: 800, maxHeight: '90vh', overflow: 'auto' };
