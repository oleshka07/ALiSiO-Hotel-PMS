'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, FileText, Trash2, Download } from 'lucide-react';

interface Doc {
  id: string;
  investor_id: string | null;
  business_unit_id: string | null;
  type: 'agreement' | 'monthly_report' | 'tax_statement' | 'bank_statement' | 'other';
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  period_start: string | null;
  period_end: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  investor_name: string | null;
  business_unit_name: string | null;
}

interface Investor { id: string; name: string }
interface Project  { id: string; name: string }

const TYPE_OPTIONS = [
  { value: 'agreement',       label: 'Договір' },
  { value: 'monthly_report',  label: 'Місячний звіт' },
  { value: 'tax_statement',   label: 'Податковий звіт' },
  { value: 'bank_statement',  label: 'Банк-виписка' },
  { value: 'other',           label: 'Інше' },
];

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  agreement:      { bg: '#dbeafe', fg: '#1e40af' },
  monthly_report: { bg: '#dcfce7', fg: '#166534' },
  tax_statement:  { bg: '#fef3c7', fg: '#92400e' },
  bank_statement: { bg: '#e0e7ff', fg: '#4338ca' },
  other:          { bg: '#f3f4f6', fg: '#374151' },
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsTab() {
  const [items, setItems] = useState<Doc[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // upload form state
  const [type, setType] = useState('monthly_report');
  const [name, setName] = useState('');
  const [investorId, setInvestorId] = useState('');
  const [buId, setBuId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, iRes, pRes] = await Promise.all([
        fetch('/api/finance/investor-documents'),
        fetch('/api/finance/investors'),
        fetch('/api/finance/investor-properties'),
      ]);
      const [dJ, iJ, pJ] = await Promise.all([dRes.json(), iRes.json(), pRes.json()]);
      setItems(dJ.items || []);
      setInvestors((iJ.items || []).map((i: any) => ({ id: i.id, name: i.name })));
      setProjects((pJ.items || []).map((p: any) => ({ id: p.project_id, name: p.name })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function upload() {
    if (!file) { alert('Оберіть файл'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      if (name) fd.append('name', name);
      if (investorId) fd.append('investor_id', investorId);
      if (buId) fd.append('business_unit_id', buId);
      if (periodStart) fd.append('period_start', periodStart);
      if (periodEnd) fd.append('period_end', periodEnd);
      const res = await fetch('/api/finance/investor-documents', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
      // reset form
      setFile(null);
      setName('');
      setPeriodStart('');
      setPeriodEnd('');
      // keep type/investor/bu для зручності множинного upload
      const fileInput = document.getElementById('investor-doc-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      fetchAll();
    } catch (e: any) {
      alert(`Помилка: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function remove(d: Doc) {
    if (!confirm(`Видалити «${d.name}»? Фізичний файл буде стерто.`)) return;
    const res = await fetch(`/api/finance/investor-documents/${d.id}`, { method: 'DELETE' });
    const j = await res.json();
    if (!res.ok) { alert(`Помилка: ${j.error}`); return; }
    fetchAll();
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Documents Vault. Файли зберігаються на сервері (<code>data/uploads/investor-documents/</code>) і відображаються інвестору на порталі. Можна привʼязувати до інвестора, обʼєкта, або обох.
      </p>

      {/* Upload form */}
      <div style={{ padding: 16, border: '1px solid var(--border-primary)', borderRadius: 10, marginBottom: 16, background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Upload size={16} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Завантажити документ</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
          <Field label="Тип *">
            <select style={input} value={type} onChange={(e) => setType(e.target.value)}>
              {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Назва (опц., default = ім&apos;я файла)">
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Investment Agreement" />
          </Field>
          <Field label="Інвестор">
            <select style={input} value={investorId} onChange={(e) => setInvestorId(e.target.value)}>
              <option value="">— Усім —</option>
              {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <Field label="Об'єкт">
            <select style={input} value={buId} onChange={(e) => setBuId(e.target.value)}>
              <option value="">— Не привязано —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Період з">
            <input type="date" style={input} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field label="Період до">
            <input type="date" style={input} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            id="investor-doc-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.docx,.doc,.txt"
            style={{ flex: 1, padding: 8, border: '1px solid var(--border-primary)', borderRadius: 6, background: 'var(--bg-primary)', fontSize: 13 }}
          />
          <button onClick={upload} disabled={!file || uploading}
            style={{ ...btn, background: file && !uploading ? '#3b82f6' : '#94a3b8', color: '#fff', border: 'none', cursor: file && !uploading ? 'pointer' : 'not-allowed' }}>
            {uploading ? 'Завантаження…' : <><Upload size={14} /> Завантажити</>}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? <div>Завантаження…</div> : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Жодного документа. Завантажте перший вище.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={th}>Дата</th>
                <th style={th}>Тип</th>
                <th style={th}>Назва</th>
                <th style={th}>Інвестор</th>
                <th style={th}>Об&apos;єкт</th>
                <th style={th}>Період</th>
                <th style={{ ...th, textAlign: 'right' }}>Розмір</th>
                <th style={th}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => {
                const tc = TYPE_COLORS[d.type] || TYPE_COLORS.other;
                const typeLabel = TYPE_OPTIONS.find((t) => t.value === d.type)?.label || d.type;
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                    <td style={td}>{d.uploaded_at?.substring(0, 10)}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, padding: '2px 8px', background: tc.bg, color: tc.fg, borderRadius: 4, fontWeight: 600 }}>
                        {typeLabel}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>
                      <FileText size={12} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--text-secondary)' }} />
                      {d.name}
                    </td>
                    <td style={td}>{d.investor_name || '—'}</td>
                    <td style={td}>{d.business_unit_name || '—'}</td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {d.period_start || d.period_end ? `${d.period_start || '…'} → ${d.period_end || '…'}` : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {fmtSize(d.file_size)}
                    </td>
                    <td style={td}>
                      <a href={`/api/finance/investor-documents/${d.id}/download`} style={iconBtn} title="Завантажити">
                        <Download size={14} />
                      </a>
                      <button onClick={() => remove(d)} style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3, textTransform: 'uppercase' }}>{label}</label>{children}</div>;
}

const input: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 500, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: 6 };
const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 'none', padding: 5, cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 6, textDecoration: 'none' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '8px 12px' };
