// Inbox Phase 2 - v2
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Search, X, Loader2, Send, Phone, Mail, Calendar,
  MessageSquare, User, Clock, ChevronRight,
  ArrowLeft, Hash, Globe, Bot,
  Smartphone, Truck, Tent, DollarSign, ExternalLink,
  Users, Zap, FileText,
  Sparkles, PanelRightOpen, PanelRightClose,
  Brain,
} from 'lucide-react';
import '../crm.css';

/* ================================================================
   Types
   ================================================================ */
interface LeadPreview {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  stage: string;
  source: string;
  priority: string;
  channel_type: string | null;
  channel_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  check_in_date: string | null;
  check_out_date: string | null;
  adults: number;
  children: number;
  estimated_value: number;
  currency: string;
  external_booking_id: string | null;
  camping_vehicle_type: string | null;
  updated_at: string;
}

interface Conversation {
  id: string;
  lead_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  stage: string;
  source: string;
  priority: string;
  check_in_date: string | null;
  check_out_date: string | null;
  adults: number;
  children: number;
  estimated_value: number;
  currency: string;
  external_booking_id: string | null;
  camping_vehicle_type: string | null;
  camping_tent_type: string | null;
  reservation_status: string | null;
  payment_status: string | null;
  total_price: number | null;
  external_uid: string | null;
  bcom_reservation_id: string | null;
  messages: Message[];
}

interface Message {
  id: string;
  channel_type: string;
  direction: string;
  sender_type: string;
  sender_name: string | null;
  content: string;
  content_type: string;
  is_ai_generated: number;
  created_at: string;
  status: string;
  staff_name: string | null;
}

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
  assigned_name: string | null;
  reservation_status: string | null;
  reservation_id: string | null;
  payment_status: string | null;
  reservation_total: number | null;
  stageHistory: StageHistoryItem[];
}

/* ================================================================
   Constants
   ================================================================ */
const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: '📱', email: '✉️', phone: '📞', guest_page: '🌐',
  telegram: '🤖', booking_com: '🅱️', airbnb: '🏡',
  web_form: '🌍', manual: '✍️',
};

const STAGE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  new: { label: 'Новий', icon: '🆕', color: '#6b7280' },
  inquiry: { label: 'Запит', icon: '❓', color: '#8b5cf6' },
  info_needed: { label: 'Уточнення', icon: '📋', color: '#f59e0b' },
  quote_sent: { label: 'Ціна', icon: '💰', color: '#3b82f6' },
  negotiation: { label: 'Переговори', icon: '🤝', color: '#ec4899' },
  deposit_paid: { label: 'Передплата', icon: '💳', color: '#06b6d4' },
  booked: { label: 'Заброньовано', icon: '✅', color: '#22c55e' },
  pre_stay: { label: 'До заїзду', icon: '📋', color: '#14b8a6' },
  check_in: { label: 'Заселення', icon: '🏠', color: '#0ea5e9' },
  in_stay: { label: 'Перебування', icon: '🛏️', color: '#6366f1' },
  check_out: { label: 'Виселення', icon: '👋', color: '#a855f7' },
  post_stay: { label: 'Після', icon: '⭐', color: '#eab308' },
  lost: { label: 'Втрачено', icon: '❌', color: '#ef4444' },
  spam: { label: 'Спам', icon: '🚫', color: '#9ca3af' },
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'Email', phone: 'Телефон',
  guest_page: 'Guest Page', telegram: 'Telegram', manual: 'Вручну',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Вручну', whatsapp: 'WhatsApp', email: 'Email',
  phone: 'Телефон', booking_com: 'Booking.com', airbnb: 'Airbnb',
  web_form: 'Сайт', guest_page: 'Guest Page', telegram: 'Telegram',
};

const VEHICLE_LABELS: Record<string, string> = {
  car: '🚗 Легковий', caravan: '🚐 Караван', motorhome: '🏕️ Кемпер',
  minibus: '🚌 Мінібус', motorcycle: '🏍️ Мотоцикл',
  bicycle: '🚲 Велосипед', none: '🚶 Без транспорту',
};

const TENT_LABELS: Record<string, string> = {
  small: 'Маленький', large: 'Великий', none: 'Без намету',
};

