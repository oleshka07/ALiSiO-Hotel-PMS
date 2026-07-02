'use client';

import { useEffect, useRef, useState } from 'react';
import { Tag as TagIcon, X } from 'lucide-react';

interface Tag { id: string; name: string; color: string | null }

export default function TagFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/finance/tags')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setTags(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (tags.length === 0) return null;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          borderRadius: 8, border: '1px solid var(--border-color, #e2e8f0)',
          background: selected.length > 0 ? 'var(--accent-light, #eef2ff)' : 'transparent',
          fontSize: 13, cursor: 'pointer', color: 'var(--text-primary, #0f172a)',
        }}
      >
        <TagIcon size={14} />
        {selected.length > 0 ? `Теги: ${selected.length}` : 'Теги'}
        {selected.length > 0 && (
          <X size={13} onClick={(e) => { e.stopPropagation(); onChange([]); }} />
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 50, minWidth: 200,
          background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {tags.map((t) => (
            <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color || '#94a3b8', flexShrink: 0 }} />
              {t.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
