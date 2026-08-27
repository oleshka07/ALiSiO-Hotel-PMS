'use client';

import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import type { BankInbox } from './BankInboxesTab';

export interface InboxFormValues {
  name: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password?: string;
  imap_folder: string;
  use_tls: boolean;
  sender_filter?: string;
  subject_filter?: string;
  attachment_format: string;
  attachment_password?: string;
  is_active?: boolean;
}

interface Props {
  initial?: BankInbox;
  onClose: () => void;
  onSave: (v: InboxFormValues) => Promise<void>;
}

export default function BankInboxModal({ initial, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name || 'KB Mail Inbox');
  const [host, setHost] = useState(initial?.imap_host || 'imap.gmail.com');
  const [port, setPort] = useState(initial?.imap_port ?? 993);
  const [user, setUser] = useState(initial?.imap_user || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [folder, setFolder] = useState(initial?.imap_folder || 'INBOX');
  const [useTls, setUseTls] = useState(initial?.use_tls === undefined ? true : !!initial.use_tls);
  const [sender, setSender] = useState(initial?.sender_filter || 'kb.cz');
  const [subject, setSubject] = useState(initial?.subject_filter || '');
  const [format, setFormat] = useState(initial?.attachment_format || 'auto');
  // Česká spořitelna encrypts its PDFs; KB does not. Left blank the field
  // changes nothing, so an existing inbox is never disturbed by opening it.
  const [attachPw, setAttachPw] = useState('');
  const [clearAttachPw, setClearAttachPw] = useState(false);
  const [isActive, setIsActive] = useState(initial ? !!initial.is_active : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !host || !user) { setError('Заповніть обов\'язкові поля'); return; }
    if (!initial && !password) { setError('Пароль обов\'язковий при створенні'); return; }

    setSaving(true);
    try {
      const values: InboxFormValues = {
        name: name.trim(), imap_host: host.trim(), imap_port: Number(port) || 993,
        imap_user: user.trim(),
        imap_folder: folder.trim() || 'INBOX', use_tls: useTls,
        sender_filter: sender.trim() || undefined,
        subject_filter: subject.trim() || undefined,
        attachment_format: format,
        is_active: isActive,
      };
      if (password) values.imap_password = password;
      if (attachPw) values.attachment_password = attachPw;
      else if (clearAttachPw) values.attachment_password = '';
      await onSave(values);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1 }}>{initial ? 'Редагувати ящик' : 'Новий банк-приймач'}</h3>
          <button type="button" onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        <Field label="Назва (для зручності)">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={input} autoFocus />
        </Field>

        <div style={infoBox}>
          📬 Налаштування IMAP вашого поштового сервера. Для Gmail: <code>imap.gmail.com:993</code>, потрібен <strong>App Password</strong> (не пароль від акаунту).
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <Field label="IMAP сервер">
            <input type="text" value={host} onChange={(e) => setHost(e.target.value)} style={input} placeholder="imap.gmail.com" />
          </Field>
          <Field label="Порт">
            <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} style={input} />
          </Field>
        </div>

        <Field label="Email (User)">
          <input type="email" value={user} onChange={(e) => setUser(e.target.value)} style={input} placeholder="o.stepeniev@gmail.com" />
        </Field>

        <Field label={initial ? 'App Password (залиште порожнім якщо не змінюєте)' : 'App Password (16 символів від Gmail)'}>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...input, paddingRight: 36 }}
              placeholder={initial ? '••••••••••••••••' : 'Скопіюйте з менеджера паролів'}
              autoComplete="off"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtn}>
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
          <Field label="Папка">
            <input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} style={input} placeholder="INBOX" />
          </Field>
          <Field label="TLS / SSL">
            <select value={useTls ? '1' : '0'} onChange={(e) => setUseTls(e.target.value === '1')} style={input}>
              <option value="1">Так (рекомендовано)</option>
              <option value="0">Ні</option>
            </select>
          </Field>
          {/* Kept because the column exists and is written, but the engine has
              never read it: it recognises XML, CSV and PDF from the attachment
              itself. The old label said "auto (XML/CSV)", which read as "PDF is
              not supported" and made an operator hesitate over a setting that
              changes nothing. */}
          <Field label="Формат вкладення">
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={input}>
              <option value="auto">auto — XML, CSV і PDF</option>
              <option value="xml">XML (CAMT.053)</option>
              <option value="csv">CSV</option>
            </select>
            <div style={hintStyle}>
              Тип визначається за самим вкладенням, тож <code>auto</code> підходить
              будь-якому банку. PDF розпізнається завжди.
            </div>
          </Field>
        </div>

        <div style={sectionDivider}>Фільтри (рекомендовано — захист від випадкових email)</div>

        <Field label="Sender filter (substring у From)">
          <input type="text" value={sender} onChange={(e) => setSender(e.target.value)} style={input} placeholder="kb.cz" />
          <div style={hintStyle}>Email обробляється тільки якщо sender містить цей рядок (напр. <code>noreply@kb.cz</code> або просто <code>kb.cz</code>).</div>
        </Field>

        <Field label="Subject filter (опц.)">
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={input} placeholder="напр. Výpis z účtu" />
          <div style={hintStyle}>Якщо вказано — обробляються тільки email з таким текстом у темі.</div>
        </Field>

        <div style={sectionDivider}>Пароль на вкладенні (тільки для банків, які шифрують PDF)</div>

        <Field label={(initial as any)?.has_attachment_password ? 'Пароль PDF — збережений, введіть новий щоб змінити' : 'Пароль PDF (опц.)'}>
          <input
            type="text" value={attachPw} onChange={(e) => { setAttachPw(e.target.value); setClearAttachPw(false); }}
            style={input} placeholder="напр. 7031" autoComplete="off"
          />
          <div style={hintStyle}>
            Česká spořitelna надсилає виписки як захищений PDF. Пароль — останні 4 цифри IČO
            власника рахунку, він написаний у самому листі. KB та більшість інших банків
            пароля не ставлять — тоді лишіть порожнім.
          </div>
          {(initial as any)?.has_attachment_password && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6 }}>
              <input type="checkbox" checked={clearAttachPw}
                onChange={(e) => { setClearAttachPw(e.target.checked); if (e.target.checked) setAttachPw(''); }} />
              Прибрати збережений пароль
            </label>
          )}
        </Field>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Активний (буде синхронізуватися автоматично кожні 15 хв)
        </label>

        {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnSec}>Відміна</button>
          <button type="submit" disabled={saving} style={btnPrim}>{saving ? 'Збереження…' : initial ? 'Зберегти' : 'Створити'}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const modalStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 580, maxHeight: '92vh', overflowY: 'auto',
  border: '1px solid var(--border-primary)',
};
const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border-primary)',
  borderRadius: 8, fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 };
const btnPrim: React.CSSProperties = { padding: '9px 18px', background: 'var(--accent, #6366f1)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const btnSec: React.CSSProperties = { padding: '9px 18px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, cursor: 'pointer' };
const eyeBtn: React.CSSProperties = {
  position: 'absolute', right: 8, top: 8, background: 'transparent', border: 'none',
  cursor: 'pointer', color: 'var(--text-secondary)', padding: 4,
};
const infoBox: React.CSSProperties = {
  padding: 10, background: 'rgba(99,102,241,0.08)', borderRadius: 6,
  fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12,
};
const sectionDivider: React.CSSProperties = {
  marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: 600,
  color: 'var(--text-secondary)', textTransform: 'uppercase',
  paddingTop: 10, borderTop: '1px solid var(--border-primary)',
};
const hintStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-secondary)', marginTop: 4,
};
