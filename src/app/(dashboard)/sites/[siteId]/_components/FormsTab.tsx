'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, Code2, Inbox, Check, Copy, Eye, Archive, RotateCcw, AlertCircle, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { Modal, CopyBtn } from './SiteHelpers';

interface CaptureScript {
  id: string;
  site_id: string;
  name: string;
  is_active: number;
  leads_count: number;
  created_at: string;
}

interface IncomingLead {
  id: string;
  site_id: string;
  script_id: string | null;
  script_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: 'new' | 'read' | 'archived';
  source_url: string | null;
  raw_data: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  new:      { label: 'Нова',       color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  read:     { label: 'Прочитана', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  archived: { label: 'Архів',     color: 'var(--text-tertiary)', bg: 'var(--surface-secondary)' },
};

function DevGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 12, border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--surface-secondary)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <BookOpen size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>📖 Інструкція для розробника сайту</span>
        {open ? <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />}
      </button>
      {open && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12 }}>

          <div style={{ padding: '8px 12px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong>⚠️ Важливо:</strong> ALiSiO розпізнає поля форми автоматично за атрибутом <code>name</code>. Переконайтесь, що ваші поля мають правильні <code>name</code> атрибути.
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>✅ Варіант 1 — Звичайна HTML-форма (auto-capture)</div>
            <div style={{ color: 'var(--text-tertiary)', marginBottom: 8, lineHeight: 1.5 }}>Скрипт автоматично перехоплює submit події. Просто додайте <code>name</code> атрибути:</div>
            <pre style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '10px 12px', margin: 0, overflowX: 'auto', fontFamily: 'monospace', lineHeight: 1.6, color: 'var(--text-primary)' }}>{`<form action="#" method="post">
  <input type="text"  name="name"    placeholder="Ваше ім'я" required />
  <input type="email" name="email"   placeholder="Email" />
  <input type="tel"   name="phone"   placeholder="Телефон" required />
  <textarea           name="message" placeholder="Повідомлення"></textarea>
  <button type="submit">Відправити</button>
</form>`}</pre>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>✅ Варіант 2 — React / SPA (ручний виклик)</div>
            <div style={{ color: 'var(--text-tertiary)', marginBottom: 8, lineHeight: 1.5 }}>Якщо форма контрольована React-компонентом (controlled inputs) — виклич <code>Alisio.sendForm()</code> вручну в обробнику submit:</div>
            <pre style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '10px 12px', margin: 0, overflowX: 'auto', fontFamily: 'monospace', lineHeight: 1.6, color: 'var(--text-primary)' }}>{`// У вашому handleSubmit:
const handleSubmit = async (e) => {
  e.preventDefault();

  // Надіслати в ALiSiO CRM
  window.Alisio?.sendForm({
    name:    formData.name,
    email:   formData.email,
    phone:   formData.phone,
    message: formData.message,   // ← не забудьте!
  });

  // Далі — ваша логіка (Firebase, API тощо)
  await CRMService.addLead({ ... });
};`}</pre>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>📋 Підтримувані назви полів (автовизначення)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Email', keys: 'email, mail, e_mail, user_email' },
                { label: 'Телефон', keys: 'phone, tel, telephone, mobile, mobil' },
                { label: "Ім'я", keys: 'name, full_name, fullname, jmeno, surname, firstname' },
                { label: 'Повідомлення', keys: 'message, msg, comment, note, text, zprava' },
              ].map(g => (
                <div key={g.label} style={{ padding: '8px 10px', background: 'var(--surface-secondary)', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{g.label}</div>
                  <div style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>{g.keys}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '8px 12px', background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: 8, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
            <strong>💡 Для kemp-carlsbad.cz:</strong> Форми використовують React controlled inputs без <code>name</code> атрибутів. Додайте виклик <code>window.Alisio?.sendForm(&#123; name, email, phone, message &#125;)</code>
            {' '}на початку кожного <code>handleSubmit</code> у файлах: <code>ContactPopup.tsx</code>, <code>Contact.tsx</code>, <code>Footer.tsx</code>, <code>ExitIntentPopup.tsx</code>, <code>CallbackWidget.tsx</code>, <code>ModelPopups.tsx</code>.
          </div>
        </div>
      )}
    </div>
  );
}

function ScriptSnippet({ scriptId, siteId }: { scriptId: string; siteId: string }) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const snippet = `<script\n  src="${baseUrl}/widget/collector.js"\n  data-site-id="${siteId}"\n  async defer\n></script>`;
  const manualSnippet = `<!-- React/SPA: виклич вручну в handleSubmit -->\nwindow.Alisio?.sendForm({\n  name:    formData.name,\n  email:   formData.email,\n  phone:   formData.phone,\n  message: formData.message,\n});`;
  void scriptId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>📋 Вставте цей код у &lt;head&gt; вашого сайту</span>
          <CopyBtn text={snippet} />
        </div>
        <pre style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: '12px 14px', fontSize: 12, overflowX: 'auto', fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>{snippet}</pre>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>💡 Ручна відправка (React / SPA)</div>
        <pre style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: '12px 14px', fontSize: 12, overflowX: 'auto', fontFamily: 'monospace', color: 'var(--text-tertiary)', lineHeight: 1.6, margin: 0 }}>{manualSnippet}</pre>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 14px', background: 'rgba(37,99,235,0.05)', borderRadius: 8, border: '1px solid rgba(37,99,235,0.15)', lineHeight: 1.6 }}>
        <strong>Як це працює:</strong> Скрипт автоматично перехоплює submit будь-яких HTML-форм. Для React-сайтів — додайте ручний виклик. Поля email, phone, name, message розпізнаються автоматично.
      </div>
      <DevGuide />
    </div>
  );
}

