'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { STAGE_CONFIG, CHANNEL_ICONS, formatTime } from '@/modules/crm/constants';
import { Loader2, ChevronDown, MessageSquare, Calendar, CreditCard, Star, AlertCircle } from 'lucide-react';
import '../crm.css';

/* ================================================================
   Types
   ================================================================ */
interface QueueLead {
  id: string;
  first_name: string;
  last_name: string | null;
  stage: string;
  channel_type: string | null;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
  estimated_value: number;
  currency: string;
}

interface ActionQueue {
  key: string;
  title: string;
  dot: string;
  hint: string;
  icon: React.ReactNode;
  leads: QueueLead[];
}

interface ActionCenterData {
  kpi: {
    totalLeads: number;
    unanswered: number;
    activeBookings: number;
    totalValue: number;
  };
  queues: {
    needs_reply: QueueLead[];
    ai_drafts: QueueLead[];
    check_ins: QueueLead[];
    awaiting_payment: QueueLead[];
    post_stay: QueueLead[];
  };
}

/* ================================================================
   Helpers
   ================================================================ */
function avatarColor(name: string): string {
  const colors = ['#8b5cf6','#3b82f6','#06b6d4','#22c55e','#f59e0b','#ec4899','#ef4444'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Доброго ранку';
  if (hour < 18) return 'Доброго дня';
  return 'Доброго вечора';
}

function formatDate(): string {
  return new Date().toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/* ================================================================
   Main Page
   ================================================================ */
export default function CrmTodayPage() {
  const router = useRouter();
  const onMenuClick = useMobileMenu();

  const [data, setData] = useState<ActionCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openQueues, setOpenQueues] = useState<Set<number>>(new Set([0]));

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crm/action-center');
      if (res.ok) {
        setData(await res.json());
      } else {
        showError('Помилка завантаження даних');
      }
    } catch (err: any) {
      console.error('Помилка завантаження action-center:', err);
      showError(err.message || 'Помилка завантаження даних');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleQueue = (idx: number) => {
    setOpenQueues(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const navigateToInbox = (leadId: string) => {
    router.push(`/crm/inbox?lead=${leadId}`);
  };

  /* Build queue list */
  const queues: ActionQueue[] = data ? [
    {
      key: 'needs_reply',
      title: 'Потребує відповіді',
      dot: '🔴',
      hint: 'Ліди без відповіді понад 1 год',
      icon: <AlertCircle size={14} />,
      leads: data.queues.needs_reply || [],
    },
    {
      key: 'ai_drafts',
      title: 'AI-чернетки на схвалення',
      dot: '🟡',
      hint: 'Чернетки готові для перевірки',
      icon: <MessageSquare size={14} />,
      leads: data.queues.ai_drafts || [],
    },
    {
      key: 'check_ins',
      title: 'Заїзди сьогодні/завтра',
      dot: '🟢',
      hint: 'Гості, що заїжджають найближчим часом',
      icon: <Calendar size={14} />,
      leads: data.queues.check_ins || [],
    },
    {
      key: 'awaiting_payment',
      title: 'Чекаємо передплату',
      dot: '💳',
      hint: 'Ліди з неоплаченими бронюваннями',
      icon: <CreditCard size={14} />,
      leads: data.queues.awaiting_payment || [],
    },
    {
      key: 'post_stay',
      title: 'Виїхали — попросити відгук',
      dot: '⭐',
      hint: 'Гості після виїзду без відгуку',
      icon: <Star size={14} />,
      leads: data.queues.post_stay || [],
    },
  ] : [];

  return (
    <>
      {error && (
        <div style={{position:'fixed',top:20,right:20,background:'#ef4444',color:'white',padding:'12px 20px',borderRadius:8,zIndex:9999,maxWidth:400,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'}} onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}
      <Header title="CRM Сьогодні" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-tertiary)' }}>
            <Loader2 size={28} className="animate-pulse" style={{ display: 'inline-block' }} />
            <div style={{ marginTop: 10, fontSize: 14 }}>Завантаження...</div>
          </div>
        )}

        {!loading && data && (
          <div className="crm-today-wrap">
            {/* Greeting */}
            <div className="crm-today-header">
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                {getGreeting()} 👋
              </h2>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {formatDate()}
              </div>
            </div>

            {/* KPI Row */}
            <div className="crm-kpi-row">
              <div className="crm-kpi">
                <div className="crm-kpi-label">Всього лідів</div>
                <div className="crm-kpi-value">{data.kpi.totalLeads}</div>
              </div>
              <div className="crm-kpi">
                <div className="crm-kpi-label">Без відповіді</div>
                <div className="crm-kpi-value" style={{ color: data.kpi.unanswered > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
                  {data.kpi.unanswered}
                </div>
              </div>
              <div className="crm-kpi">
                <div className="crm-kpi-label">Активних бронювань</div>
                <div className="crm-kpi-value" style={{ color: '#22c55e' }}>
                  {data.kpi.activeBookings}
                </div>
              </div>
              <div className="crm-kpi">
                <div className="crm-kpi-label">Загальна вартість</div>
                <div className="crm-kpi-value" style={{ color: 'var(--accent-primary)', fontSize: 20 }}>
                  {(data.kpi.totalValue || 0).toLocaleString()} CZK
                </div>
              </div>
            </div>

            {/* Action Queues */}
            <div className="crm-queue">
              {queues.map((q, idx) => (
                <div key={q.key} className="crm-queue-group">
                  <div className="crm-queue-head" onClick={() => toggleQueue(idx)}>
                    <span className="crm-queue-dot">{q.dot}</span>
                    <span className="crm-queue-title">{q.title}</span>
                    <span className="crm-queue-count">{q.leads.length}</span>
                    {q.leads.length === 0 && (
                      <span className="crm-queue-hint">— все чисто ✓</span>
                    )}
                    <ChevronDown
                      size={16}
                      className="crm-queue-chevron"
                      style={{
                        marginLeft: 'auto',
                        transition: 'transform 0.2s',
                        transform: openQueues.has(idx) ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </div>

                  {openQueues.has(idx) && q.leads.length > 0 && (
                    <div className="crm-queue-body">
                      {q.leads.map(lead => {
                        const fullName = `${lead.first_name} ${lead.last_name || ''}`.trim();
                        const initials = `${lead.first_name[0] || ''}${lead.last_name?.[0] || ''}`;
                        const stg = lead.stage ? STAGE_CONFIG[lead.stage] : null;

                        return (
                          <div key={lead.id} className="crm-queue-row">
                            <div
                              className="crm-queue-avatar"
                              style={{ background: avatarColor(fullName) }}
                            >
                              {initials}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span
                                  className="crm-queue-name"
                                  onClick={() => navigateToInbox(lead.id)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {fullName}
                                </span>

                                {lead.channel_type && (
                                  <span className="crm-queue-meta">
                                    {CHANNEL_ICONS[lead.channel_type] || '📨'}
                                  </span>
                                )}

                                {lead.unread_count > 0 && (
                                  <span className="crm-unread">{lead.unread_count}</span>
                                )}

                                {stg && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                    background: `${stg.color}15`, color: stg.color,
                                  }}>
                                    {stg.icon} {stg.label}
                                  </span>
                                )}
                              </div>

                              <div className="crm-queue-ai-preview">
                                {lead.last_message || 'Чекає відповіді'}
                                {lead.last_message_at && (
                                  <span style={{ color: 'var(--text-tertiary)', marginLeft: 6, fontSize: 11 }}>
                                    · {formatTime(lead.last_message_at)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="crm-queue-actions">
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => navigateToInbox(lead.id)}
                              >
                                <MessageSquare size={12} /> Написати
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => alert(`Картка ліда: ${fullName} (ID: ${lead.id})`)}
                              >
                                Картка
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state — loaded but no data */}
        {!loading && !data && !error && (
          <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-tertiary)' }}>
            <AlertCircle size={32} strokeWidth={1} style={{ display: 'inline-block', marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Немає даних для відображення</div>
          </div>
        )}
      </div>
    </>
  );
}
