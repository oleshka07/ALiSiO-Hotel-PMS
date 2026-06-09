'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Plus, Search, X, RefreshCw, Loader2, Eye, Calendar,
  Phone, Mail, MessageSquare, Check, LayoutGrid, List,
  ChevronRight, User, Clock, DollarSign, Truck, Tent,
} from 'lucide-react';
import './crm.css';
import { CHANNEL_ICONS, SOURCE_LABELS } from '@/modules/crm/constants';
import Guest360 from '@/modules/crm/components/Guest360';

/* ================================================================
   Types
   ================================================================ */
interface StageConfig {
  id: string;
  label: string;
  icon: string;
  color: string;
}

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
  reservation_status: string | null;
  payment_status: string | null;
  reservation_total: number | null;
  created_at: string;
  updated_at: string;
  conversation_count?: number;
  message_count?: number;
}

interface PipelineData {
  stages: StageConfig[];
  leads: LeadRow[];
  stageCounts: Record<string, number>;
  stats: {
    totalLeads: number;
    unreadLeads: number;
    totalValue: number;
    activeBookings: number;
    lostCount: number;
  };
}


const VEHICLE_ICONS: Record<string, string> = {
  car: '🚗',
  caravan: '🚐',
  motorhome: '🏕️',
  minibus: '🚌',
  motorcycle: '🏍️',
  quad: '🏎️',
  bicycle: '🚲',
  none: '🚶',
};

/* ================================================================
   Add Lead Modal
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
  const [dupWarning, setDupWarning] = useState<any>(null);

  if (!open) return null;

  const handleSubmit = async (skipDedup = false) => {
    if (!form.firstName) return;
    setSaving(true);
    setDupWarning(null);
    try {
      const res = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, skipDedup }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicate) {
        setDupWarning(data);
        setSaving(false);
        return;
      }
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
          {dupWarning && (
            <div style={{
              padding: '12px 16px', marginBottom: 16,
              background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)', fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#f59e0b' }}>⚠️ Знайдено збіг!</div>
              <div>{dupWarning.message}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button className="btn btn-sm btn-secondary" onClick={onClose}>Скасувати</button>
                <button className="btn btn-sm btn-primary" onClick={() => handleSubmit(true)}>Створити все одно</button>
              </div>
            </div>
          )}
          <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 14, marginBottom: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={14} /> Контакт
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
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">WhatsApp</label>
                <input className="form-input" value={form.whatsapp} placeholder="Якщо відрізняється від телефону"
                  onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Зовнішній номер бронювання</label>
                <input className="form-input" value={form.externalBookingId} placeholder="Booking.com, Airbnb..."
                  onChange={e => setForm(p => ({ ...p, externalBookingId: e.target.value }))} />
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

          <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 14, marginBottom: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tent size={14} /> Кемпінг (опціонально)
            </h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Транспорт</label>
                <select className="form-select" value={form.campingVehicleType}
                  onChange={e => setForm(p => ({ ...p, campingVehicleType: e.target.value }))}>
                  <option value="">Не вказано</option>
                  <option value="car">🚗 Легковий</option>
                  <option value="caravan">🚐 Караван</option>
                  <option value="motorhome">🏕️ Кемпер</option>
                  <option value="minibus">🚌 Мінібус</option>
                  <option value="motorcycle">🏍️ Мотоцикл</option>
                  <option value="bicycle">🚲 Велосипед</option>
                  <option value="none">🚶 Без транспорту</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Намет</label>
                <select className="form-select" value={form.campingTentType}
                  onChange={e => setForm(p => ({ ...p, campingTentType: e.target.value }))}>
                  <option value="">Не вказано</option>
                  <option value="small">Маленький</option>
                  <option value="large">Великий</option>
                  <option value="none">Без намету</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Нотатки</label>
            <textarea className="form-input" rows={2} value={form.notes} style={{ resize: 'vertical' }}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={saving || !form.firstName}>
            {saving ? <Loader2 size={14} className="animate-pulse" /> : <Plus size={14} />}
            Створити лід
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Main Pipeline Page
   ================================================================ */
