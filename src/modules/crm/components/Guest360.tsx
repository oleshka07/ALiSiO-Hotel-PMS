'use client';

import { useState, useEffect } from 'react';
import {
  X, Loader2, Phone, Mail, Calendar, User, Clock,
  ChevronRight, Globe, Smartphone, Truck, Tent, DollarSign,
  ExternalLink, Users, Zap, FileText, Hash, MessageSquare,
  Pencil, Save, XCircle,
} from 'lucide-react';
import {
  STAGE_CONFIG, CHANNEL_ICONS, SOURCE_LABELS,
  VEHICLE_LABELS, TENT_LABELS, formatDateTime, formatNights,
} from '@/modules/crm/constants';

/* ================================================================
   Types
   ================================================================ */
interface StageHistoryItem {
  id: string;
  from_stage: string | null;
  to_stage: string;
  trigger: string;
  notes: string | null;
  created_at: string;
  changed_by_name: string | null;
}

interface LeadFull {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  stage: string;
  source: string;
  priority: string;
  notes: string | null;
  tags: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  adults: number;
  children: number;
  estimated_value: number;
  currency: string;
  external_booking_id: string | null;
  camping_vehicle_type: string | null;
  camping_tent_type: string | null;
  camping_electricity: number;
  camping_pets_json: string | null;
  reservation_id: string | null;
  reservation_status: string | null;
  payment_status: string | null;
  total_price: number | null;
  stageHistory: StageHistoryItem[];
}

interface Guest360Props {
  leadId: string | null;
  onClose: () => void;
  onStageChanged?: () => void;
  /** When true, renders as a slide-over panel with scrim. When false, renders inline. */
  variant?: 'slide-over' | 'inline';
}

/* ================================================================
   Helpers
   ================================================================ */