const QUICK_REPLIES = [
  { label: '🙏 Дякуємо за запит', text: 'Дякуємо за ваш запит! Ми перевірили наявність на обрані дати. Ось наша пропозиція:' },
  { label: '📋 Потрібна інформація', text: 'Дякуємо за інтерес! Для підготовки пропозиції нам потрібно уточнити:\n\n1. Дати заїзду та виїзду\n2. Кількість гостей\n3. Тип розміщення\n4. Тип транспорту (якщо кемпінг)' },
  { label: '💰 Ціна відправлена', text: 'Ось наша пропозиція на обрані дати. Ціна включає всі зазначені послуги. Для бронювання потрібна передплата 30%.' },
  { label: '✅ Підтвердження', text: 'Ваше бронювання підтверджено! Ми надішлемо деталі заїзду ближче до дати прибуття.' },
  { label: '⏰ Нагадування', text: 'Доброго дня! Хотіли нагадати про вашу пропозицію. Чи є якісь запитання?' },
];

/* ================================================================
   Helpers
   ================================================================ */
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins}хв`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}год`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}д`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatNights(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn), b = new Date(checkOut);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

/* ================================================================
   LeadDetailPanel — right sidebar
   ================================================================ */
function LeadDetailPanel({ leadId, onClose, onStageChanged }: {
  leadId: string; onClose: () => void; onStageChanged: () => void;
}) {
  const [lead, setLead] = useState<LeadFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/leads/${leadId}`);
        if (res.ok) setLead(await res.json());
      } catch (err: any) { console.error('Помилка завантаження деталей ліда:', err); showError(err.message || 'Помилка завантаження деталей ліда'); }
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
      onStageChanged();
    } catch (err: any) { console.error('Помилка зміни етапу:', err); showError(err.message || 'Помилка зміни етапу'); }
    setChangingStage(false);
  };

  if (loading) return (
    <div className="inbox-detail-panel">
      <div className="inbox-detail-header">
        <span style={{ fontSize: 14, fontWeight: 700 }}>Деталі</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
      </div>
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block', color: 'var(--text-tertiary)' }} />
      </div>
    </div>
  );

  if (!lead) return null;

  const nights = formatNights(lead.check_in_date, lead.check_out_date);
  const stg = STAGE_CONFIG[lead.stage];

  return (
    <div className="inbox-detail-panel">
      {error && (
        <div style={{position:'fixed',top:20,right:20,background:'#ef4444',color:'white',padding:'12px 20px',borderRadius:8,zIndex:9999,maxWidth:400,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'}} onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}
      <div className="inbox-detail-header">
        <span style={{ fontSize: 14, fontWeight: 700 }}>Деталі ліда</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="inbox-detail-body">
        {/* Avatar + name */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="inbox-detail-avatar">{lead.first_name[0]}{lead.last_name?.[0] || ''}</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>{lead.first_name} {lead.last_name || ''}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${stg?.color || '#6b7280'}15`, color: stg?.color || '#6b7280' }}>
              {stg?.icon} {stg?.label}
            </span>
          </div>
        </div>

        {/* Contact */}
        <div className="inbox-detail-section">
          <div className="inbox-detail-section-title"><User size={12} /> Контакт</div>
          {lead.phone && <div className="inbox-detail-row"><Phone size={12} /><span>{lead.phone}</span></div>}
          {lead.email && <div className="inbox-detail-row"><Mail size={12} /><span>{lead.email}</span></div>}
          {lead.whatsapp && lead.whatsapp !== lead.phone && <div className="inbox-detail-row"><Smartphone size={12} /><span>WA: {lead.whatsapp}</span></div>}
          <div className="inbox-detail-row"><Globe size={12} /><span>{CHANNEL_ICONS[lead.source]} {SOURCE_LABELS[lead.source] || lead.source}</span></div>
        </div>

        {/* Booking */}
        {(lead.check_in_date || lead.estimated_value > 0) && (
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title"><Calendar size={12} /> Бронювання</div>
            {lead.check_in_date && <div className="inbox-detail-row"><Calendar size={12} /><span>{lead.check_in_date} → {lead.check_out_date || '?'}</span>{nights > 0 && <span className="inbox-detail-tag">{nights} ноч.</span>}</div>}
            {lead.adults > 0 && <div className="inbox-detail-row"><Users size={12} /><span>{lead.adults} дор.{lead.children > 0 ? ` + ${lead.children} діт.` : ''}</span></div>}
            {lead.estimated_value > 0 && <div className="inbox-detail-row"><DollarSign size={12} /><span style={{ fontWeight: 700, color: 'var(--accent-success)' }}>{lead.estimated_value.toLocaleString()} {lead.currency || 'CZK'}</span></div>}
            {lead.external_booking_id && <div className="inbox-detail-row"><Hash size={12} /><span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>{lead.external_booking_id}</span></div>}
          </div>
        )}

        {/* Camping */}
        {(lead.camping_vehicle_type || lead.camping_tent_type) && (
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title"><Tent size={12} /> Кемпінг</div>
            {lead.camping_vehicle_type && <div className="inbox-detail-row"><Truck size={12} /><span>{VEHICLE_LABELS[lead.camping_vehicle_type] || lead.camping_vehicle_type}</span></div>}
            {lead.camping_tent_type && <div className="inbox-detail-row"><Tent size={12} /><span>Намет: {TENT_LABELS[lead.camping_tent_type] || lead.camping_tent_type}</span></div>}
            {lead.camping_electricity === 1 && <div className="inbox-detail-row"><Zap size={12} /><span>⚡ Електрика</span></div>}
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title"><FileText size={12} /> Нотатки</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>{lead.notes}</div>
          </div>
        )}

        {/* Booking Action */}
        <div className="inbox-detail-section">
          <div className="inbox-detail-section-title"><Calendar size={12} /> Бронювання</div>
          {lead.reservation_id ? (
            <a href={`/bookings?highlight=${lead.reservation_id}`}
              className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', gap: 6, background: 'var(--accent-success)', color: '#fff', fontWeight: 600 }}>
              <ExternalLink size={13} /> Відкрити бронювання
            </a>
          ) : (
            <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', gap: 6, background: 'var(--accent-primary)', color: '#fff', fontWeight: 600 }}
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
        </div>

        {/* Stage change */}
        <div className="inbox-detail-section">
          <div className="inbox-detail-section-title"><ChevronRight size={12} /> Змінити етап</div>
          <div className="inbox-detail-stages">
            {Object.entries(STAGE_CONFIG).map(([key, conf]) => (
              <button key={key} className={`inbox-detail-stage-btn ${lead.stage === key ? 'active' : ''}`}
                style={{ borderColor: lead.stage === key ? conf.color : undefined, background: lead.stage === key ? `${conf.color}20` : undefined, color: lead.stage === key ? conf.color : undefined }}
                disabled={lead.stage === key || changingStage} onClick={() => handleStageChange(key)}>
                {conf.icon} {conf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stage History */}
        {lead.stageHistory?.length > 0 && (
          <div className="inbox-detail-section">
            <div className="inbox-detail-section-title"><Clock size={12} /> Історія</div>
            <div className="stage-timeline">
              {lead.stageHistory.slice(0, 8).map(h => (
                <div key={h.id} className="stage-timeline-item">
                  <div className="stage-timeline-content">
                    {h.from_stage ? <span>{STAGE_CONFIG[h.from_stage]?.icon} {STAGE_CONFIG[h.from_stage]?.label} → {STAGE_CONFIG[h.to_stage]?.icon} {STAGE_CONFIG[h.to_stage]?.label}</span>
                      : <span>{STAGE_CONFIG[h.to_stage]?.icon} {STAGE_CONFIG[h.to_stage]?.label}</span>}
                  </div>
                  <div className="stage-timeline-date">{formatDateTime(h.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Main Page
   ================================================================ */
export default function CrmInboxPage() {
  const searchParams = useSearchParams();
  const onMenuClick = useMobileMenu();

  const [leads, setLeads] = useState<LeadPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(searchParams.get('lead'));
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [convLoading, setConvLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendChannel, setSendChannel] = useState('manual');
  const [sending, setSending] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [showKnowledgeModal, setShowKnowledgeModal] = useState<any | null>(null);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stageFilter) params.set('stage', stageFilter);
      params.set('limit', '200');
      const res = await fetch(`/api/crm/leads?${params}`);
      if (res.ok) { const data = await res.json(); setLeads(data.leads || []); }
    } catch (err: any) { console.error('Помилка завантаження лідів:', err); showError(err.message || 'Помилка завантаження лідів'); }
    setLoading(false);
  }, [search, stageFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const fetchConversation = useCallback(async (leadId: string) => {
    setConvLoading(true);
    try {
      const leadRes = await fetch(`/api/crm/leads/${leadId}`);
      if (leadRes.ok) {
        const ld = await leadRes.json();
        const convs = ld.conversations || [];
        if (convs.length > 0) {
          const convRes = await fetch(`/api/crm/conversations/${convs[0].id}`);
          if (convRes.ok) setConversation(await convRes.json());
        } else {
          setConversation({
            id: '', lead_id: leadId, first_name: ld.first_name, last_name: ld.last_name,
            email: ld.email, phone: ld.phone, whatsapp: ld.whatsapp, stage: ld.stage,
            source: ld.source, priority: ld.priority, check_in_date: ld.check_in_date,
            check_out_date: ld.check_out_date, adults: ld.adults, children: ld.children,
            estimated_value: ld.estimated_value, currency: ld.currency || 'CZK', external_booking_id: ld.external_booking_id,
            camping_vehicle_type: ld.camping_vehicle_type, camping_tent_type: ld.camping_tent_type,
            reservation_status: null, payment_status: null, total_price: null,
            external_uid: null, bcom_reservation_id: null, messages: [],
          });
        }
      }
    } catch (err: any) { console.error('Помилка завантаження розмови:', err); showError(err.message || 'Помилка завантаження розмови'); }
    setConvLoading(false);
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (selectedLeadId) fetchConversation(selectedLeadId);
    else { setConversation(null); setShowDetailPanel(false); }
  }, [selectedLeadId, fetchConversation]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation?.messages?.length]);

  const handleAiSuggest = useCallback(async () => {
    if (!conversation?.id || !selectedLeadId || aiSuggesting) return;
    setAiSuggesting(true);
    setAiDraft('');
    setNewMessage('');
    aiAbortRef.current = new AbortController();
    try {
      const res = await fetch('/api/crm/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: selectedLeadId, conversationId: conversation.id }),
        signal: aiAbortRef.current.signal,
      });
      if (!res.ok) throw new Error('AI suggest failed');
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setNewMessage(accumulated);
          setAiDraft(accumulated);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('AI suggest error:', err);
    } finally {
      setAiSuggesting(false);
      aiAbortRef.current = null;
      textareaRef.current?.focus();
    }
  }, [conversation?.id, selectedLeadId, aiSuggesting]);

  const handleCancelAi = () => {
    aiAbortRef.current?.abort();
    setAiSuggesting(false);
    setAiDraft(null);
    setNewMessage('');
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !conversation?.id) return;
    const isAiGenerated = aiDraft !== null && aiDraft.length > 0;
    const wasEdited = isAiGenerated && newMessage.trim() !== aiDraft?.trim();
    setSending(true);
    try {
      await fetch(`/api/crm/conversations/${conversation.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: sendChannel, direction: 'outbound',
          senderType: isAiGenerated ? 'ai' : 'staff',
          senderName: 'Адміністратор', content: newMessage.trim(),
          isAiGenerated: isAiGenerated ? 1 : 0,
        }),
      });
      // Save training data if AI was involved
      if (isAiGenerated && aiDraft) {
        const lastGuestMsg = conversation.messages?.filter((m: any) => m.direction === 'inbound').pop();
        fetch('/api/crm/ai/training', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: conversation.id,
            guestMessage: lastGuestMsg?.content || '(no guest message)',
            leadStage: conversation.stage,
            aiDraft: aiDraft,
            finalResponse: newMessage.trim(),
            wasApproved: true,
            wasEdited: wasEdited,
          }),
        }).catch(() => {});
      }
      setNewMessage('');
      setAiDraft(null);
      if (selectedLeadId) fetchConversation(selectedLeadId);
    } catch (err: any) { console.error('Помилка відправки повідомлення:', err); showError(err.message || 'Помилка відправки повідомлення'); }
    setSending(false);
  };

  const handleSaveToKnowledge = async (form: any) => {
    setSavingKnowledge(true);
    try {
      await fetch('/api/crm/ai/knowledge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowKnowledgeModal(null);
    } catch (err: any) { console.error('Помилка збереження в базу знань:', err); showError(err.message || 'Помилка збереження в базу знань'); }
    setSavingKnowledge(false);
  };

  const filteredLeads = leads.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return l.first_name?.toLowerCase().includes(s) || l.last_name?.toLowerCase().includes(s) || l.email?.toLowerCase().includes(s) || l.phone?.includes(s) || l.external_booking_id?.includes(s);
  });

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (a.unread_count > 0 && b.unread_count === 0) return -1;
    if (b.unread_count > 0 && a.unread_count === 0) return 1;
    const da = a.last_message_at || a.updated_at || '';
    const dbv = b.last_message_at || b.updated_at || '';
    return dbv.localeCompare(da);
  });

  const stageConf = conversation ? STAGE_CONFIG[conversation.stage] : null;

  return (
    <>
      {error && (
        <div style={{position:'fixed',top:20,right:20,background:'#ef4444',color:'white',padding:'12px 20px',borderRadius:8,zIndex:9999,maxWidth:400,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'}} onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}
      <Header title="Inbox" onMenuClick={onMenuClick} />
      <div className="inbox-container" data-v="2">
        {/* LEFT PANEL */}
        <div className={`inbox-left ${selectedLeadId ? 'inbox-left-hidden-mobile' : ''}`}>
          <div className="inbox-search-bar">
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input className="form-input" placeholder="Пошук..." style={{ paddingLeft: 34, height: 36, fontSize: 13 }} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select" value={stageFilter} style={{ width: 130, height: 36, fontSize: 12 }} onChange={e => setStageFilter(e.target.value)}>
              <option value="">Всі етапи</option>
              {Object.entries(STAGE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
          <div className="inbox-lead-list">
            {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)' }}><Loader2 size={18} className="animate-pulse" style={{ display: 'inline-block' }} /></div>}
            {!loading && sortedLeads.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Немає лідів</div>}
            {sortedLeads.map(lead => {
              const stage = STAGE_CONFIG[lead.stage];
              return (
                <div key={lead.id} className={`inbox-lead-item ${selectedLeadId === lead.id ? 'active' : ''} ${lead.unread_count > 0 ? 'unread' : ''}`} onClick={() => setSelectedLeadId(lead.id)}>
                  <div className="inbox-lead-top">
                    <div className="inbox-lead-name"><span className={`priority-dot ${lead.priority}`} />{lead.first_name} {lead.last_name || ''}</div>
                    <div className="inbox-lead-time">{formatTime(lead.last_message_at || lead.updated_at)}</div>
                  </div>
                  <div className="inbox-lead-stage">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${stage?.color || '#6b7280'}15`, color: stage?.color || '#6b7280' }}>{stage?.icon} {stage?.label}</span>
                    {lead.source && <span className="inbox-lead-channel">{CHANNEL_ICONS[lead.source] || '📨'}</span>}
                    {lead.estimated_value > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-success)', marginLeft: 'auto' }}>{lead.estimated_value.toLocaleString()} {lead.currency || 'CZK'}</span>}
                    {lead.unread_count > 0 && <span className="crm-unread" style={{ marginLeft: lead.estimated_value > 0 ? 6 : 'auto' }}>{lead.unread_count}</span>}
                  </div>
                  {lead.check_in_date && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={9} /> {lead.check_in_date} → {lead.check_out_date}</div>}
                  {lead.last_message_preview && <div className="inbox-lead-preview">{lead.last_message_preview}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className={`inbox-right ${!selectedLeadId ? 'inbox-right-hidden-mobile' : ''}`}>
          {!selectedLeadId && (
            <div className="inbox-empty">
              <div className="inbox-empty-icon"><MessageSquare size={48} strokeWidth={1} /></div>
              <div style={{ marginTop: 16, color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600 }}>Оберіть діалог</div>
              <div style={{ marginTop: 4, color: 'var(--text-tertiary)', fontSize: 13 }}>Виберіть лід зліва для перегляду повідомлень</div>
            </div>
          )}
          {selectedLeadId && convLoading && (
            <div className="inbox-empty"><Loader2 size={24} className="animate-pulse" style={{ display: 'inline-block', color: 'var(--text-tertiary)' }} /></div>
          )}
          {selectedLeadId && !convLoading && conversation && (
            <>
              {/* HEADER */}
              <div className="inbox-conv-header">
                <button className="btn btn-ghost btn-icon inbox-back-btn" onClick={() => setSelectedLeadId(null)}><ArrowLeft size={18} /></button>
                <div className="inbox-conv-avatar" style={{ background: `${stageConf?.color || '#6b7280'}25`, color: stageConf?.color }}>{conversation.first_name[0]}{conversation.last_name?.[0] || ''}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {conversation.first_name} {conversation.last_name || ''}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${stageConf?.color || '#6b7280'}15`, color: stageConf?.color || '#6b7280' }}>{stageConf?.icon} {stageConf?.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {conversation.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} /> {conversation.phone}</span>}
                    {conversation.email && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={10} /> {conversation.email}</span>}
                    {conversation.check_in_date && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={10} /> {conversation.check_in_date} → {conversation.check_out_date}</span>}
                    {conversation.estimated_value > 0 && <span style={{ fontWeight: 700, color: 'var(--accent-success)' }}>{conversation.estimated_value.toLocaleString()} {conversation.currency || 'CZK'}</span>}
                  </div>
                </div>
                <button className={`btn btn-sm ${showDetailPanel ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowDetailPanel(p => !p)} title="Деталі ліда">
                  {showDetailPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                </button>
              </div>

              {/* CONTENT AREA */}
              <div className="inbox-content-area">
                <div className="inbox-chat-area">
                  {/* Messages */}
                  <div className="inbox-messages">
                    {conversation.messages.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 13 }}>
                        <MessageSquare size={32} strokeWidth={1} style={{ opacity: 0.3, display: 'inline-block', marginBottom: 8 }} />
                        <div>Повідомлень ще немає</div>
                        <div style={{ fontSize: 11, marginTop: 4 }}>Напишіть першим або використайте шаблон</div>
                      </div>
                    )}
                    {conversation.messages.map((msg, idx) => {
                      const isInbound = msg.direction === 'inbound';
                      const isSystem = msg.content_type === 'system';
                      const prevMsg = idx > 0 ? conversation.messages[idx - 1] : null;
                      const showDateSep = !prevMsg || new Date(msg.created_at.replace(' ', 'T')).toDateString() !== new Date(prevMsg.created_at.replace(' ', 'T')).toDateString();
                      return (
                        <div key={msg.id}>
                          {showDateSep && <div className="inbox-msg-date-sep"><span>{new Date(msg.created_at.replace(' ', 'T')).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>}
                          {isSystem ? (
                            <div className="inbox-msg-system"><span>{msg.content}</span></div>
                          ) : (
                            <div className={`inbox-msg ${isInbound ? 'inbox-msg-in' : 'inbox-msg-out'}`}>
                              <div className="inbox-msg-bubble">
                                {msg.channel_type !== 'manual' && (
                                  <div className="inbox-msg-channel-badge" style={{ color: msg.channel_type === 'whatsapp' ? '#25d366' : msg.channel_type === 'email' ? '#3b82f6' : 'var(--text-tertiary)' }}>
                                    {CHANNEL_ICONS[msg.channel_type] || '📨'} {CHANNEL_LABEL[msg.channel_type] || msg.channel_type}
                                  </div>
                                )}
                                <div className="inbox-msg-content">{msg.content}</div>
                                <div className="inbox-msg-meta">
                                  {msg.is_ai_generated ? <span className="inbox-msg-ai-badge"><Bot size={9} /> AI</span> : null}
                                  <span>{msg.staff_name || msg.sender_name || (isInbound ? 'Гість' : 'Ви')}</span>
                                  <span>·</span>
                                  <span>{formatDateTime(msg.created_at)}</span>
                                  <span>·</span>
                                  <button
                                    onClick={() => setShowKnowledgeModal({
                                      topic: '',
                                      keywords: '',
                                      content: msg.content,
                                      category: 'general',
                                      isActive: true,
                                    })}
                                    className="inbox-msg-action-btn"
                                    title="Додати в базу знань"
                                  >
                                    <Brain size={10} /> Знання
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Compose */}
                  <div className="inbox-compose">
                    {showQuickReplies && (
                      <div className="inbox-quick-replies">
                        <div className="inbox-quick-replies-header">
                          <Sparkles size={12} /> Шаблони відповідей
                          <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowQuickReplies(false)}><X size={14} /></button>
                        </div>
                        {QUICK_REPLIES.map((qr, i) => (
                          <button key={i} className="inbox-quick-reply-item" onClick={() => { setNewMessage(qr.text); setShowQuickReplies(false); textareaRef.current?.focus(); }}>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{qr.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qr.text.substring(0, 80)}...</div>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="inbox-compose-top">
                      <select className="form-select" value={sendChannel} onChange={e => setSendChannel(e.target.value)} style={{ width: 140, height: 30, fontSize: 11 }}>
                        {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{CHANNEL_ICONS[k]} {v}</option>)}
                      </select>
                      <button className={`btn btn-sm ${showQuickReplies ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowQuickReplies(p => !p)} title="Шаблони" style={{ height: 30 }}>
                        <Sparkles size={13} />
                      </button>
                      <button
                        className={`btn btn-sm ${aiSuggesting ? 'btn-danger' : aiDraft ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={aiSuggesting ? handleCancelAi : handleAiSuggest}
                        title={aiSuggesting ? 'Скасувати AI' : 'AI відповідь'}
                        style={{ height: 30, gap: 4 }}
                        disabled={!conversation?.id}
                      >
                        <Bot size={13} />
                        <span style={{ fontSize: 11 }}>{aiSuggesting ? 'Стоп' : 'AI'}</span>
                      </button>
                      {aiDraft && !aiSuggesting && (
                        <span style={{ fontSize: 10, color: 'var(--accent-info)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Bot size={10} /> AI draft
                        </span>
                      )}
                    </div>
                    <div className="inbox-compose-input">
                      <textarea ref={textareaRef} className="inbox-textarea" placeholder="Напишіть повідомлення..." value={newMessage} rows={1}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
                      <button className="btn btn-primary inbox-send-btn" onClick={handleSend} disabled={sending || !newMessage.trim() || !conversation.id}>
                        {sending ? <Loader2 size={16} className="animate-pulse" /> : <Send size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Detail Panel */}
                {showDetailPanel && selectedLeadId && (
                  <LeadDetailPanel leadId={selectedLeadId} onClose={() => setShowDetailPanel(false)}
                    onStageChanged={() => { if (selectedLeadId) fetchConversation(selectedLeadId); }} />
                )}
              </div>
            </>
          )}
          {showKnowledgeModal && (
            <KnowledgeAddModal
              initialData={showKnowledgeModal}
              onClose={() => setShowKnowledgeModal(null)}
              onSave={handleSaveToKnowledge}
              loading={savingKnowledge}
            />
          )}
        </div>
      </div>
    </>
  );
}

function KnowledgeAddModal({ initialData, onClose, onSave, loading }: any) {
  const [topic, setTopic] = useState(initialData.topic || '');
  const [keywords, setKeywords] = useState(initialData.keywords || '');
  const [content, setContent] = useState(initialData.content || '');
  const [category, setCategory] = useState(initialData.category || 'general');

  return (
    <div className="crm-modal-overlay">
      <div className="crm-modal-content" style={{ maxWidth: 500 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={18} /> Додати в базу знань
          </h3>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Тема</label>
            <input className="form-input" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Напр: QA Glamping / WiFi" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Ключові слова (через кому)</label>
            <input className="form-input" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="wifi, internet, login" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Зміст (інформація для AI)</label>
            <textarea className="form-input" rows={6} value={content} onChange={e => setContent(e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Категорія</label>
            <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="general">Загальне</option>
              <option value="properties">Об'єкти</option>
              <option value="logistics">Логістика</option>
              <option value="rules">Правила</option>
              <option value="services">Сервіси</option>
              <option value="activities">Активності</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={() => onSave({ topic, keywords, content, category, isActive: true })} disabled={loading || !topic.trim() || !keywords.trim() || !content.trim()}>
            {loading ? 'Зберігаю...' : 'Зберегти в базу'}
          </button>
        </div>
      </div>
    </div>
  );
}