function LeadRow({ lead, onStatusChange, onDelete }: {
  lead: IncomingLead;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLES[lead.status] ?? STATUS_STYLES.new;
  const date = new Date(lead.created_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  let rawParsed: Record<string, string> | null = null;
  try { rawParsed = lead.raw_data ? JSON.parse(lead.raw_data) : null; } catch { /* */ }

  return (
    <>
      <tr style={{ background: lead.status === 'new' ? 'rgba(37,99,235,0.03)' : undefined }}>
        <td style={{ width: 28 }}>
          <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex', alignItems: 'center' }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td>
          <div style={{ fontWeight: lead.status === 'new' ? 700 : 400, fontSize: 13 }}>{lead.full_name || '—'}</div>
          {lead.email && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lead.email}</div>}
          {lead.phone && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lead.phone}</div>}
        </td>
        <td style={{ maxWidth: 200 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.message || '—'}
          </div>
        </td>
        <td>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.color, fontWeight: 600 }}>{s.label}</span>
        </td>
        <td style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{date}</td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            {lead.status !== 'read' && (
              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} title="Позначити як прочитану" onClick={() => onStatusChange(lead.id, 'read')}>
                <Check size={13} />
              </button>
            )}
            {lead.status !== 'archived' && (
              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} title="Архівувати" onClick={() => onStatusChange(lead.id, 'archived')}>
                <Archive size={13} />
              </button>
            )}
            {lead.status === 'archived' && (
              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} title="Відновити" onClick={() => onStatusChange(lead.id, 'new')}>
                <RotateCcw size={13} />
              </button>
            )}
            <button className="btn btn-ghost" style={{ padding: '4px 8px', color: '#ef4444' }} title="Видалити" onClick={() => onDelete(lead.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && rawParsed && (
        <tr>
          <td colSpan={6} style={{ padding: '0 0 12px 40px' }}>
            <div style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Всі поля форми:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(rawParsed).filter(([k]) => !['siteId', 'site_id', '_hp_trap', 'sourceUrl', 'source_url'].includes(k)).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--surface-primary)', border: '1px solid var(--border-primary)', borderRadius: 6 }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>{k}:</span> <span style={{ fontWeight: 600 }}>{String(v).slice(0, 100)}</span>
                  </span>
                ))}
              </div>
              {lead.source_url && (
                <div style={{ marginTop: 6, color: 'var(--text-tertiary)' }}>
                  📎 <a href={lead.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', fontSize: 11 }}>{lead.source_url.slice(0, 80)}</a>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function FormsTab({ siteId, onCountChange }: {
  siteId: string;
  onCountChange?: (n: number) => void;
}) {
  const [scripts, setScripts] = useState<CaptureScript[]>([]);
  const [leads, setLeads] = useState<IncomingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'scripts' | 'leads'>('scripts');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newScriptName, setNewScriptName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showSnippet, setShowSnippet] = useState<string | null>(null);

  // Allowed domains edit
  const [allowedDomains, setAllowedDomains] = useState('');
  const [savingDomains, setSavingDomains] = useState(false);
  const [domainsSaved, setDomainsSaved] = useState(false);

  const onCountRef = useRef(onCountChange);
  useEffect(() => { onCountRef.current = onCountChange; }, [onCountChange]);

  const fetchScripts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/capture-scripts?site_id=${siteId}`);
      const d = await res.json();
      const list: CaptureScript[] = d.scripts ?? [];
      setScripts(list);
      const newCount = list.reduce((s, sc) => s + (sc.leads_count ?? 0), 0);
      onCountRef.current?.(newCount);
    } catch { setScripts([]); }
    setLoading(false);
  }, [siteId]);

  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const url = `/api/incoming-leads?site_id=${siteId}${filterStatus ? `&status=${filterStatus}` : ''}`;
      const res = await fetch(url);
      const d = await res.json();
      setLeads(d.leads ?? []);
    } catch { setLeads([]); }
    setLeadsLoading(false);
  }, [siteId, filterStatus]);

  const fetchSiteAllowedDomains = useCallback(async () => {
    try {
      const res = await fetch(`/api/booking-sites/${siteId}`);
      const d = await res.json();
      const domains = d.site?.allowed_domains;
      if (domains) {
        try { setAllowedDomains(JSON.parse(domains).join(', ')); } catch { setAllowedDomains(domains); }
      }
    } catch { /* */ }
  }, [siteId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchScripts(); fetchSiteAllowedDomains(); }, [fetchScripts, fetchSiteAllowedDomains]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeSection === 'leads') fetchLeads(); }, [activeSection, fetchLeads]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/capture-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, name: newScriptName || 'Основний скрипт' }),
      });
      if (res.ok) { setShowCreate(false); setNewScriptName(''); fetchScripts(); }
    } catch { /* */ }
    setCreating(false);
  };

  const handleDeleteScript = async (id: string) => {
    if (!confirm('Видалити скрипт та всі заявки з нього?')) return;
    await fetch(`/api/capture-scripts/${id}`, { method: 'DELETE' });
    fetchScripts();
  };

  const handleToggleScript = async (script: CaptureScript) => {
    await fetch(`/api/capture-scripts/${script.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: script.is_active ? 0 : 1 }),
    });
    fetchScripts();
  };

  const handleLeadStatus = async (id: string, status: string) => {
    await fetch(`/api/incoming-leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchLeads();
    fetchScripts();
  };

  const handleLeadDelete = async (id: string) => {
    if (!confirm('Видалити заявку?')) return;
    await fetch(`/api/incoming-leads/${id}`, { method: 'DELETE' });
    fetchLeads();
    fetchScripts();
  };

  const handleSaveDomains = async () => {
    setSavingDomains(true);
    try {
      const domainsArr = allowedDomains.split(',').map(d => d.trim()).filter(Boolean);
      await fetch(`/api/booking-sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed_domains: JSON.stringify(domainsArr) }),
      });
      setDomainsSaved(true);
      setTimeout(() => setDomainsSaved(false), 2000);
    } catch { /* */ }
    setSavingDomains(false);
  };

  const newLeadsCount = leads.filter(l => l.status === 'new').length;

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>;

  return (
    <div>
      {/* Section switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {([
          { id: 'scripts', label: 'Скрипти-колектори', icon: <Code2 size={15} /> },
          { id: 'leads', label: `Заявки${newLeadsCount > 0 ? ` (${newLeadsCount} нових)` : ''}`, icon: <Inbox size={15} /> },
        ] as const).map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className="btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: activeSection === s.id ? 'var(--accent-primary)' : 'var(--surface-secondary)',
              color: activeSection === s.id ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${activeSection === s.id ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
              padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, transition: 'all .15s',
            }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* ── Scripts section ── */}
      {activeSection === 'scripts' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Скрипти-колектори</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>JS-фрагмент для вставки у &lt;head&gt; партнерського сайту</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Новий скрипт</button>
          </div>

          {scripts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <Code2 size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ marginBottom: 8 }}>Скриптів ще немає</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>Створіть скрипт, вставте код на сайт — і заявки будуть збиратися автоматично</div>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Створити перший скрипт</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {scripts.map(sc => (
                <div key={sc.id} style={{
                  border: '1px solid var(--border-primary)', borderRadius: 12,
                  background: 'var(--surface-primary)', overflow: 'hidden',
                  opacity: sc.is_active ? 1 : 0.6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 99, background: sc.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{sc.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                        Створено: {new Date(sc.created_at).toLocaleDateString('uk-UA')} · {sc.leads_count ?? 0} заявок
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={() => setShowSnippet(showSnippet === sc.id ? null : sc.id)}>
                        <Eye size={14} /> Код
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => handleToggleScript(sc)}>
                        {sc.is_active ? 'Вимкнути' : 'Увімкнути'}
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '6px 8px', color: '#ef4444' }}
                        onClick={() => handleDeleteScript(sc.id)} title="Видалити">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {showSnippet === sc.id && (
                    <div style={{ padding: '0 16px 16px' }}>
                      <div style={{ height: 1, background: 'var(--border-primary)', margin: '0 0 16px' }} />
                      <ScriptSnippet scriptId={sc.id} siteId={siteId} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Security / Allowed domains */}
          <div style={{ marginTop: 32, padding: '16px 18px', background: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertCircle size={16} style={{ color: '#f59e0b' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Безпека — Дозволені домени</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Вкажіть домени через кому, з яких дозволено приймати заявки. Залиште порожнім — приймати з будь-якого домену (не рекомендовано).
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1, fontSize: 13 }}
                placeholder="kemp-carlsbad.cz, glamping.example.com"
                value={allowedDomains}
                onChange={e => setAllowedDomains(e.target.value)} />
              <button className="btn btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                onClick={handleSaveDomains} disabled={savingDomains}>
                {domainsSaved ? <><Check size={14} /> Збережено</> : savingDomains ? <Loader2 size={14} className="spin" /> : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leads section ── */}
      {activeSection === 'leads' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Вхідні заявки</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Форми, відправлені через скрипт-колектор</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['', 'new', 'read', 'archived'] as const).map(st => (
                <button key={st} onClick={() => setFilterStatus(st)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${filterStatus === st ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    background: filterStatus === st ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                    color: filterStatus === st ? '#fff' : 'var(--text-secondary)', transition: 'all .15s',
                  }}>
                  {st === '' ? 'Всі' : STATUS_STYLES[st]?.label}
                </button>
              ))}
            </div>
          </div>

          {leadsLoading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>
          ) : leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <Inbox size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>{filterStatus ? `Заявок зі статусом «${STATUS_STYLES[filterStatus]?.label}» немає` : 'Заявок ще немає'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Вставте скрипт-колектор на партнерський сайт</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>Контакт</th>
                  <th>Повідомлення</th>
                  <th>Статус</th>
                  <th>Час</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <LeadRow key={lead.id} lead={lead} onStatusChange={handleLeadStatus} onDelete={handleLeadDelete} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create script modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новий скрипт-колектор"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Створити
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">Назва скрипту</label>
          <input className="form-input" placeholder="Основний скрипт"
            value={newScriptName} onChange={e => setNewScriptName(e.target.value)} autoFocus />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Для внутрішнього розрізнення (напр. «Головна», «Контакти»)</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 12px', background: 'var(--surface-secondary)', borderRadius: 8 }}>
          Після створення ви отримаєте JS-фрагмент для вставки у &lt;head&gt; сайту партнера.
        </div>
      </Modal>

      {/* Copy util needed */}
      <div style={{ display: 'none' }}><Copy size={1} /></div>
    </div>
  );
}
