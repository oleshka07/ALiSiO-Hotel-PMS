'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square, Flame, Sparkles, UserCheck, ShieldAlert, Check, RefreshCw } from 'lucide-react';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface Checklist {
  id: string;
  title: string;
  subtitle: string;
  role: string;
  is_sauna?: boolean;
  items: ChecklistItem[];
}

interface DirtyUnit {
  id: string;
  code: string;
  name: string;
  cleaning_status: string;
}

const CLEANER_ITEMS = [
  '🛏️ Заміна білизни та рушників',
  '🚿 Дезінфекція та мийка санвузла',
  '🧹 Вологе прибирання підлоги',
  '🗑️ Спорожнення кошиків сміття',
  '🧴 Поповнення засобів гігієни',
];

export default function MobileShiftChecklists() {
  const [role, setRole] = useState<'admin' | 'cleaner'>('admin');
  const [data, setData] = useState<{
    hasSaunaToday: boolean;
    checklists: Checklist[];
    dirtyUnits: DirtyUnit[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Local state for toggling items
  const [itemsState, setItemsState] = useState<Record<string, boolean>>({});
  const [cleanerProgress, setCleanerProgress] = useState<Record<string, Record<number, boolean>>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/checklists');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        // Initialize local state
        const initial: Record<string, boolean> = {};
        json.checklists?.forEach((c: Checklist) => {
          c.items.forEach(i => { initial[`${c.id}-${i.id}`] = i.done; });
        });
        setItemsState(initial);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleItem = (key: string) => {
    setItemsState(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCleanerStep = (unitId: string, idx: number) => {
    setCleanerProgress(prev => {
      const unit = prev[unitId] || {};
      return {
        ...prev,
        [unitId]: { ...unit, [idx]: !unit[idx] }
      };
    });
  };

  const markUnitClean = async (unitId: string) => {
    try {
      await fetch(`/api/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleaning_status: 'clean' }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '12px 14px', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border-primary)' }}>
        <div className="animate-pulse" style={{ height: 20, width: 140, background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 8 }} />
        <div className="animate-pulse" style={{ height: 40, background: 'var(--bg-tertiary)', borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      {/* Role Switcher Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          📋 Чек-листи Зміни
        </div>
        <div style={{ display: 'flex', background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--border-primary)' }}>
          <button
            onClick={() => setRole('admin')}
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              background: role === 'admin' ? 'var(--accent-primary)' : 'transparent',
              color: role === 'admin' ? '#fff' : 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            Адміністратор
          </button>
          <button
            onClick={() => setRole('cleaner')}
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              background: role === 'cleaner' ? '#14b8a6' : 'transparent',
              color: role === 'cleaner' ? '#fff' : 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            Прибиральниця
          </button>
        </div>
      </div>

      {/* ADMIN VIEW */}
      {role === 'admin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data?.checklists.map(c => {
            const isSauna = c.is_sauna;
            return (
              <div
                key={c.id}
                style={{
                  background: isSauna
                    ? 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(245,158,11,0.1) 100%)'
                    : 'var(--bg-card)',
                  border: isSauna ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--border-primary)',
                  borderRadius: 14,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: isSauna ? '#ef4444' : 'var(--text-primary)' }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.subtitle}</div>
                  </div>
                  {isSauna && (
                    <span style={{ fontSize: 10, fontWeight: 800, background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: 6 }}>
                      УВАГА
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {c.items.map(item => {
                    const key = `${c.id}-${item.id}`;
                    const isDone = itemsState[key];
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 8px',
                          borderRadius: 8,
                          background: isDone ? 'rgba(34,197,94,0.1)' : 'var(--bg-tertiary)',
                          cursor: 'pointer',
                        }}
                      >
                        {isDone ? (
                          <CheckSquare size={17} style={{ color: '#22c55e', flexShrink: 0 }} />
                        ) : (
                          <Square size={17} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: 13, color: isDone ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: isDone ? 'line-through' : 'none' }}>
                          {item.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CLEANER SELF-CONTROL VIEW */}
      {role === 'cleaner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(!data?.dirtyUnits || data.dirtyUnits.length === 0) ? (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', background: 'var(--bg-card)', padding: '14px', borderRadius: 12, border: '1px solid var(--border-primary)', textAlign: 'center' }}>
              ✨ Усі номери прибрано! Немає активних задач.
            </div>
          ) : (
            data.dirtyUnits.map(unit => {
              const unitProg = cleanerProgress[unit.id] || {};
              const completedCount = CLEANER_ITEMS.filter((_, idx) => unitProg[idx]).length;
              const allDone = completedCount === CLEANER_ITEMS.length;

              return (
                <div
                  key={unit.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 14,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        Номер {unit.code} ({unit.name})
                      </div>
                      <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                        Чек-лист прибирання ({completedCount}/{CLEANER_ITEMS.length})
                      </div>
                    </div>
                    {allDone ? (
                      <button
                        onClick={() => markUnitClean(unit.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#22c55e',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Check size={14} /> Прибрано!
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 6 }}>
                        В процесі
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {CLEANER_ITEMS.map((itemText, idx) => {
                      const isDone = Boolean(unitProg[idx]);
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleCleanerStep(unit.id, idx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '6px 8px',
                            borderRadius: 8,
                            background: isDone ? 'rgba(34,197,94,0.1)' : 'var(--bg-tertiary)',
                            cursor: 'pointer',
                          }}
                        >
                          {isDone ? (
                            <CheckSquare size={16} style={{ color: '#22c55e' }} />
                          ) : (
                            <Square size={16} style={{ color: 'var(--text-tertiary)' }} />
                          )}
                          <span style={{ fontSize: 13, color: isDone ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: isDone ? 'line-through' : 'none' }}>
                            {itemText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