export default function CrmPipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const onMenuClick = useMobileMenu();

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crm/pipeline');
      if (res.ok) setData(await res.json());
    } catch (err: any) { console.error('Помилка завантаження pipeline:', err); showError(err.message || 'Помилка завантаження даних'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredLeads = data?.leads?.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.first_name?.toLowerCase().includes(s) ||
      l.last_name?.toLowerCase().includes(s) ||
      l.email?.toLowerCase().includes(s) ||
      l.phone?.includes(s) ||
      l.external_booking_id?.includes(s)
    );
  }) || [];

  const getLeadsByStage = (stageId: string) =>
    filteredLeads.filter(l => l.stage === stageId);

  const handleStageChange = async (leadId: string, newStage: string) => {
    try {
      await fetch(`/api/crm/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage, trigger: 'manual' }),
      });
      fetchData();
    } catch (err: any) { console.error('Помилка зміни стадії:', err); showError(err.message || 'Помилка зміни стадії'); }
  };

  // Stages to show on Kanban (hide lost/spam)
  const visibleStages = data?.stages?.filter(s => !['lost', 'spam'].includes(s.id)) || [];

  return (
    <>
      {error && (
        <div style={{position:'fixed',top:20,right:20,background:'#ef4444',color:'white',padding:'12px 20px',borderRadius:8,zIndex:9999,maxWidth:400,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'}} onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}
      <Header title="CRM" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Stats */}
        {data?.stats && (
          <div className="crm-stats">
            <div className="crm-stat-card">
              <div className="crm-stat-label">Всього лідів</div>
              <div className="crm-stat-value" style={{ color: 'var(--text-primary)' }}>{data.stats.totalLeads}</div>
            </div>
            <div className="crm-stat-card">
              <div className="crm-stat-label">Непрочитаних</div>
              <div className="crm-stat-value" style={{ color: data.stats.unreadLeads > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
                {data.stats.unreadLeads}
              </div>
            </div>
            <div className="crm-stat-card">
              <div className="crm-stat-label">Активних бронювань</div>
              <div className="crm-stat-value" style={{ color: '#22c55e' }}>{data.stats.activeBookings}</div>
            </div>
            <div className="crm-stat-card">
              <div className="crm-stat-label">Загальна вартість</div>
              <div className="crm-stat-value" style={{ color: 'var(--accent-primary)', fontSize: 20 }}>
                {(data.stats.totalValue || 0).toLocaleString()} CZK
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="crm-view-toggle">
              <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>
                <LayoutGrid size={14} /> Kanban
              </button>
              <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
                <List size={14} /> Таблиця
              </button>
            </div>
            <div style={{ position: 'relative', minWidth: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input className="form-input" placeholder="Пошук лідів..."
                style={{ paddingLeft: 34 }} value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={fetchData} title="Оновити">
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> Новий лід
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
            <Loader2 size={24} className="animate-pulse" style={{ display: 'inline-block' }} />
            <div style={{ marginTop: 8 }}>Завантаження CRM...</div>
          </div>
        )}

        {/* ═══════ KANBAN VIEW ═══════ */}
        {!loading && view === 'kanban' && (
          <div className="kanban-board">
            {visibleStages.map(stage => {
              const stageLeads = getLeadsByStage(stage.id);
              return (
                <div key={stage.id} className="kanban-column">
                  <div className="kanban-column-header">
                    <div className="kanban-column-title">
                      <span>{stage.icon}</span>
                      <span>{stage.label}</span>
                    </div>
                    <span className="kanban-column-count"
                      style={{ background: `${stage.color}20`, color: stage.color }}>
                      {stageLeads.length}
                    </span>
                  </div>
                  <div
                    className={`kanban-column-body${dragLeadId ? '' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('drag-over');
                      if (dragLeadId) {
                        const lead = filteredLeads.find(l => l.id === dragLeadId);
                        if (lead && lead.stage !== stage.id) {
                          handleStageChange(dragLeadId, stage.id);
                        }
                        setDragLeadId(null);
                      }
                    }}
                  >
                    {stageLeads.length === 0 && (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                        Немає лідів
                      </div>
                    )}
                    {stageLeads.map(lead => (
                      <div
                        key={lead.id}
                        className={`kanban-card${dragLeadId === lead.id ? ' dragging' : ''}`}
                        draggable
                        onDragStart={() => setDragLeadId(lead.id)}
                        onDragEnd={() => setDragLeadId(null)}
                        onClick={() => setSelectedLead(lead)}
                      >
                        <div className="kanban-card-name">
                          <span className={`priority-dot ${lead.priority}`} />
                          {lead.first_name} {lead.last_name || ''}
                          {lead.unread_count > 0 && <span className="crm-unread">{lead.unread_count}</span>}
                        </div>
                        {(lead.phone || lead.email) && (
                          <div className="kanban-card-contact">
                            {lead.phone && <><Phone size={10} /> {lead.phone}</>}
                            {!lead.phone && lead.email && <><Mail size={10} /> {lead.email}</>}
                          </div>
                        )}
                        {(lead.check_in_date || lead.check_out_date) && (
                          <div className="kanban-card-dates">
                            <Calendar size={10} />
                            {lead.check_in_date} → {lead.check_out_date}
                          </div>
                        )}
                        <div className="kanban-card-meta">
                          {lead.channel_type && (
                            <span className="kanban-card-tag">
                              {CHANNEL_ICONS[lead.channel_type] || '📨'} {lead.channel_name}
                            </span>
                          )}
                          {lead.estimated_value > 0 && (
                            <span className="kanban-card-value">
                              {lead.estimated_value.toLocaleString()} {lead.currency}
                            </span>
                          )}
                          {lead.camping_vehicle_type && (
                            <span className="kanban-card-tag">
                              {VEHICLE_ICONS[lead.camping_vehicle_type] || '🚗'}
                            </span>
                          )}
                          {lead.external_booking_id && (
                            <span className="kanban-card-tag" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                              #{lead.external_booking_id}
                            </span>
                          )}
                        </div>
                        {lead.last_message_preview && (
                          <div className="kanban-card-preview">
                            💬 {lead.last_message_preview}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════ TABLE VIEW ═══════ */}
        {!loading && view === 'table' && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Ім&apos;я</th>
                  <th>Контакт</th>
                  <th>Етап</th>
                  <th>Джерело</th>
                  <th>Дати</th>
                  <th>Гості</th>
                  <th>Вартість</th>
                  <th>Зовнішній ID</th>
                  <th>Оновлено</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                    Лідів не знайдено
                  </td></tr>
                )}
                {filteredLeads.map(lead => {
                  const stageConfig = data?.stages.find(s => s.id === lead.stage);
                  return (
                    <tr key={lead.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLead(lead)}>
                      <td style={{ fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`priority-dot ${lead.priority}`} />
                          <div>
                            {lead.first_name} {lead.last_name || ''}
                            {lead.unread_count > 0 && <span className="crm-unread" style={{ marginLeft: 6 }}>{lead.unread_count}</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {lead.phone && <div className="flex items-center gap-1"><Phone size={10} /> {lead.phone}</div>}
                        {lead.email && <div className="flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}><Mail size={10} /> {lead.email}</div>}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: `${stageConfig?.color || '#6b7280'}15`,
                          color: stageConfig?.color || '#6b7280',
                        }}>
                          {stageConfig?.icon} {stageConfig?.label || lead.stage}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {CHANNEL_ICONS[lead.source] || '📨'} {SOURCE_LABELS[lead.source] || lead.source}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {lead.check_in_date ? `${lead.check_in_date} → ${lead.check_out_date || '?'}` : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {lead.adults > 0 && <span>{lead.adults} дор.</span>}
                        {lead.children > 0 && <span style={{ color: 'var(--text-tertiary)' }}> +{lead.children} діт.</span>}
                        {lead.adults === 0 && lead.children === 0 && '—'}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        {lead.estimated_value > 0
                          ? `${lead.estimated_value.toLocaleString()} ${lead.currency}`
                          : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {lead.external_booking_id || '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {lead.updated_at?.split(' ')[0] || lead.updated_at?.split('T')[0]}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-ghost btn-icon" onClick={e => { e.stopPropagation(); setSelectedLead(lead); }}>
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══════ GUEST 360 SLIDE-OVER ═══════ */}
        <Guest360
          leadId={selectedLead?.id || null}
          onClose={() => setSelectedLead(null)}
          onStageChanged={fetchData}
        />

        <AddLeadModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={fetchData} />
      </div>
    </>
  );
}
