'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit, TrendingUp, Trash2, Copy } from 'lucide-react';

interface Scenario {
  id: string;
  business_unit_id: string;
  business_unit_name: string | null;
  scenario: 'pessimistic' | 'base' | 'optimistic';
  assumptions_json: string | null;
  monthly_cashback_projection_json: string | null;
  full_repayment_eta: string | null;
  updated_at: string;
}

interface Project { id: string; name: string }

interface ScenarioAssumptions {
  occupancy?: number;        // 0.50 = 50%
  adr?: number;              // CZK average daily rate
  opex_growth?: number;      // 0.08 = +8%/year
  irr_target?: number;
  notes?: string;
}

const SCENARIO_META = {
  pessimistic: { label: 'Песимістичний', color: '#dc2626', bg: '#fee2e2' },
  base:        { label: 'Базовий',       color: '#16a34a', bg: '#dcfce7' },
  optimistic:  { label: 'Оптимістичний', color: '#3b82f6', bg: '#dbeafe' },
} as const;

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

export default function ScenariosTab() {
  const [items, setItems] = useState<Scenario[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    business_unit_id: string;
    scenario: 'pessimistic' | 'base' | 'optimistic';
    assumptions: ScenarioAssumptions;
    full_repayment_eta: string;
    monthly_cashback_projection_json: string;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/finance/forecast-scenarios'),
        fetch('/api/finance/investor-properties'),
      ]);
      const [sJ, pJ] = await Promise.all([sRes.json(), pRes.json()]);
      setItems(sJ.items || []);
      setProjects((pJ.items || []).map((p: any) => ({ id: p.project_id, name: p.name })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Group by business_unit_id
  const grouped = new Map<string, { name: string; scenarios: Map<string, Scenario> }>();
  for (const p of projects) grouped.set(p.id, { name: p.name, scenarios: new Map() });
  for (const s of items) {
    if (!grouped.has(s.business_unit_id)) {
      grouped.set(s.business_unit_id, { name: s.business_unit_name || s.business_unit_id, scenarios: new Map() });
    }
    grouped.get(s.business_unit_id)!.scenarios.set(s.scenario, s);
  }

  function openEditor(buId: string, scenario: 'pessimistic' | 'base' | 'optimistic') {
    const existing = grouped.get(buId)?.scenarios.get(scenario);
    setEditing({
      business_unit_id: buId,
      scenario,
      assumptions: safeParse<ScenarioAssumptions>(existing?.assumptions_json || null) || {},
      full_repayment_eta: existing?.full_repayment_eta || '',
      monthly_cashback_projection_json: existing?.monthly_cashback_projection_json || '',
    });
  }

  async function save() {
    if (!editing) return;
    const res = await fetch('/api/finance/forecast-scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_unit_id: editing.business_unit_id,
        scenario: editing.scenario,
        assumptions_json: JSON.stringify(editing.assumptions),
        monthly_cashback_projection_json: editing.monthly_cashback_projection_json || null,
        full_repayment_eta: editing.full_repayment_eta || null,
      }),
    });
    const j = await res.json();
    if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
    setEditing(null);
    fetchAll();
  }

  async function removeScenario(id: string) {
    if (!confirm('Видалити сценарій?')) return;
    await fetch(`/api/finance/forecast-scenarios/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  async function copyToAll(sourceBuId: string, sourceName: string) {
    const sourceCount = grouped.get(sourceBuId)?.scenarios.size || 0;
    if (sourceCount === 0) { alert('Цей обʼєкт ще не має сценаріїв — нема що копіювати.'); return; }
    const overwrite = confirm(
      `Скопіювати сценарії з «${sourceName}» на ВСІ інші інвесторські обʼєкти?\n\n` +
      `OK — перезаписати існуючі сценарії на цільових обʼєктах\n` +
      `Cancel — копіювати тільки туди де ще немає (пропустити існуючі)`,
    );
    // Confirm intent — distinct from the overwrite question above.
    if (!confirm(`Точно копіювати ${sourceCount} ${sourceCount === 1 ? 'сценарій' : 'сценарії'} ${overwrite ? '(з перезаписом)' : '(пропускаючи існуючі)'}?`)) return;
    try {
      const res = await fetch('/api/finance/forecast-scenarios/copy-to-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_business_unit_id: sourceBuId, overwrite }),
      });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      alert(`✓ Записано: ${j.written} · Пропущено (вже існують): ${j.skipped}\nЦільових обʼєктів: ${j.targets}`);
      fetchAll();
    } catch (e: any) {
      alert(`Помилка: ${e.message}`);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        3 сценарії на кожен обʼєкт (песимістичний / базовий / оптимістичний). Engine використовує їх для побудови fan-чарта прогнозу повного повернення на інвесторському порталі.
      </p>

      {loading ? <div>Завантаження…</div> : grouped.size === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Немає обʼєктів. Створіть на вкладці «Обʼєкти».
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {[...grouped.entries()].map(([buId, group]) => (
            <div key={buId} style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{group.name}</div>
                <div style={{ flex: 1 }} />
                {group.scenarios.size > 0 && (
                  <button onClick={() => copyToAll(buId, group.name)}
                          style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, border: '1px solid var(--border-primary)' }}
                          title="Скопіювати ці сценарії на всі інші інвесторські обʼєкти">
                    <Copy size={11} /> Скопіювати на всі інші
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {(['pessimistic', 'base', 'optimistic'] as const).map((sc) => {
                  const meta = SCENARIO_META[sc];
                  const existing = group.scenarios.get(sc);
                  const ass = safeParse<ScenarioAssumptions>(existing?.assumptions_json || null);
                  return (
                    <div key={sc} style={{ border: `1px solid ${meta.color}30`, background: meta.bg, borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {meta.label}
                        </span>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button onClick={() => openEditor(buId, sc)} style={iconBtn} title="Редагувати"><Edit size={12} /></button>
                          {existing && (
                            <button onClick={() => removeScenario(existing.id)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={12} /></button>
                          )}
                        </div>
                      </div>
                      {existing ? (
                        <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                          {ass?.occupancy != null && <div>Occupancy: <b>{(ass.occupancy * 100).toFixed(0)}%</b></div>}
                          {ass?.adr != null && <div>ADR: <b>{ass.adr.toLocaleString('cs-CZ')} CZK</b></div>}
                          {ass?.opex_growth != null && <div>OPEX growth: <b>{(ass.opex_growth * 100).toFixed(0)}%/рік</b></div>}
                          {existing.full_repayment_eta && <div>Repayment: <b>{existing.full_repayment_eta}</b></div>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          Не задано — натисніть ✏
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div style={overlayStyle} onClick={() => setEditing(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={20} /> Сценарій: {SCENARIO_META[editing.scenario].label}
            </h3>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              BU: {grouped.get(editing.business_unit_id)?.name || editing.business_unit_id}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Occupancy (0.50 = 50%)">
                <input type="number" step="0.01" style={input}
                  value={editing.assumptions.occupancy ?? ''}
                  placeholder="0.50"
                  onChange={(e) => setEditing({ ...editing, assumptions: { ...editing.assumptions, occupancy: e.target.value ? parseFloat(e.target.value.replace(',', '.')) : undefined } })} />
              </Field>
              <Field label="ADR (CZK)">
                <input type="number" step="1" style={input}
                  value={editing.assumptions.adr ?? ''}
                  placeholder="2400"
                  onChange={(e) => setEditing({ ...editing, assumptions: { ...editing.assumptions, adr: e.target.value ? parseFloat(e.target.value.replace(',', '.')) : undefined } })} />
              </Field>
              <Field label="OPEX growth/рік (0.08 = +8%)">
                <input type="number" step="0.01" style={input}
                  value={editing.assumptions.opex_growth ?? ''}
                  placeholder="0.08"
                  onChange={(e) => setEditing({ ...editing, assumptions: { ...editing.assumptions, opex_growth: e.target.value ? parseFloat(e.target.value.replace(',', '.')) : undefined } })} />
              </Field>
              <Field label="IRR target (0.12 = 12%)">
                <input type="number" step="0.001" style={input}
                  value={editing.assumptions.irr_target ?? ''}
                  placeholder="0.12"
                  onChange={(e) => setEditing({ ...editing, assumptions: { ...editing.assumptions, irr_target: e.target.value ? parseFloat(e.target.value.replace(',', '.')) : undefined } })} />
              </Field>
            </div>

            <Field label="Очікувана дата повного повернення (YYYY-MM-DD)">
              <input type="date" style={input}
                value={editing.full_repayment_eta}
                onChange={(e) => setEditing({ ...editing, full_repayment_eta: e.target.value })} />
            </Field>

            <Field label="Нотатки до сценарію">
              <textarea style={{ ...input, minHeight: 60, fontFamily: 'inherit' }}
                value={editing.assumptions.notes || ''}
                onChange={(e) => setEditing({ ...editing, assumptions: { ...editing.assumptions, notes: e.target.value } })}
                placeholder="Наприклад: «Базується на trailing 6m, припускає стабільне завантаження…»" />
            </Field>

            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Розширено: monthly_cashback_projection_json (опц., raw JSON для fan-чарта)
              </summary>
              <textarea style={{ ...input, minHeight: 80, fontFamily: 'monospace', fontSize: 11, marginTop: 8 }}
                value={editing.monthly_cashback_projection_json}
                onChange={(e) => setEditing({ ...editing, monthly_cashback_projection_json: e.target.value })}
                placeholder='[{"period": "2026-05", "eur": 250}, ...]' />
            </details>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={btn}>Відміна</button>
              <button onClick={save} style={{ ...btn, background: '#3b82f6', color: '#fff', border: 'none' }}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 10 }}><label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>{children}</div>;
}

const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: 3, cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 4 };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 12, padding: 24, minWidth: 560, maxWidth: 680, maxHeight: '90vh', overflow: 'auto' };
