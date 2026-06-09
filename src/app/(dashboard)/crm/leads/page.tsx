'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Search, Plus, RefreshCw, Loader2, Eye, Calendar,
  Phone, Mail, Download, Filter, X, Trash2,
  MessageSquare, ChevronLeft, ChevronRight, User, Truck, Tent,
} from 'lucide-react';
import '../crm.css';
import { STAGE_CONFIG, CHANNEL_ICONS, SOURCE_LABELS, PRIORITY_LABELS } from '@/modules/crm/constants';

const VEHICLE_ICONS: Record<string, string> = {
  car: '🚗', caravan: '🚐', motorhome: '🏕️', minibus: '🚌',
  motorcycle: '🏍️', quad: '🏎️', bicycle: '🚲', none: '🚶',
};

interface LeadRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  source: string;
  stage: string;
  priority: string;
  channel_name: string | null;
  channel_type: string | null;
  assigned_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  adults: number;
  children: number;
  estimated_value: number;
  currency: string;
  external_booking_id: string | null;
  camping_vehicle_type: string | null;
  camping_tent_type: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  conversation_count: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/* ================================================================
   Page
   ================================================================ */
/* ================================================================
   Add Lead Modal (from Pipeline)
   ================================================================ */
function AddLeadModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', whatsapp: '',
    source: 'manual', externalBookingId: '', priority: 'normal',
    checkInDate: '', checkOutDate: '', adults: 0, children: 0,
    estimatedValue: 0, unitTypePreference: '',
    campingVehicleType: '', campingTentType: '', campingElectricity: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!form.firstName) return;
    setSaving(true);
    try {
      const res = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        onCreated();
        onClose();
        setForm({
          firstName: '', lastName: '', email: '', phone: '', whatsapp: '',
          source: 'manual', externalBookingId: '', priority: 'normal',
          checkInDate: '', checkOutDate: '', adults: 0, children: 0,
          estimatedValue: 0, unitTypePreference: '',
          campingVehicleType: '', campingTentType: '', campingElectricity: false,
          notes: '',
        });
      }
    } catch (err: any) { console.error('Помилка створення ліда:', err); alert(err.message || 'Помилка створення ліда'); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Новий лід</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 14, marginBottom: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={14} /> Контактна інформація
            </h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ім&apos;я *</label>
                <input className="form-input" value={form.firstName}
                  onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Прізвище</label>
                <input className="form-input" value={form.lastName}
                  onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Телефон</label>
                <input className="form-input" value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
          </div>
          <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 14, marginBottom: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} /> Деталі бронювання
            </h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Джерело</label>
                <select className="form-select" value={form.source}
                  onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Пріоритет</label>
                <select className="form-select" value={form.priority}
                  onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                  <option value="low">Низький</option>
                  <option value="normal">Нормальний</option>
                  <option value="high">Високий</option>
                  <option value="urgent">Терміновий</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Заїзд</label>
                <input className="form-input" type="date" value={form.checkInDate}
                  onChange={e => setForm(p => ({ ...p, checkInDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Виїзд</label>
                <input className="form-input" type="date" value={form.checkOutDate}
                  onChange={e => setForm(p => ({ ...p, checkOutDate: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Дорослих</label>
                <input className="form-input" type="number" min={0} value={form.adults}
                  onChange={e => setForm(p => ({ ...p, adults: +e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Дітей</label>
                <input className="form-input" type="number" min={0} value={form.children}
                  onChange={e => setForm(p => ({ ...p, children: +e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Нотатки</label>
            <textarea className="form-input" rows={2} value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.firstName}>
            {saving ? <Loader2 size={14} className="animate-pulse" /> : <Plus size={14} />}
            Створити лід
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CrmLeadsPage() {
  const onMenuClick = useMobileMenu();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stageFilter) params.set('stage', stageFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const res = await fetch(`/api/crm/leads?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setTotal(data.total || 0);
      }
    } catch (err: any) { console.error('Помилка завантаження лідів:', err); showError(err.message || 'Помилка завантаження лідів'); }
    setLoading(false);
  }, [search, stageFilter, sourceFilter, priorityFilter, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Видалити лід "${name}"?`)) return;
    try {
      await fetch(`/api/crm/leads/${id}`, { method: 'DELETE' });
      fetchLeads();
    } catch (err: any) { console.error('Помилка видалення ліда:', err); showError(err.message || 'Помилка видалення ліда'); }
  };

  const totalPages = Math.ceil(total / limit);
  const hasFilters = stageFilter || sourceFilter || priorityFilter;

  return (
    <>
      {error && (
        <div style={{position:'fixed',top:20,right:20,background:'#ef4444',color:'white',padding:'12px 20px',borderRadius:8,zIndex:9999,maxWidth:400,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'}} onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}
      <Header title="Ліди" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Filters */}
        <div className="leads-filters">
          <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 400 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input className="form-input" placeholder="Пошук по імені, email, телефону, номеру бронювання..."
              style={{ paddingLeft: 34, height: 36, fontSize: 12 }} value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <select className="form-select" value={stageFilter} style={{ width: 150 }}
            onChange={e => { setStageFilter(e.target.value); setPage(0); }}>
            <option value="">Всі етапи</option>
            {Object.entries(STAGE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
          <select className="form-select" value={sourceFilter} style={{ width: 140 }}
            onChange={e => { setSourceFilter(e.target.value); setPage(0); }}>
            <option value="">Всі джерела</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{CHANNEL_ICONS[k]} {v}</option>
            ))}
          </select>
          <select className="form-select" value={priorityFilter} style={{ width: 140 }}
            onChange={e => { setPriorityFilter(e.target.value); setPage(0); }}>
            <option value="">Всі пріоритети</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {hasFilters && (
            <button className="btn btn-sm btn-ghost" onClick={() => {
              setStageFilter(''); setSourceFilter(''); setPriorityFilter(''); setPage(0);
            }}>
              <X size={14} /> Скинути
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={fetchLeads} title="Оновити">
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> Новий лід
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{
          display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16,
          fontSize: 12, color: 'var(--text-tertiary)',
        }}>
          <span>Всього: <strong style={{ color: 'var(--text-primary)' }}>{total}</strong></span>
          {stageFilter && <span>Етап: <strong style={{ color: STAGE_CONFIG[stageFilter]?.color }}>
            {STAGE_CONFIG[stageFilter]?.icon} {STAGE_CONFIG[stageFilter]?.label}
          </strong></span>}
        </div>

        {/* Table */}
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Ім&apos;я</th>
                <th>Контакт</th>
                <th>Етап</th>
                <th>Пріоритет</th>
                <th>Джерело</th>
                <th>Дати</th>
                <th>Гості</th>
                <th>Кемпінг</th>
                <th>Вартість</th>
                <th>Зовнішній ID</th>
                <th>Повідомлення</th>
                <th>Створено</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 48 }}>
                  <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block', color: 'var(--text-tertiary)' }} />
                </td></tr>
              )}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={14} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                  Лідів не знайдено
                </td></tr>
              )}
              {!loading && leads.map(lead => {
                const stage = STAGE_CONFIG[lead.stage];
                const prio = PRIORITY_LABELS[lead.priority];
                return (
                  <tr key={lead.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLead(lead)}>
                    <td>
                      <span className={`priority-dot ${lead.priority}`} />
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {lead.first_name} {lead.last_name || ''}
                        {lead.unread_count > 0 && <span className="crm-unread">{lead.unread_count}</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 180 }}>
                      {lead.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={10} /> {lead.phone}</div>}
                      {lead.email && <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}><Mail size={10} /> {lead.email}</div>}
                      {lead.whatsapp && lead.whatsapp !== lead.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>📱 {lead.whatsapp}</div>
                      )}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: `${stage?.color || '#6b7280'}15`,
                        color: stage?.color || '#6b7280',
                      }}>
                        {stage?.icon} {stage?.label || lead.stage}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: prio?.color || '#6b7280',
                      }}>
                        {prio?.label || lead.priority}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {CHANNEL_ICONS[lead.source] || '📨'} {SOURCE_LABELS[lead.source] || lead.source}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {lead.check_in_date
                        ? <span><Calendar size={10} style={{ verticalAlign: -1 }} /> {lead.check_in_date} → {lead.check_out_date || '?'}</span>
                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {lead.adults > 0 ? `${lead.adults} дор.` : ''}
                      {lead.children > 0 ? ` +${lead.children} діт.` : ''}
                      {lead.adults === 0 && lead.children === 0 && <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {lead.camping_vehicle_type && <span>{VEHICLE_ICONS[lead.camping_vehicle_type] || '🚗'}</span>}
                      {lead.camping_tent_type && lead.camping_tent_type !== 'none' && <span> ⛺</span>}
                      {!lead.camping_vehicle_type && !lead.camping_tent_type && <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                      {lead.estimated_value > 0
                        ? <span style={{ color: 'var(--accent-success)' }}>{lead.estimated_value.toLocaleString()} {lead.currency}</span>
                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace' }}>
                      {lead.external_booking_id || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>
                      {(lead.message_count || 0) > 0
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                            <MessageSquare size={12} /> {lead.message_count}
                          </span>
                        : <span style={{ color: 'var(--text-tertiary)' }}>0</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {lead.created_at?.split(' ')[0] || lead.created_at?.split('T')[0]}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <a href={`/crm/inbox?lead=${lead.id}`} className="btn btn-sm btn-ghost btn-icon" title="Діалог">
                          <MessageSquare size={14} />
                        </a>
                        <button className="btn btn-sm btn-ghost btn-icon" title="Видалити"
                          style={{ color: '#ef444480' }}
                          onClick={() => handleDelete(lead.id, `${lead.first_name} ${lead.last_name || ''}`)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 16, marginTop: 20, fontSize: 13,
          }}>
            <button className="btn btn-sm btn-secondary" disabled={page === 0}
              onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} /> Назад
            </button>
            <span style={{ color: 'var(--text-secondary)' }}>
              {page + 1} / {totalPages}
            </span>
            <button className="btn btn-sm btn-secondary" disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}>
              Далі <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* ═══════ LEAD DETAIL DRAWER ═══════ */}
        {selectedLead && (
          <>
            <div className="lead-drawer-overlay" onClick={() => setSelectedLead(null)} />
            <div className="lead-drawer">
              <div className="lead-drawer-header">
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                    {selectedLead.first_name} {selectedLead.last_name || ''}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {STAGE_CONFIG[selectedLead.stage]?.icon}{' '}
                    {STAGE_CONFIG[selectedLead.stage]?.label}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setSelectedLead(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="lead-drawer-body">
                {/* Contact */}
                <div className="lead-drawer-section">
                  <div className="lead-drawer-section-title"><User size={12} /> Контакт</div>
                  <div className="lead-info-grid">
                    {selectedLead.email && (
                      <div className="lead-info-item">
                        <div className="lead-info-label">Email</div>
                        <div className="lead-info-value">{selectedLead.email}</div>
                      </div>
                    )}
                    {selectedLead.phone && (
                      <div className="lead-info-item">
                        <div className="lead-info-label">Телефон</div>
                        <div className="lead-info-value">{selectedLead.phone}</div>
                      </div>
                    )}
                    {selectedLead.whatsapp && selectedLead.whatsapp !== selectedLead.phone && (
                      <div className="lead-info-item">
                        <div className="lead-info-label">WhatsApp</div>
                        <div className="lead-info-value">{selectedLead.whatsapp}</div>
                      </div>
                    )}
                    <div className="lead-info-item">
                      <div className="lead-info-label">Джерело</div>
                      <div className="lead-info-value">{CHANNEL_ICONS[selectedLead.source]} {SOURCE_LABELS[selectedLead.source] || selectedLead.source}</div>
                    </div>
                  </div>
                </div>

                {/* Booking details */}
                {(selectedLead.check_in_date || selectedLead.adults > 0) && (
                  <div className="lead-drawer-section">
                    <div className="lead-drawer-section-title"><Calendar size={12} /> Деталі</div>
                    <div className="lead-info-grid">
                      {selectedLead.check_in_date && (
                        <div className="lead-info-item">
                          <div className="lead-info-label">Дати</div>
                          <div className="lead-info-value">{selectedLead.check_in_date} → {selectedLead.check_out_date}</div>
                        </div>
                      )}
                      {selectedLead.adults > 0 && (
                        <div className="lead-info-item">
                          <div className="lead-info-label">Гості</div>
                          <div className="lead-info-value">{selectedLead.adults} дор. {selectedLead.children > 0 ? `+ ${selectedLead.children} діт.` : ''}</div>
                        </div>
                      )}
                      {selectedLead.estimated_value > 0 && (
                        <div className="lead-info-item">
                          <div className="lead-info-label">Вартість</div>
                          <div className="lead-info-value" style={{ color: 'var(--accent-success)' }}>
                            {selectedLead.estimated_value.toLocaleString()} {selectedLead.currency}
                          </div>
                        </div>
                      )}
                      {selectedLead.external_booking_id && (
                        <div className="lead-info-item">
                          <div className="lead-info-label">Зовнішній ID</div>
                          <div className="lead-info-value" style={{ fontFamily: 'monospace' }}>
                            {selectedLead.external_booking_id}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Camping */}
                {(selectedLead.camping_vehicle_type || selectedLead.camping_tent_type) && (
                  <div className="lead-drawer-section">
                    <div className="lead-drawer-section-title"><Truck size={12} /> Кемпінг</div>
                    <div className="lead-info-grid">
                      {selectedLead.camping_vehicle_type && (
                        <div className="lead-info-item">
                          <div className="lead-info-label">Транспорт</div>
                          <div className="lead-info-value">{VEHICLE_ICONS[selectedLead.camping_vehicle_type]} {selectedLead.camping_vehicle_type}</div>
                        </div>
                      )}
                      {selectedLead.camping_tent_type && (
                        <div className="lead-info-item">
                          <div className="lead-info-label">Намет</div>
                          <div className="lead-info-value">{selectedLead.camping_tent_type}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Stage change */}
                <div className="lead-drawer-section">
                  <div className="lead-drawer-section-title"><ChevronRight size={12} /> Змінити етап</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(STAGE_CONFIG).map(([id, stage]) => (
                      <button
                        key={id}
                        className={`btn btn-sm ${selectedLead.stage === id ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          fontSize: 11,
                          opacity: selectedLead.stage === id ? 1 : 0.8,
                          borderColor: selectedLead.stage === id ? stage.color : undefined,
                          background: selectedLead.stage === id ? stage.color : undefined,
                        }}
                        disabled={selectedLead.stage === id}
                        onClick={async () => {
                          try {
                            await fetch(`/api/crm/leads/${selectedLead.id}/stage`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ stage: id, trigger: 'manual' }),
                            });
                            setSelectedLead({ ...selectedLead, stage: id });
                            fetchLeads();
                          } catch (err: any) { console.error('Помилка зміни етапу:', err); showError(err.message || 'Помилка зміни етапу'); }
                        }}
                      >
                        {stage.icon} {stage.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
                  <a href={`/crm/inbox?lead=${selectedLead.id}`} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                    <MessageSquare size={14} /> Відкрити діалог
                  </a>
                </div>
              </div>
            </div>
          </>
        )}

        <AddLeadModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={fetchLeads} />
      </div>
    </>
  );
}
