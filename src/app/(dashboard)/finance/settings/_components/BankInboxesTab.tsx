'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Play, Wifi, WifiOff, Mail, AlertCircle, CheckCircle, RotateCcw } from 'lucide-react';
import BankInboxModal, { InboxFormValues } from './BankInboxModal';

export interface BankInbox {
  id: string;
  name: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_folder: string;
  use_tls: number;
  sender_filter: string | null;
  subject_filter: string | null;
  attachment_format: string;
  last_uid: number | null;
  has_attachment_password?: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  last_email_at: string | null;
  emails_processed: number;
  operations_imported: number;
  is_active: number;
  has_password: boolean;
}

function formatDateTime(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('cs-CZ');
}

export default function BankInboxesTab() {
  const [items, setItems] = useState<BankInbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BankInbox | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/bank-inboxes');
      const json = await res.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleSave(values: InboxFormValues, id?: string) {
    const res = await fetch(id ? `/api/finance/bank-inboxes/${id}` : '/api/finance/bank-inboxes', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Помилка');
    }
    setEditing(null);
    fetchItems();
  }

  async function handleDelete(item: BankInbox) {
    if (!confirm(`Видалити ящик «${item.name}»?`)) return;
    await fetch(`/api/finance/bank-inboxes/${item.id}`, { method: 'DELETE' });
    fetchItems();
  }

  async function handleToggle(item: BankInbox) {
    await fetch(`/api/finance/bank-inboxes/${item.id}/toggle`, { method: 'PATCH' });
    fetchItems();
  }

  async function handleTest(item: BankInbox) {
    setBusyId(item.id);
    const res = await fetch(`/api/finance/bank-inboxes/${item.id}/test`, { method: 'POST' });
    const data = await res.json();
    setBusyId(null);
    if (data.ok) {
      alert(`✓ Підключення OK\nЛистів: ${data.mailbox.messages}\nНових: ${data.mailbox.unseen}`);
    } else {
      alert(`✗ Помилка: ${data.error}`);
    }
  }

  // Why the mailboxes stopped, when they have. A broken .env and a replaced
  // secret look identical from here — everything simply goes quiet — but one is
  // fixed by editing a file and the other means re-typing every password.
  const [diag, setDiag] = useState<any>(null);
  useEffect(() => {
    fetch('/api/finance/bank-inboxes/diagnostics')
      .then(r => r.json())
      .then(d => { if (d.ok) setDiag(d); })
      .catch(() => { /* a missing diagnosis must not break the page */ });
  }, [items]);

  // Emails the poller read but could not import. last_uid moved past them, so
  // an ordinary "read now" will not go back for them — only a re-read will.
  const [skipped, setSkipped] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const counts: Record<string, number> = {};
      for (const it of items) {
        try {
          const r = await fetch(`/api/finance/bank-inboxes/${it.id}/skipped`);
          const d = await r.json();
          if (d.ok) counts[it.id] = (d.skipped || []).length;
        } catch { /* a missing count must not break the page */ }
      }
      if (!cancelled) setSkipped(counts);
    })();
    return () => { cancelled = true; };
  }, [items]);

  async function handleRescan(item: BankInbox) {
    const n = skipped[item.id] || 0;
    let body: Record<string, number> = {};
    if (n > 0) {
      const msg = `Перечитати «${item.name}»?\n\n${n} лист(ів) прийшли, але не потрапили у фінанси — розбір не вдався або не знайшовся рахунок за IBAN. Листи досі в скриньці.\n\nПовторні операції не створюються.`;
      if (!confirm(msg)) return;
    } else {
      // Nothing recorded as skipped means the losses happened before this
      // list existed — which is exactly the case worth recovering. Guessing a
      // starting point costs real time and real money: every re-read PDF goes
      // through the LLM extractor. So ask for the number instead of picking
      // one. The last successful statement's UID is in its file name.
      const answer = window.prompt(
        `Перечитати «${item.name}» — з якого листа почати?\n\n`
        + `Вкажіть UID листа. Перечитування почнеться з нього і піде до кінця скриньки.\n`
        + `Номер останньої вдалої виписки видно в її імені файлу (…uid395.xml).\n\n`
        + `Повторні операції не створюються.`,
        String(item.last_uid ? Math.max(1, item.last_uid - 40) : 1),
      );
      if (!answer) return;
      const uid = parseInt(answer, 10);
      if (!Number.isFinite(uid) || uid < 1) { alert('Потрібен номер листа (ціле число).'); return; }
      body = { from_uid: uid };
    }
    setBusyId(item.id);
    const res = await fetch(`/api/finance/bank-inboxes/${item.id}/rescan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusyId(null);
    if (!data.ok) { alert(`Помилка: ${data.error || 'unknown'}`); return; }
    if (!data.rescanned) { alert(data.message || 'Нічого перечитувати.'); return; }
    alert(
      `Перечитано з UID ${data.from_uid}\n\n`
      + `Листів прочитано: ${data.emails_read}\n`
      + `Імпортовано операцій: ${data.imported}\n`
      + `Вже були раніше: ${data.already_posted}\n`
      + `Досі без рахунку за IBAN: ${data.still_unmatched}\n`
      + `Залишилось нерозібраних: ${data.skipped_after} (було ${data.skipped_before})`
    );
    fetchItems();
  }

  async function handleRunNow(item: BankInbox) {
    if (!confirm(`Зчитати email зараз для «${item.name}»?`)) return;
    setBusyId(item.id);
    const res = await fetch(`/api/finance/bank-inboxes/${item.id}/run-now`, { method: 'POST' });
    const data = await res.json();
    setBusyId(null);
    if (data.ok) {
      alert(`Нових email: ${data.newEmails}\nІмпортовано операцій: ${data.imported}\nНе знайдено account по IBAN: ${data.unmatched}\nПомилок: ${data.errors.length}`);
      fetchItems();
    } else {
      alert(`Помилка: ${data.error || 'unknown'}`);
    }
  }

  return (
    <div>
      {diag && (!diag.secret.ok || diag.inboxes.some((i: any) => !i.can_decrypt)) && (
        <div style={{
          marginBottom: 16, padding: 14, borderRadius: 8,
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
          color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
            <AlertCircle size={14} style={{ verticalAlign: -2 }} /> Скриньки не читаються
          </div>
          {!diag.secret.ok ? (
            <>
              <div><strong>{diag.secret.problem}</strong></div>
              <div style={{ marginTop: 6 }}>
                Паролі при цьому цілі — треба полагодити лише <code>.env</code> на сервері.
                Часта причина: в кінці файлу немає переводу рядка, і дописана змінна
                приклеїлась до кінця цієї. Перевір, чи немає всередині значення ще одного{' '}
                <code>ЩОСЬ=</code>.
              </div>
            </>
          ) : (
            <>
              <div><strong>{diag.verdict}</strong></div>
              <div style={{ marginTop: 6 }}>
                {diag.inboxes.filter((i: any) => !i.can_decrypt).map((i: any) => (
                  <div key={i.id}>· {i.name} ({i.imap_user}) — {i.reason}</div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Банк-приймач (IMAP)</h2>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {items.filter((i) => i.is_active).length} активних / {items.length}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing('new')} style={btnAdd}>
          <Plus size={16} /> Додати ящик
        </button>
      </div>

      <div style={infoBox}>
        💡 Як це працює: ваш IMAP-ящик приймає виписки KB → ми парсимо XML → транзакції
        автоматично потрапляють у відповідний рахунок (за IBAN). Перед першим запуском
        додайте IBAN ваших рахунків у вкладці «Рахунки».
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
      ) : items.length === 0 ? (
        <div style={emptyStyle}>
          Жодного ящика. Натисніть «Додати ящик» щоб налаштувати IMAP-приймач для виписок KB.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{ ...cardStyle, opacity: item.is_active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Mail size={16} style={{ color: 'var(--text-secondary)' }} />
                <strong style={{ fontSize: 15 }}>{item.name}</strong>
                {item.is_active ? (
                  <span style={badgeOn}>увімкнено</span>
                ) : (
                  <span style={badgeOff}>вимкнено</span>
                )}
                {item.last_error && (
                  <span style={badgeError} title={item.last_error}><AlertCircle size={12} /> помилка</span>
                )}
                {!item.last_error && item.last_synced_at && (
                  <span style={badgeOk}><CheckCircle size={12} /> синхр.</span>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={() => handleTest(item)} disabled={busyId === item.id} style={iconBtn} title="Тест підключення">
                  {item.is_active ? <Wifi size={14} /> : <WifiOff size={14} />}
                </button>
                <button onClick={() => handleRunNow(item)} disabled={busyId === item.id || !item.is_active} style={{ ...iconBtn, color: '#22c55e' }} title="Зчитати зараз">
                  <Play size={14} />
                </button>
                <button onClick={() => setEditing(item)} style={iconBtn} title="Редагувати"><Pencil size={14} /></button>
                <button onClick={() => handleToggle(item)} style={iconBtn} title={item.is_active ? 'Вимкнути' : 'Увімкнути'}>
                  {item.is_active ? <WifiOff size={14} /> : <Wifi size={14} />}
                </button>
                <button
                  onClick={() => handleRescan(item)}
                  disabled={busyId === item.id}
                  style={iconBtn}
                  title="Перечитати скриньку — забирає листи, які прийшли, але не потрапили у фінанси"
                ><RotateCcw size={14} /></button>
                <button onClick={() => handleDelete(item)} style={{ ...iconBtn, color: '#dc2626' }} title="Видалити"><Trash2 size={14} /></button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, fontSize: 12 }}>
                <Field label="IMAP" value={`${item.imap_user}@${item.imap_host}:${item.imap_port}`} />
                <Field label="Папка" value={item.imap_folder} />
                <Field label="Sender" value={item.sender_filter || '(будь-який)'} />
                <Field label="Email отримано" value={`${item.emails_processed}`} />
                <Field label="Операцій імпортовано" value={`${item.operations_imported}`} />
                <Field label="Останній sync" value={formatDateTime(item.last_synced_at)} />
                <Field label="Останній email" value={formatDateTime(item.last_email_at)} />
                <Field label="Не потрапило у фінанси" value={`${skipped[item.id] ?? 0}`} />
              </div>

              {(skipped[item.id] || 0) > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(251,191,36,0.10)', borderRadius: 6, color: 'var(--accent-warning)', fontSize: 12 }}>
                  <strong>{skipped[item.id]} лист(ів) прийшли, але не імпортовані.</strong>{' '}
                  Звичайне «Зчитати зараз» їх не забере — воно читає лише нові. Натисніть «Перечитати».
                </div>
              )}

              {item.last_error && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(220,38,38,0.08)', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>
                  <strong>Помилка:</strong> {item.last_error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <BankInboxModal
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(vals) => handleSave(vals, editing !== 'new' ? editing.id : undefined)}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 500, marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

const btnAdd: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: 'var(--accent, #6366f1)', color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
};
const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-primary)', borderRadius: 10,
  padding: 14, background: 'var(--bg-primary)',
};
const infoBox: React.CSSProperties = {
  padding: 12, background: 'rgba(99,102,241,0.08)', borderRadius: 8,
  fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16,
};
const emptyStyle: React.CSSProperties = {
  padding: 40, textAlign: 'center', color: 'var(--text-secondary)',
  border: '1px dashed var(--border-primary)', borderRadius: 10,
};
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 6, margin: '0 2px',
  cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 6,
};
const badgeBase: React.CSSProperties = {
  fontSize: 10, padding: '2px 8px', borderRadius: 4, display: 'inline-flex',
  alignItems: 'center', gap: 4, textTransform: 'uppercase', fontWeight: 600,
};
const badgeOn = { ...badgeBase, background: 'rgba(34,197,94,0.15)', color: '#16a34a' };
const badgeOff = { ...badgeBase, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' };
const badgeError = { ...badgeBase, background: 'rgba(220,38,38,0.15)', color: '#dc2626' };
const badgeOk = { ...badgeBase, background: 'rgba(34,197,94,0.10)', color: '#16a34a' };
