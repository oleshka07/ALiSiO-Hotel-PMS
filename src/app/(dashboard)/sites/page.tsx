'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Globe, Plus, Search, Trash2, ExternalLink, BarChart,
  Loader2, X, ToggleLeft, ToggleRight, Settings, Info
  
} from 'lucide-react';

/* ───── Types ───── */
interface BookingSite {
  id: string;
  name: string;
  type: 'widget' | 'self-hosted';
  currency: string;
  status: 'active' | 'paused' | 'deleted';
  listings_count: number;
  created_at: string;
}

/* ───── Modal ───── */
function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ───── Status badge ───── */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:  { label: 'Активний',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  paused:  { label: 'Призупинено', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  deleted: { label: 'Видалено',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const TYPE_LABELS: Record<string, string> = {
  widget: 'Віджет',
  'self-hosted': 'Self-hosted',
};

function fmt(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ───── Main Page ───── */
export default function SitesPage() {
  const router = useRouter();
  const onMenuClick = useMobileMenu();

  const [sites, setSites] = useState<BookingSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  /* create modal */
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'widget' | 'self-hosted'>('widget');
  const [newCurrency, setNewCurrency] = useState('CZK');
  const [creating, setCreating] = useState(false);

  /* edit modal */
  const [showEdit, setShowEdit] = useState(false);
  const [editSiteId, setEditSiteId] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'widget' | 'self-hosted'>('widget');
  const [editCurrency, setEditCurrency] = useState('CZK');
  const [savingEdit, setSavingEdit] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  /* ── fetch ── */
  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/booking-sites');
      const data = await res.json();
      if (Array.isArray(data.sites)) setSites(data.sites);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  /* ── create ── */
  const handleCreate = async () => {
    if (!newName.trim()) { alert('Введіть назву сайту'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/booking-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType, currency: newCurrency }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Сайт створено!');
        setShowCreate(false);
        setNewName('');
        fetchSites();
        router.push(`/sites/${data.site.id}`);
      } else {
        alert(data.error || 'Помилка создання');
      }
    } catch { alert('Помилка мережі'); }
    finally { setCreating(false); }
  };

  /* ── edit ── */
  const handleEdit = async () => {
    if (!editName.trim()) { alert('Введіть назву сайту'); return; }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/booking-sites/${editSiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), type: editType, currency: editCurrency }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Сайт оновлено!');
        setShowEdit(false);
        fetchSites();
      } else {
        alert(data.error || 'Помилка оновлення');
      }
    } catch { alert('Помилка мережі'); }
    finally { setSavingEdit(false); }
  };

  /* ── toggle status ── */
  const toggleStatus = async (site: BookingSite) => {
    const nextStatus = site.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`/api/booking-sites/${site.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(nextStatus === 'active' ? 'Сайт активовано' : 'Сайт призупинено');
      fetchSites();
    } catch { alert('Помилка'); }
  };

  /* ── delete ── */
  const handleDelete = async (site: BookingSite) => {
    if (!confirm(`Видалити сайт «${site.name}»? Це незворотно.`)) return;
    await fetch(`/api/booking-sites/${site.id}`, { method: 'DELETE' });
    showToast('Сайт видалено');
    fetchSites();
  };

  /* ── toast ── */
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  /* ── filter ── */
  const filtered = sites.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  /* ── render ── */
  return (
    <>
      <Header title="Сайти бронювання" onMenuClick={onMenuClick} />

      <div className="app-content">

        
        {/* Hero / Intro блок */}
        {!showSplash ? (
          <div style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Globe size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                Сайти прямого бронювання
                <button onClick={() => setShowSplash(true)} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }} title="Показати довідку">
                  <Info size={16} />
                </button>
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => router.push('/sites/all')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart size={16} /> Всі джерела (Аналітика)
              </button>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={16} /> Новий сайт
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: '24px 28px',
            marginBottom: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ maxWidth: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Globe size={22} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Сайти прямого бронювання
                    <button onClick={() => setShowSplash(false)} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center' }} title="Приховати довідку">
                      <Info size={16} />
                    </button>
                  </h2>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 10px' }}>
                  Створіть власний сайт для прямого бронювання короткострокової оренди.
                  Керуйте оголошеннями, тарифними планами та правилами бронювання в одному місці.
                  Виберіть дизайн, підключіть онлайн-оплату через Stripe або PayPal і приймайте
                  бронювання без посередників.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                  {[
                    '💳 Stripe та PayPal з коробки',
                    '🎨 Налаштування стилю та дизайну',
                    '📦 Підтримка оголошень та тарифних планів',
                    '🔗 Вбудований і self-hosted режими',
                  ].map(f => (
                    <span key={f} style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{f}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => router.push('/sites/all')} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  <BarChart size={16} /> Всі джерела (Аналітика)
                </button>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  <Plus size={16} /> Новий сайт
                </button>
              </div>
            </div>
          </div>
        )}

            {/* Пошук */}
            {(sites.length > 0 || search) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input
                    className="form-input"
                    placeholder="Пошук сайтів..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: 32, width: 260 }}
                  />
                </div>
              </div>
            )}

            {/* Таблиця / Empty state */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                <Loader2 size={32} className="spin" style={{ color: 'var(--accent-primary)' }} />
              </div>
            ) : filtered.length === 0 && search ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 15, marginBottom: 8 }}>Сайтів не знайдено</div>
                <div style={{ fontSize: 13 }}>Спробуйте змінити запит</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <Globe size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Сайтів ще немає</div>
                <div style={{ fontSize: 13 }}>Натисніть «Новий сайт» щоб почати</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Назва</th>
                      <th>Тип</th>
                      <th>Оголошень</th>
                      <th>Валюта</th>
                      <th>Статус</th>
                      <th>Створено</th>
                      <th style={{ textAlign: 'right' }}>Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(site => {
                      const st = STATUS_CONFIG[site.status] || STATUS_CONFIG.active;
                      return (
                        <tr
                          key={site.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => router.push(`/sites/${site.id}`)}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Globe size={16} style={{ color: 'var(--accent-primary)' }} />
                              <span style={{ fontWeight: 600 }}>{site.name}</span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                              {TYPE_LABELS[site.type] || site.type}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-info">{site.listings_count}</span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{site.currency}</td>
                          <td>
                            <span style={{
                              fontSize: 12, fontWeight: 600, padding: '3px 10px',
                              borderRadius: 99, background: st.bg, color: st.color,
                            }}>
                              {st.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmt(site.created_at)}</td>
                          <td>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }} onClick={e => e.stopPropagation()}>
                              <button
                                className="btn btn-ghost"
                                title={site.status === 'active' ? 'Призупинити' : 'Активувати'}
                                onClick={() => toggleStatus(site)}
                                style={{ padding: '4px 8px' }}
                              >
                                {site.status === 'active'
                                  ? <ToggleRight size={18} style={{ color: '#22c55e' }} />
                                  : <ToggleLeft size={18} style={{ color: 'var(--text-tertiary)' }} />
                                }
                              </button>
                              <button
                                className="btn btn-ghost"
                                title="Налаштування"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditSiteId(site.id);
                                  setEditName(site.name);
                                  setEditType(site.type);
                                  setEditCurrency(site.currency);
                                  setShowEdit(true);
                                }}
                                style={{ padding: '4px 8px' }}
                              >
                                <Settings size={16} />
                              </button>
                              <button
                                className="btn btn-ghost"
                                title="Відкрити"
                                onClick={() => router.push(`/sites/${site.id}`)}
                                style={{ padding: '4px 8px' }}
                              >
                                <ExternalLink size={16} />
                              </button>
                              <button
                                className="btn btn-ghost"
                                title="Видалити"
                                onClick={() => handleDelete(site)}
                                style={{ padding: '4px 8px', color: '#ef4444' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Create Modal */}
            <Modal
              open={showCreate}
              onClose={() => setShowCreate(false)}
              title="Новий сайт бронювання"
              footer={
                <>
                  <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Скасувати</button>
                  <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                    {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                    Створити
                  </button>
                </>
              }
            >
              <div className="form-group">
                <label className="form-label">Назва сайту *</label>
                <input
                  className="form-input"
                  placeholder="Наприклад: Glamping ALiSiO"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Тип</label>
                  <select className="form-select" value={newType} onChange={e => setNewType(e.target.value as 'widget' | 'self-hosted')}>
                    <option value="widget">Лише віджет</option>
                    <option value="self-hosted">Self-hosted</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Валюта</label>
                  <select className="form-select" value={newCurrency} onChange={e => setNewCurrency(e.target.value)}>
                    <option value="CZK">CZK</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="UAH">UAH</option>
                  </select>
                </div>
              </div>
              {/* Type explanation */}
              <div style={{ marginBottom: 8, padding: '12px 16px', borderRadius: 10, fontSize: 13, border: '1px solid var(--border-primary)', background: 'var(--surface-secondary)', lineHeight: 1.5 }}>
                {newType === 'self-hosted' ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>🌐 Повноцінний сайт</div>
                    Вибирайте цей варіант, <span style={{color:'var(--accent-primary)',fontWeight:600}}>якщо у вас немає свого сайту</span>. Ми створимо окрему сторінку з усіма вашими будиночками на нашому домені.
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>📌 Тільки віджет</div>
                    Вибирайте цей варіант, <span style={{color:'var(--accent-primary)',fontWeight:600}}>якщо у вас вже є свій сайт</span> (Wix, WordPress тощо). Ви отримаєте код, який просто вставите на свою сторінку.
                  </>
                )}
              </div>
              <div style={{ marginTop: 8, padding: '12px 16px', background: 'var(--surface-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                💡 Після створення ви зможете налаштувати оголошення, дизайн, тарифні плани та інсталяційний код.
              </div>
            </Modal>

            {/* Edit Modal */}
            <Modal
              open={showEdit}
              onClose={() => setShowEdit(false)}
              title="Налаштування сайту"
              footer={
                <>
                  <button className="btn btn-ghost" onClick={() => setShowEdit(false)}>Скасувати</button>
                  <button className="btn btn-primary" onClick={handleEdit} disabled={savingEdit}>
                    {savingEdit ? <Loader2 size={16} className="spin" /> : <Settings size={16} />}
                    Зберегти
                  </button>
                </>
              }
            >
              <div className="form-group">
                <label className="form-label">Назва сайту *</label>
                <input
                  className="form-input"
                  placeholder="Наприклад: Glamping ALiSiO"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEdit()}
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Тип</label>
                  <select className="form-select" value={editType} onChange={e => setEditType(e.target.value as 'widget' | 'self-hosted')}>
                    <option value="widget">Лише віджет</option>
                    <option value="self-hosted">Self-hosted</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Валюта</label>
                  <select className="form-select" value={editCurrency} onChange={e => setEditCurrency(e.target.value)}>
                    <option value="CZK">CZK</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="UAH">UAH</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Посилання на сайт</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/w/${editSiteId}`}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/w/${editSiteId}`);
                      showToast('Посилання скопійовано');
                    }}
                  >
                    Копіювати
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => window.open(`/w/${editSiteId}`, '_blank')}
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            </Modal>

      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#22c55e', color: '#fff', padding: '12px 20px',
          borderRadius: 8, fontWeight: 600, fontSize: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}