function avatarColor(name: string): string {
  const colors = ['#8b5cf6', '#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#ef4444'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* ================================================================
   Component
   ================================================================ */
export default function Guest360({ leadId, onClose, onStageChanged, variant = 'slide-over' }: Guest360Props) {
  const [lead, setLead] = useState<LeadFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<{
    firstName: string; lastName: string; phone: string;
    email: string; whatsapp: string; notes: string;
  }>({ firstName: '', lastName: '', phone: '', email: '', whatsapp: '', notes: '' });

  const show = !!leadId;

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setLead(null);
    (async () => {
      try {
        const res = await fetch(`/api/crm/leads/${leadId}`);
        if (res.ok) setLead(await res.json());
      } catch (err: any) {
        console.error('Guest360 load error:', err);
        setError(err.message || 'Помилка завантаження');
      }
      setLoading(false);
    })();
  }, [leadId]);

  const handleStageChange = async (newStage: string) => {
    if (!lead || lead.stage === newStage) return;
    setChangingStage(true);
    try {
      await fetch(`/api/crm/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage, trigger: 'manual' }),
      });
      setLead(prev => prev ? { ...prev, stage: newStage } : null);
      onStageChanged?.();
    } catch (err: any) {
      console.error('Stage change error:', err);
      setError(err.message || 'Помилка зміни етапу');
    }
    setChangingStage(false);
  };

  const startEditing = () => {
    if (!lead) return;
    setEditForm({
      firstName: lead.first_name || '',
      lastName: lead.last_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      whatsapp: lead.whatsapp || '',
      notes: lead.notes || '',
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSaveContact = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setLead(prev => prev ? {
        ...prev,
        first_name: updated.first_name,
        last_name: updated.last_name,
        phone: updated.phone,
        email: updated.email,
        whatsapp: updated.whatsapp,
        notes: updated.notes,
      } : null);
      setEditing(false);
      onStageChanged?.();
    } catch (err: any) {
      setError(err.message || 'Помилка збереження');
    }
    setSaving(false);
  };

  const nights = lead ? formatNights(lead.check_in_date, lead.check_out_date) : 0;
  const stg = lead ? STAGE_CONFIG[lead.stage] : null;
  const initials = lead ? `${lead.first_name[0]}${lead.last_name?.[0] || ''}` : '';
  const fullName = lead ? `${lead.first_name} ${lead.last_name || ''}`.trim() : '';
  const bgColor = lead ? avatarColor(fullName) : '#6b7280';

  /* ─── Slide-over wrapper ─── */
  if (variant === 'slide-over') {
    return (
      <>
        {/* Scrim */}
        <div className={`g360-scrim${show ? ' show' : ''}`} onClick={onClose} />

        {/* Panel */}
        <div className={`g360-panel${show ? ' show' : ''}`}>
          {show && <PanelContent />}
        </div>
      </>
    );
  }

  /* ─── Inline variant ─── */
  if (!show) return null;
  return <PanelContent />;

  /* ─── Shared content ─── */
  function PanelContent() {
    if (loading) {
      return (
        <>
          <div className="g360-header">
            <span style={{ fontSize: 14, fontWeight: 700 }}>Деталі</span>
            <button className="g360-close" onClick={onClose}><X size={16} /></button>
          </div>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <Loader2 size={22} className="animate-pulse" style={{ color: 'var(--text-tertiary)' }} />
          </div>
        </>
      );
    }

    if (!lead) return null;

    return (
      <>
        {/* Error toast */}
        {error && (
          <div style={{ position: 'fixed', top: 20, right: 20, background: '#ef4444', color: 'white', padding: '12px 20px', borderRadius: 8, zIndex: 9999, maxWidth: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer' }} onClick={() => setError(null)}>
            ⚠️ {error}
          </div>
        )}

        {/* Header */}
        <div className="g360-header">
          <div className="g360-avatar" style={{ background: bgColor }}>{initials}</div>
          <div>
            <div className="g360-name">{fullName}</div>
            <div className="g360-meta">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${stg?.color || '#6b7280'}15`, color: stg?.color || '#6b7280' }}>
                {stg?.icon} {stg?.label}
              </span>
              <span>{CHANNEL_ICONS[lead.source]} {SOURCE_LABELS[lead.source] || lead.source}</span>
            </div>
          </div>
          <button className="g360-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="g360-body">
          {/* Contact section */}
          <div className="g360-section">
            <h4 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={13} /> Контакт</span>
              {!editing && (
                <button className="btn btn-ghost" onClick={startEditing}
                  style={{ height: 22, width: 22, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Редагувати">
                  <Pencil size={12} />
                </button>
              )}
            </h4>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-input" placeholder="Ім'я" value={editForm.firstName}
                    onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))}
                    style={{ flex: 1, height: 32, fontSize: 12, padding: '0 8px' }} />
                  <input className="form-input" placeholder="Прізвище" value={editForm.lastName}
                    onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))}
                    style={{ flex: 1, height: 32, fontSize: 12, padding: '0 8px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={12} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                  <input className="form-input" placeholder="Телефон" value={editForm.phone}
                    onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                    style={{ flex: 1, height: 32, fontSize: 12, padding: '0 8px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={12} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                  <input className="form-input" placeholder="Email" value={editForm.email}
                    onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                    style={{ flex: 1, height: 32, fontSize: 12, padding: '0 8px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Smartphone size={12} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                  <input className="form-input" placeholder="WhatsApp" value={editForm.whatsapp}
                    onChange={e => setEditForm(p => ({ ...p, whatsapp: e.target.value }))}
                    style={{ flex: 1, height: 32, fontSize: 12, padding: '0 8px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={12} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                  <textarea className="form-input" placeholder="Нотатки" value={editForm.notes}
                    onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                    style={{ flex: 1, minHeight: 48, fontSize: 12, padding: '6px 8px', resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-ghost" onClick={cancelEditing} disabled={saving}
                    style={{ height: 28, fontSize: 11, gap: 4 }}>
                    <XCircle size={12} /> Скасувати
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={handleSaveContact} disabled={saving || !editForm.firstName.trim()}
                    style={{ height: 28, fontSize: 11, gap: 4 }}>
                    {saving ? <Loader2 size={12} className="animate-pulse" /> : <Save size={12} />} Зберегти
                  </button>
                </div>
              </div>
            ) : (
              <>
                {lead.phone && (
                  <div className="g360-kv">
                    <span className="g360-kv-key"><Phone size={12} style={{ marginRight: 6 }} />Телефон</span>
                    <span className="g360-kv-value">{lead.phone}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="g360-kv">
                    <span className="g360-kv-key"><Mail size={12} style={{ marginRight: 6 }} />Email</span>
                    <span className="g360-kv-value" style={{ fontSize: 12 }}>{lead.email}</span>
                  </div>
                )}
                {lead.whatsapp && lead.whatsapp !== lead.phone && (
                  <div className="g360-kv">
                    <span className="g360-kv-key"><Smartphone size={12} style={{ marginRight: 6 }} />WhatsApp</span>
                    <span className="g360-kv-value">{lead.whatsapp}</span>
                  </div>
                )}
                {!lead.phone && !lead.email && !lead.whatsapp && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Немає контактних даних — натисніть ✏️</div>
                )}
              </>
            )}
          </div>

          {/* Booking section */}
          {(lead.check_in_date || lead.estimated_value > 0) && (
            <div className="g360-section">
              <h4><Calendar size={13} /> Бронювання</h4>
              {lead.check_in_date && (
                <div className="g360-kv">
                  <span className="g360-kv-key">Дати</span>
                  <span className="g360-kv-value mono">
                    {lead.check_in_date} → {lead.check_out_date || '?'}
                    {nights > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>{nights} ноч.</span>}
                  </span>
                </div>
              )}
              {lead.adults > 0 && (
                <div className="g360-kv">
                  <span className="g360-kv-key">Гості</span>
                  <span className="g360-kv-value">{lead.adults} дор.{lead.children > 0 ? ` + ${lead.children} діт.` : ''}</span>
                </div>
              )}
              {lead.estimated_value > 0 && (
                <div className="g360-kv">
                  <span className="g360-kv-key">Вартість</span>
                  <span className="g360-kv-value green">{lead.estimated_value.toLocaleString()} {lead.currency || 'CZK'}</span>
                </div>
              )}
              {lead.external_booking_id && (
                <div className="g360-kv">
                  <span className="g360-kv-key">Зовнішній ID</span>
                  <span className="g360-kv-value mono" style={{ color: '#3b82f6' }}>{lead.external_booking_id}</span>
                </div>
              )}
            </div>
          )}

          {/* Camping section */}
          {(lead.camping_vehicle_type || lead.camping_tent_type) && (
            <div className="g360-section">
              <h4><Tent size={13} /> Кемпінг</h4>
              {lead.camping_vehicle_type && (
                <div className="g360-kv">
                  <span className="g360-kv-key">Транспорт</span>
                  <span className="g360-kv-value">{VEHICLE_LABELS[lead.camping_vehicle_type] || lead.camping_vehicle_type}</span>
                </div>
              )}
              {lead.camping_tent_type && (
                <div className="g360-kv">
                  <span className="g360-kv-key">Намет</span>
                  <span className="g360-kv-value">{TENT_LABELS[lead.camping_tent_type] || lead.camping_tent_type}</span>
                </div>
              )}
              {lead.camping_electricity === 1 && (
                <div className="g360-kv">
                  <span className="g360-kv-key">Електрика</span>
                  <span className="g360-kv-value">⚡ Так</span>
                </div>
              )}
            </div>
          )}

          {/* Notes (only show when not editing, since notes are in edit form) */}
          {!editing && lead.notes && (
            <div className="g360-section">
              <h4><FileText size={13} /> Нотатки</h4>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{lead.notes}</div>
            </div>
          )}

          {/* Stage change */}
          <div className="g360-section">
            <h4><ChevronRight size={13} /> Змінити етап</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(STAGE_CONFIG).map(([key, conf]) => (
                <button key={key}
                  className={`btn btn-sm ${lead.stage === key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: 11,
                    borderColor: lead.stage === key ? conf.color : undefined,
                    background: lead.stage === key ? `${conf.color}20` : undefined,
                    color: lead.stage === key ? conf.color : undefined,
                    opacity: lead.stage === key ? 1 : 0.8,
                  }}
                  disabled={lead.stage === key || changingStage}
                  onClick={() => handleStageChange(key)}
                >
                  {conf.icon} {conf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stage History / Timeline */}
          {lead.stageHistory?.length > 0 && (
            <div className="g360-section">
              <h4><Clock size={13} /> Історія</h4>
              <div className="g360-timeline">
                {lead.stageHistory.slice(0, 8).map((h, i) => (
                  <div key={h.id} className="g360-tl-item">
                    <div className="g360-tl-dot" style={{ background: STAGE_CONFIG[h.to_stage]?.color || '#6b7280' }} />
                    {i < Math.min(lead.stageHistory.length, 8) - 1 && <div className="g360-tl-line" />}
                    <div>
                      <div className="g360-tl-content">
                        {h.from_stage ? (
                          <span>{STAGE_CONFIG[h.from_stage]?.icon} {STAGE_CONFIG[h.from_stage]?.label} → {STAGE_CONFIG[h.to_stage]?.icon} {STAGE_CONFIG[h.to_stage]?.label}</span>
                        ) : (
                          <span>{STAGE_CONFIG[h.to_stage]?.icon} {STAGE_CONFIG[h.to_stage]?.label}</span>
                        )}
                      </div>
                      <div className="g360-tl-time">{formatDateTime(h.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions bar */}
        <div className="g360-actions">
          {/* Booking action */}
          {lead.reservation_id ? (
            <a href={`/bookings?highlight=${lead.reservation_id}`}
              className="btn btn-sm" style={{ flex: 1, justifyContent: 'center', gap: 6, background: 'var(--accent-success)', color: '#fff', fontWeight: 600 }}>
              <ExternalLink size={13} /> Відкрити бронювання
            </a>
          ) : (
            <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center', gap: 6, background: 'var(--accent-primary)', color: '#fff', fontWeight: 600 }}
              onClick={() => {
                const params = new URLSearchParams();
                params.set('new', '1');
                params.set('firstName', lead.first_name);
                if (lead.last_name) params.set('lastName', lead.last_name);
                if (lead.email) params.set('email', lead.email);
                if (lead.phone) params.set('phone', lead.phone);
                if (lead.check_in_date) params.set('checkIn', lead.check_in_date);
                if (lead.check_out_date) params.set('checkOut', lead.check_out_date);
                if (lead.adults > 0) params.set('adults', String(lead.adults));
                if (lead.children > 0) params.set('children', String(lead.children));
                params.set('crmLeadId', lead.id);
                params.set('source', lead.source || 'direct');
                window.open(`/bookings?${params.toString()}`, '_blank');
              }}>
              <Calendar size={13} /> Створити бронювання
            </button>
          )}

          <a href={`/crm/inbox?lead=${lead.id}`} className="btn btn-sm btn-secondary" style={{ justifyContent: 'center', gap: 6 }}>
            <MessageSquare size={13} /> Діалог
          </a>
        </div>
      </>
    );
  }
}
