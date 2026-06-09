'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { STAGE_CONFIG } from '@/modules/crm/constants';
import {
  Settings, Bot, Sparkles, Save, Plus, Trash2, X,
  Loader2, ChevronDown, ChevronRight, Edit3, ToggleLeft, ToggleRight,
  Zap, FileText, BarChart3,
} from 'lucide-react';
import '../crm.css';

/* ================================================================
   Types
   ================================================================ */
interface PromptConfig {
  id: string;
  organization_id: string;
  name: string;
  stage: string | null;
  trigger_type: string;
  system_prompt: string;
  context_instructions: string | null;
  variables: string | null;
  temperature: number;
  model: string;
  is_active: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface TrainingRecord {
  id: string;
  conversation_id: string;
  guest_message: string;
  guest_language: string | null;
  lead_stage: string;
  ai_draft: string;
  final_response: string | null;
  was_approved: number;
  was_edited: number;
  edit_reason: string | null;
  rating: number | null;
  created_at: string;
}

/* ================================================================
   Constants
   ================================================================ */

const TABS = [
  { id: 'prompts', label: 'AI Промпти', icon: <Bot size={16} /> },
  { id: 'training', label: 'Training Data', icon: <BarChart3 size={16} /> },
];

/* ================================================================
   Main Page
   ================================================================ */
export default function CrmSettingsPage() {
  const onMenuClick = useMobileMenu();
  const [activeTab, setActiveTab] = useState('prompts');

  return (
    <>
      <Header title="CRM Налаштування" onMenuClick={onMenuClick} />
      <div className="crm-settings-container">
        {/* Tabs */}
        <div className="crm-settings-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`crm-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="crm-settings-content">
          {activeTab === 'prompts' && <PromptsTab />}
          {activeTab === 'training' && <TrainingTab />}
        </div>
      </div>
    </>
  );
}

/* ================================================================
   Prompts Tab
   ================================================================ */
function PromptsTab() {
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<PromptConfig> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crm/ai/prompts');
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts || []);
      }
    } catch (err: any) { console.error('Помилка завантаження промптів:', err); showError(err.message || 'Помилка завантаження промптів'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const handleSave = async () => {
    if (!editing?.name || !editing?.system_prompt) return;
    setSaving(true);
    try {
      const res = await fetch('/api/crm/ai/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id || undefined,
          name: editing.name,
          stage: editing.stage || null,
          triggerType: editing.trigger_type || 'manual',
          systemPrompt: editing.system_prompt,
          contextInstructions: editing.context_instructions || null,
          temperature: editing.temperature ?? 0.7,
          model: editing.model || 'gpt-4o',
          isActive: editing.is_active !== 0,
        }),
      });
      if (res.ok) {
        setEditing(null);
        fetchPrompts();
      }
    } catch (err: any) { console.error('Помилка збереження промпта:', err); showError(err.message || 'Помилка збереження промпта'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити промпт?')) return;
    try {
      await fetch(`/api/crm/ai/prompts?id=${id}`, { method: 'DELETE' });
      fetchPrompts();
    } catch (err: any) { console.error('Помилка видалення промпта:', err); showError(err.message || 'Помилка видалення промпта'); }
  };

  const handleToggleActive = async (prompt: PromptConfig) => {
    try {
      await fetch('/api/crm/ai/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: prompt.id,
          name: prompt.name,
          stage: prompt.stage,
          triggerType: prompt.trigger_type,
          systemPrompt: prompt.system_prompt,
          contextInstructions: prompt.context_instructions,
          temperature: prompt.temperature,
          model: prompt.model,
          isActive: !prompt.is_active,
        }),
      });
      fetchPrompts();
    } catch (err: any) { console.error('Помилка перемикання промпта:', err); showError(err.message || 'Помилка перемикання промпта'); }
  };

  const errorToast = error ? (
    <div style={{position:'fixed',top:20,right:20,background:'#ef4444',color:'white',padding:'12px 20px',borderRadius:8,zIndex:9999,maxWidth:400,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'}} onClick={() => setError(null)}>
      ⚠️ {error}
    </div>
  ) : null;

  if (editing) {
    return (
      <>{errorToast}
      <div className="crm-prompt-editor">
        <div className="crm-prompt-editor-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Edit3 size={16} />
            {editing.id ? 'Редагувати промпт' : 'Новий промпт'}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><X size={16} /></button>
        </div>

        <div className="crm-prompt-form">
          <div className="crm-prompt-form-row">
            <label>Назва *</label>
            <input
              className="form-input"
              value={editing.name || ''}
              onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
              placeholder="Наприклад: Відповідь на запит"
            />
          </div>

          <div className="crm-prompt-form-row">
            <label>Етап (stage)</label>
            <select
              className="form-select"
              value={editing.stage || ''}
              onChange={e => setEditing(p => ({ ...p, stage: e.target.value || null }))}
            >
              <option value="">Будь-який етап</option>
              {Object.entries(STAGE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>

          <div className="crm-prompt-form-row">
            <label>Тригер</label>
            <select
              className="form-select"
              value={editing.trigger_type || 'manual'}
              onChange={e => setEditing(p => ({ ...p, trigger_type: e.target.value }))}
            >
              <option value="manual">Ручний (по кнопці)</option>
              <option value="auto">Автоматичний</option>
              <option value="stage_change">При зміні етапу</option>
            </select>
          </div>

          <div className="crm-prompt-form-row" style={{ gridColumn: '1 / -1' }}>
            <label>Системний промпт *</label>
            <textarea
              className="form-input"
              rows={8}
              value={editing.system_prompt || ''}
              onChange={e => setEditing(p => ({ ...p, system_prompt: e.target.value }))}
              placeholder="Describe the AI's role and behavior for this stage..."
              style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
            />
          </div>

          <div className="crm-prompt-form-row" style={{ gridColumn: '1 / -1' }}>
            <label>Додаткові інструкції контексту</label>
            <textarea
              className="form-input"
              rows={3}
              value={editing.context_instructions || ''}
              onChange={e => setEditing(p => ({ ...p, context_instructions: e.target.value }))}
              placeholder="Additional context or special instructions..."
              style={{ fontSize: 12 }}
            />
          </div>

          <div className="crm-prompt-form-row">
            <label>Температура ({(editing.temperature ?? 0.7).toFixed(1)})</label>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={editing.temperature ?? 0.7}
              onChange={e => setEditing(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Точний</span><span>Креативний</span>
            </div>
          </div>

          <div className="crm-prompt-form-row">
            <label>Модель</label>
            <select
              className="form-select"
              value={editing.model || 'gpt-4o'}
              onChange={e => setEditing(p => ({ ...p, model: e.target.value }))}
            >
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
            </select>
          </div>
        </div>

        <div className="crm-prompt-editor-footer">
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !editing.name || !editing.system_prompt}>
            {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />}
            <span>Зберегти</span>
          </button>
        </div>
      </div>
    </>
    );
  }

  return (
    <div>
      {errorToast}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>AI Промпти</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
            Налаштуйте промпти для AI-генерації відповідей на кожному етапі ліда
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ name: '', system_prompt: '', stage: null, trigger_type: 'manual', temperature: 0.7, model: 'gpt-4o', is_active: 1 })}>
          <Plus size={14} /> Новий промпт
        </button>
      </div>

      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <Loader2 size={20} className="animate-pulse" />
        </div>
      )}

      {!loading && prompts.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <Bot size={32} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Промптів ще немає</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>AI використовуватиме дефолтні промпти для кожного етапу</div>
        </div>
      )}

      <div className="crm-prompts-grid">
        {prompts.map(p => {
          const stageInfo = p.stage ? STAGE_CONFIG[p.stage] : null;
          return (
            <div key={p.id} className={`crm-prompt-card ${!p.is_active ? 'inactive' : ''}`}>
              <div className="crm-prompt-card-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={12} />
                    {p.name}
                    {!p.is_active && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>disabled</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', gap: 8 }}>
                    {stageInfo ? (
                      <span>{stageInfo.icon} {stageInfo.label}</span>
                    ) : (
                      <span>Будь-який етап</span>
                    )}
                    <span>·</span>
                    <span>{p.trigger_type === 'manual' ? '🔘 Ручний' : p.trigger_type === 'auto' ? '⚡ Авто' : '🔄 Зміна етапу'}</span>
                    <span>·</span>
                    <span>v{p.version}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleToggleActive(p)} title={p.is_active ? 'Вимкнути' : 'Увімкнути'}>
                    {p.is_active ? <ToggleRight size={16} className="text-success" /> : <ToggleLeft size={16} />}
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(p)}><Edit3 size={14} /></button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(p.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="crm-prompt-card-body">
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 60, overflow: 'hidden', fontFamily: 'monospace' }}>
                  {p.system_prompt.substring(0, 200)}
                  {p.system_prompt.length > 200 ? '...' : ''}
                </div>
              </div>
              <div className="crm-prompt-card-footer">
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {p.model} · T={p.temperature}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {new Date(p.updated_at).toLocaleDateString('uk-UA')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   Training Data Tab
   ================================================================ */
function TrainingTab() {
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/crm/ai/training?limit=100');
        if (res.ok) {
          const data = await res.json();
          setRecords(data.training || []);
        }
      } catch (err: any) { console.error('Помилка завантаження training data:', err); showError(err.message || 'Помилка завантаження даних тренування'); }
      setLoading(false);
    })();
  }, []);

  const stats = {
    total: records.length,
    approved: records.filter(r => r.was_approved).length,
    edited: records.filter(r => r.was_edited).length,
    rejected: records.filter(r => !r.was_approved).length,
  };

  return (
    <div>
      {error && (
        <div style={{position:'fixed',top:20,right:20,background:'#ef4444',color:'white',padding:'12px 20px',borderRadius:8,zIndex:9999,maxWidth:400,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'}} onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Training Data</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Історія AI-генерованих відповідей та зворотній зв'язок
        </p>
      </div>

      {/* Stats */}
      <div className="crm-training-stats">
        <div className="crm-stat-card">
          <div className="crm-stat-value">{stats.total}</div>
          <div className="crm-stat-label">Всього</div>
        </div>
        <div className="crm-stat-card">
          <div className="crm-stat-value" style={{ color: 'var(--accent-success)' }}>{stats.approved}</div>
          <div className="crm-stat-label">✅ Approved</div>
        </div>
        <div className="crm-stat-card">
          <div className="crm-stat-value" style={{ color: 'var(--accent-warning)' }}>{stats.edited}</div>
          <div className="crm-stat-label">✏️ Edited</div>
        </div>
        <div className="crm-stat-card">
          <div className="crm-stat-value" style={{ color: 'var(--accent-danger)' }}>{stats.rejected}</div>
          <div className="crm-stat-label">❌ Rejected</div>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <Loader2 size={20} className="animate-pulse" />
        </div>
      )}

      {!loading && records.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <BarChart3 size={32} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Даних ще немає</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Тренувальні дані з'являться після використання AI suggest в Inbox</div>
        </div>
      )}

      <div className="crm-training-list">
        {records.map(r => (
          <div key={r.id} className="crm-training-item">
            <div
              className="crm-training-item-header"
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                {expandedId === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span style={{ fontSize: 12, fontWeight: 500 }}>
                  {r.was_approved ? '✅' : '❌'} {r.was_edited ? '✏️' : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.guest_message.substring(0, 80)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {r.lead_stage && STAGE_CONFIG[r.lead_stage] && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-tertiary)' }}>
                    {STAGE_CONFIG[r.lead_stage].icon} {STAGE_CONFIG[r.lead_stage].label}
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {new Date(r.created_at).toLocaleDateString('uk-UA')}
                </span>
              </div>
            </div>
            {expandedId === r.id && (
              <div className="crm-training-item-details">
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>GUEST MESSAGE</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6 }}>{r.guest_message}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>AI DRAFT</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, padding: 8, background: 'rgba(99, 102, 241, 0.08)', borderRadius: 6, border: '1px solid rgba(99, 102, 241, 0.15)' }}>{r.ai_draft}</div>
                </div>
                {r.final_response && r.was_edited ? (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>FINAL (EDITED)</div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, padding: 8, background: 'rgba(245, 158, 11, 0.08)', borderRadius: 6, border: '1px solid rgba(245, 158, 11, 0.15)' }}>{r.final_response}</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
