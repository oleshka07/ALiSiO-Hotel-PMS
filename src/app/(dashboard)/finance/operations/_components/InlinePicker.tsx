'use client';

import { useState, useRef, useEffect } from 'react';

export interface InlinePickerOption {
  id: string;
  name: string;
  icon?: string | null;
}

interface Props {
  /** Current selected option id, or null when not set */
  value: string | null;
  /** Display name to show when value is set (already enriched on the row) */
  displayName: string | null;
  displayIcon?: string | null;
  /** Pickable options. Filtered by parent (e.g. categories of matching op_type). */
  options: InlinePickerOption[];
  /** Called when user picks an option. Should PATCH the operation. */
  onPick: (optionId: string) => Promise<void> | void;
  /** Called when user clears the value. Optional — hides the «×» button. */
  onClear?: () => Promise<void> | void;
  placeholder?: string;
}

/**
 * Click-to-edit cell for the operations table. Renders as either:
 *   - the current value with subtle hover styling, or
 *   - a green «Вказати» pill when value is null.
 *
 * Click opens a small dropdown of options. Picking one calls onPick and
 * the parent re-fetches. Stops click propagation so the row's edit
 * handler doesn't fire.
 */
export default function InlinePicker({
  value,
  displayName,
  displayIcon,
  options,
  onPick,
  onClear,
  placeholder = 'Вказати',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = search.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div
      ref={ref}
      style={{ position: 'relative', display: 'inline-block' }}
      onClick={(e) => e.stopPropagation()}
    >
      {value ? (
        <span
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {displayIcon && <span>{displayIcon}</span>}
          {displayName}
        </span>
      ) : (
        <span
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(34,197,94,0.12)', color: '#16a34a',
            fontSize: 11, fontWeight: 600, border: '1px dashed rgba(34,197,94,0.4)',
          }}
        >
          {placeholder}
        </span>
      )}

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            minWidth: 220, maxHeight: 280, overflowY: 'auto',
            background: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
          }}
        >
          <input
            autoFocus
            placeholder="Пошук..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', border: 'none',
              borderBottom: '1px solid var(--border-primary)', fontSize: 13,
              background: 'transparent', color: 'var(--text-primary)',
            }}
          />
          {filtered.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
              Нічого не знайдено
            </div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.id}
                onClick={async () => {
                  setOpen(false);
                  setSearch('');
                  await onPick(opt.id);
                }}
                style={{
                  padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {opt.icon && <span>{opt.icon}</span>}
                <span style={{ flex: 1 }}>{opt.name}</span>
                {opt.id === value && <span style={{ color: '#22c55e' }}>✓</span>}
              </div>
            ))
          )}
          {value && onClear && (
            <div
              onClick={async () => {
                setOpen(false);
                await onClear();
              }}
              style={{
                padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                color: '#ef4444', borderTop: '1px solid var(--border-primary)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              × Очистити
            </div>
          )}
        </div>
      )}
    </div>
  );
}
