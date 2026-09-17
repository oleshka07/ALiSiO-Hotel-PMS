'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ShieldCheck, ChevronLeft, Save, AlertTriangle } from 'lucide-react';

interface UbyportSettings {
  idub: string;
  zkratka: string;
  ubytovatel: string;
  kontakt: string;
  okres: string;
  obec: string;
  castObce: string;
  ulice: string;
  cisloDomovni: string;
  cisloOrientacni: string;
  psc: string;
  ucelPobytu: string;
}

const EMPTY: UbyportSettings = {
  idub: '', zkratka: '', ubytovatel: '', kontakt: '', okres: '', obec: '',
  castObce: '', ulice: '', cisloDomovni: '', cisloOrientacni: '', psc: '', ucelPobytu: '',
};

// Field 3.2 of the Provozní řád, in the order the A record carries them.
const FIELDS: Array<{ key: keyof UbyportSettings; label: string; hint: string; required?: boolean }> = [
  { key: 'idub', label: 'IDUB', hint: '12–14 znaků, přiděluje Služba cizinecké policie', required: true },
  { key: 'zkratka', label: 'Zkratka ubytovatele', hint: 'přesně 5 znaků, přiděluje SCP', required: true },
  { key: 'ubytovatel', label: 'Ubytovací zařízení', hint: '1–35 znaků', required: true },
  { key: 'ucelPobytu', label: 'Účel pobytu', hint: 'dvouciferný kód z číselníku účelu pobytu', required: true },
  { key: 'kontakt', label: 'Kontakt', hint: 'telefon nebo e-mail, max 50 znaků' },
  { key: 'okres', label: 'Okres', hint: 'v Praze obvod, max 32 znaků' },
  { key: 'obec', label: 'Obec', hint: 'max 48 znaků' },
  { key: 'castObce', label: 'Část obce', hint: 'max 48 znaků' },
  { key: 'ulice', label: 'Ulice', hint: 'název veřejného prostranství, max 48 znaků' },
  { key: 'cisloDomovni', label: 'Číslo domovní', hint: 'max 5 znaků' },
  { key: 'cisloOrientacni', label: 'Číslo orientační', hint: 'max 4 znaky' },
  { key: 'psc', label: 'PSČ', hint: '5 číslic' },
];

export default function UbyportSettingsPage() {
  const [data, setData] = useState<UbyportSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ubyport-settings');
      if (res.ok) setData({ ...EMPTY, ...(await res.json()) });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ubyport-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Помилка ${res.status}`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const invalid: string[] = [];
  if (data.idub && !/^[A-Za-z0-9]{12,14}$/.test(data.idub)) invalid.push('IDUB');
  if (data.zkratka && !/^[A-Za-z0-9]{5}$/.test(data.zkratka)) invalid.push('Zkratka');
  if (data.ucelPobytu && !/^\d{2}$/.test(data.ucelPobytu)) invalid.push('Účel pobytu');

  return (
    <div className="uby-page">
      <Link href="/settings" className="uby-back"><ChevronLeft size={16} /> Налаштування</Link>

      <div className="uby-head">
        <ShieldCheck size={26} />
        <div>
          <h1>Ubyport — дані закладу</h1>
          <p>Záznam typu A у файлі .unl. Ці дані йдуть у кожну дявку до Cizinecké policie.</p>
        </div>
      </div>

      {loading ? (
        <p className="uby-loading">Завантаження…</p>
      ) : (
        <>
          <div className="uby-grid">
            {FIELDS.map((f) => (
              <label key={f.key} className="uby-field">
                <span className="uby-label">
                  {f.label}{f.required && <em> *</em>}
                </span>
                <input
                  type="text"
                  value={data[f.key]}
                  onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))}
                />
                <span className="uby-hint">{f.hint}</span>
              </label>
            ))}
          </div>

          {invalid.length > 0 && (
            <div className="uby-warn">
              <AlertTriangle size={15} /> Невірний формат: {invalid.join(', ')}
            </div>
          )}
          {error && <div className="uby-error">{error}</div>}

          <button className="uby-save" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? 'Зберігаю…' : saved ? 'Збережено' : 'Зберегти'}
          </button>
        </>
      )}

      <style jsx>{`
        .uby-page { padding: 24px; max-width: 900px; }
        .uby-back {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 13px; color: #475569; text-decoration: none; margin-bottom: 16px;
        }
        .uby-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 24px; color: #1d4ed8; }
        .uby-head h1 { margin: 0; font-size: 22px; color: #0f172a; }
        .uby-head p { margin: 4px 0 0; font-size: 13px; color: #475569; }
        .uby-loading { color: #64748b; font-size: 14px; }
        .uby-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px; margin-bottom: 18px;
        }
        .uby-field { display: flex; flex-direction: column; gap: 4px; }
        .uby-label { font-size: 12px; font-weight: 600; color: #334155; }
        .uby-label em { color: #dc2626; font-style: normal; }
        .uby-field input {
          padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 8px;
          font-size: 14px; color: #0f172a; background: #fff;
        }
        .uby-hint { font-size: 11px; color: #6e6e73; }
        .uby-warn, .uby-error {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 14px;
        }
        .uby-warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
        .uby-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
        .uby-save {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 20px; background: #1d4ed8; color: #fff;
          border: none; border-radius: 9px; font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .uby-save:disabled { background: #94a3b8; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
