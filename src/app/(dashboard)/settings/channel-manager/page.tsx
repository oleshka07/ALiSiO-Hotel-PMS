'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Plus, Edit3, Trash2, X, Save, Loader2, ArrowLeft,
  RefreshCw, Copy, Check, ExternalLink, Clock, AlertCircle,
  CheckCircle, Building2, Home, Link2, Settings2, MapPin,
  Wifi, WifiOff, Shield, Zap, Activity,
} from 'lucide-react';
import Link from 'next/link';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── iCal Types (existing) ──────────────────────────────────

interface ICalChannel {
  id: string;
  channel_type: 'building' | 'unit';
  building_id: string | null;
  unit_id: string | null;
  source_code: string;
  ical_url: string | null;
  export_token: string;
  sync_interval_minutes: number;
  is_active: number;
  last_synced_at: string | null;
  target_name: string;
  target_code: string;
  source_name: string;
  source_color: string;
  source_icon: string;
  last_log: {
    status: string;
    events_found: number;
    events_created: number;
    events_updated: number;
    error_message: string | null;
    synced_at: string;
  } | null;
}

interface BookingSource {
  id: string;
  name: string;
  code: string;
  color: string;
  icon_letter: string;
}

interface Building {
  id: string;
  name: string;
  code: string;
}

interface Unit {
  id: string;
  name: string;
  code: string;
  category_type: string;
}

// ─── API Channel Types (new) ────────────────────────────────

interface APIConnection {
  id: string;
  channel: string;
  external_property_id: string | null;
  status: string;
  connection_types: string[];
  pricing_model: string;
  credentials_id: string | null;
  last_synced_at: string | null;
  error_message: string | null;
  environment: string | null;
  client_id: string | null;
  token_valid: number;
  created_at: string;
}

interface RoomMapping {
  id: string;
  connection_id: string;
  unit_type_id: string;
  external_room_type_id: string;
  external_rate_plan_id: string;
  is_active: number;
  unit_type_name: string;
  unit_type_code: string;
}

interface UnitType {
  id: string;
  name: string;
  code: string;
  max_adults: number;
  max_occupancy: number;
}

interface SyncStats {
  queue: { pending: number; processing: number; completed: number; failed: number; total: number };
  failedJobs: any[];
  recentLogs: any[];
}

// ─── Modal ──────────────────────────────────────────────────

function Modal({ open, onClose, title, children, footer, width }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; width?: number;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: width || 520 }}>
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

// ─── Channel Info Badges ────────────────────────────────────

const CHANNEL_INFO: Record<string, { name: string; color: string; icon: string }> = {
  booking_com: { name: 'Booking.com', color: '#003580', icon: '🅱' },
  airbnb: { name: 'Airbnb', color: '#FF5A5F', icon: '🏠' },
  vrbo: { name: 'VRBO', color: '#2577D1', icon: '🏡' },
  expedia: { name: 'Expedia', color: '#FBCC33', icon: '✈' },
};

// ─── Main Page ──────────────────────────────────────────────

export default function ChannelManagerPage() {
  const [activeTab, setActiveTab] = useState<'api' | 'ical'>('api');
  const onMenuClick = useMobileMenu();

  // ── iCal state (existing) ──
  const [channels, setChannels] = useState<ICalChannel[]>([]);
  const [sources, setSources] = useState<BookingSource[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [glampingUnits, setGlampingUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showICalModal, setShowICalModal] = useState(false);
  const [editChannel, setEditChannel] = useState<ICalChannel | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [copiedToken, setCopiedToken] = useState('');

  const [icalForm, setICalForm] = useState({
    channel_type: 'unit' as 'building' | 'unit',
    building_id: '',
    unit_id: '',
    source_code: 'vrbo',
    ical_url: '',
    sync_interval_minutes: 15,
  });

  // ── API connections state (new) ──
  const [connections, setConnections] = useState<APIConnection[]>([]);
  const [mappingData, setMappingData] = useState<{ mappings: RoomMapping[]; unitTypes: UnitType[] }>({ mappings: [], unitTypes: [] });
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [showConnModal, setShowConnModal] = useState(false);
  const [showCredModal, setShowCredModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [selectedConn, setSelectedConn] = useState<APIConnection | null>(null);

  const [connForm, setConnForm] = useState({
    channel: 'booking_com',
    external_property_id: '',
    connection_types: ['RESERVATIONS', 'AVAILABILITY'] as string[],
  });

  const [credForm, setCredForm] = useState({
    channel: 'booking_com',
    environment: 'test',
    client_id: '',
    client_secret: '',
  });

  const [mappingForm, setMappingForm] = useState({
    connection_id: '',
    unit_type_id: '',
    external_room_type_id: '',
    external_rate_plan_id: '',
  });

  // ── Data fetching ──

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [chRes, srcRes, bldRes, unitRes, connRes, syncRes] = await Promise.all([
        fetch('/api/ical-sync/channels'),
        fetch('/api/booking-sources'),
        fetch('/api/buildings'),
        fetch('/api/units'),
        fetch('/api/channels/connections'),
        fetch('/api/channels/sync'),
      ]);
      const ch = await chRes.json();
      const src = await srcRes.json();
      const bld = await bldRes.json();
      const units = await unitRes.json();
      const conn = await connRes.json();
      const sync = await syncRes.json();

      if (Array.isArray(ch)) setChannels(ch);
      if (Array.isArray(src)) setSources(src);
      if (Array.isArray(bld)) setBuildings(bld);
      if (Array.isArray(units)) {
        setGlampingUnits(units.filter((u: any) => u.category_type === 'glamping'));
      }
      if (Array.isArray(conn)) setConnections(conn);
      if (sync && sync.queue) setSyncStats(sync);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const fetchMappings = useCallback(async (connectionId?: string) => {
    try {
      const url = connectionId
        ? `/api/channels/mapping?connection_id=${connectionId}`
        : '/api/channels/mapping';
      const res = await fetch(url);
      const data = await res.json();
      setMappingData(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Helpers ──

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'щойно';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} хв тому`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} год тому`;
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // ── iCal handlers (existing logic) ──

  const openNewICal = () => {
    setEditChannel(null);
    setICalForm({ channel_type: 'unit', building_id: '', unit_id: '', source_code: 'vrbo', ical_url: '', sync_interval_minutes: 15 });
    setShowICalModal(true);
  };

  const openEditICal = (ch: ICalChannel) => {
    setEditChannel(ch);
    setICalForm({
      channel_type: ch.channel_type, building_id: ch.building_id || '',
      unit_id: ch.unit_id || '', source_code: ch.source_code,
      ical_url: ch.ical_url || '', sync_interval_minutes: ch.sync_interval_minutes,
    });
    setShowICalModal(true);
  };

  const handleSaveICal = async () => {
    setSaving(true);
    try {
      const url = editChannel ? `/api/ical-sync/channels/${editChannel.id}` : '/api/ical-sync/channels';
      const method = editChannel ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(icalForm) });
      const data = await res.json();
      if (!res.ok) { showToast(`❌ ${data.error}`); }
      else { showToast(editChannel ? '✅ Канал оновлено' : '✅ Канал створено'); setShowICalModal(false); fetchData(); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDeleteICal = async (ch: ICalChannel) => {
    if (!confirm(`Видалити канал "${ch.target_name}"?`)) return;
    try {
      const res = await fetch(`/api/ical-sync/channels/${ch.id}`, { method: 'DELETE' });
      if (res.ok) { showToast('✅ Канал видалено'); fetchData(); }
    } catch (e) { console.error(e); }
  };

  const handleSyncICal = async (channelId: string) => {
    setSyncing(channelId);
    try {
      const res = await fetch('/api/ical-sync/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: channelId }) });
      const data = await res.json();
      if (data.results?.[0]?.status === 'success') {
        const r = data.results[0];
        showToast(`✅ Синхронізовано: ${r.events_found} подій, ${r.events_created} нових`);
      } else { showToast(`❌ ${data.results?.[0]?.error || 'Помилка'}`); }
      fetchData();
    } catch (e) { console.error(e); }
    setSyncing(null);
  };

  const handleSyncAllICal = async () => {
    setSyncingAll(true);
    try {
      const res = await fetch('/api/ical-sync/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      showToast(`✅ Синхронізовано ${data.synced} канал(ів)`);
      fetchData();
    } catch (e) { console.error(e); }
    setSyncingAll(false);
  };

  const copyExportUrl = (token: string) => {
    const url = `${window.location.origin}/api/ical-export/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 2000);
  };

  // ── API Connection handlers ──

  const handleCreateConnection = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/channels/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connForm),
      });
      const data = await res.json();
      if (res.ok) { showToast('✅ З\'єднання створено'); setShowConnModal(false); fetchData(); }
      else { showToast(`❌ ${data.error}`); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSaveCredentials = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/channels/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credForm),
      });
      const data = await res.json();
      if (res.ok) { showToast('✅ Credentials збережено'); setShowCredModal(false); fetchData(); }
      else { showToast(`❌ ${data.error}`); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleActivateConnection = async (conn: APIConnection) => {
    try {
      const res = await fetch(`/api/channels/connections/${conn.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: conn.status === 'connected' ? 'disconnected' : 'connected' }),
      });
      if (res.ok) { showToast(conn.status === 'connected' ? '⏸ З\'єднання деактивовано' : '✅ З\'єднання активовано'); fetchData(); }
    } catch (e) { console.error(e); }
  };

  const handleDeleteConnection = async (conn: APIConnection) => {
    if (!confirm(`Видалити з'єднання ${CHANNEL_INFO[conn.channel]?.name || conn.channel}?`)) return;
    try {
      const res = await fetch(`/api/channels/connections/${conn.id}`, { method: 'DELETE' });
      if (res.ok) { showToast('✅ З\'єднання видалено'); fetchData(); }
    } catch (e) { console.error(e); }
  };

  const handleSaveMapping = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/channels/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('✅ Mapping збережено');
        fetchMappings(mappingForm.connection_id);
      } else { showToast(`❌ ${data.error}`); }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDeleteMapping = async (id: string) => {
    try {
      const res = await fetch(`/api/channels/mapping?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('✅ Mapping видалено');
        if (selectedConn) fetchMappings(selectedConn.id);
      }
    } catch (e) { console.error(e); }
  };

  const openMappingModal = (conn: APIConnection) => {
    setSelectedConn(conn);
    setMappingForm({ connection_id: conn.id, unit_type_id: '', external_room_type_id: '', external_rate_plan_id: '' });
    fetchMappings(conn.id);
    setShowMappingModal(true);
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <>
      <Header title="Канал-менеджер" onMenuClick={onMenuClick} />
      <div className="app-content">
        {toast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 1000,
            background: toast.startsWith('❌') ? 'var(--accent-danger)' : 'var(--accent-success)',
            color: '#fff', padding: '12px 20px', borderRadius: 'var(--radius-md)',
            fontWeight: 600, fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease', maxWidth: 400,
          }}>
            {toast}
          </div>
        )}

        <div className="page-header">
          <div>
            <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 4, textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Налаштування
            </Link>
            <h2 className="page-title">Канал-менеджер</h2>
            <div className="page-subtitle">API інтеграції та iCal синхронізація з OTA</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border-primary)' }}>
          <button
            onClick={() => setActiveTab('api')}
            style={{
              padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'none',
              color: activeTab === 'api' ? 'var(--accent-primary-text)' : 'var(--text-tertiary)',
              borderBottom: activeTab === 'api' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Zap size={16} /> API Інтеграції
            {connections.length > 0 && (
              <span style={{ background: 'var(--accent-primary)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
                {connections.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('ical')}
            style={{
              padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'none',
              color: activeTab === 'ical' ? 'var(--accent-primary-text)' : 'var(--text-tertiary)',
              borderBottom: activeTab === 'ical' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <RefreshCw size={16} /> iCal Sync
            {channels.length > 0 && (
              <span style={{ background: 'var(--text-tertiary)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
                {channels.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <Loader2 size={24} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження...
          </div>
        ) : activeTab === 'api' ? (
          /* ═══════════════════════════════════════════════════
             API INTEGRATIONS TAB
             ═══════════════════════════════════════════════════ */
          <div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-primary" onClick={() => { setConnForm({ channel: 'booking_com', external_property_id: '', connection_types: ['RESERVATIONS', 'AVAILABILITY'] }); setShowConnModal(true); }}>
                <Plus size={16} /> Нове з&apos;єднання
              </button>
              <button className="btn btn-secondary" onClick={() => { setCredForm({ channel: 'booking_com', environment: 'test', client_id: '', client_secret: '' }); setShowCredModal(true); }}>
                <Shield size={16} /> Credentials
              </button>
            </div>

            {/* Sync Stats Bar */}
            {syncStats && (
              <div className="card" style={{ padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <Activity size={14} style={{ color: 'var(--accent-primary-text)' }} />
                  <span style={{ fontWeight: 700 }}>Sync Queue:</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <span>⏳ Pending: <b>{syncStats.queue.pending}</b></span>
                  <span>⚡ Processing: <b>{syncStats.queue.processing}</b></span>
                  <span style={{ color: 'var(--accent-success)' }}>✅ Done: <b>{syncStats.queue.completed}</b></span>
                  {syncStats.queue.failed > 0 && (
                    <span style={{ color: 'var(--accent-danger)' }}>❌ Failed: <b>{syncStats.queue.failed}</b></span>
                  )}
                </div>
              </div>
            )}

            {/* Connections List */}
            {connections.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔌</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                  Немає API з&apos;єднань
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                  Додайте з&apos;єднання з Booking.com для real-time синхронізації бронювань та цін через їх Connectivity API
                </div>
                <button className="btn btn-primary" onClick={() => { setConnForm({ channel: 'booking_com', external_property_id: '', connection_types: ['RESERVATIONS', 'AVAILABILITY'] }); setShowConnModal(true); }}>
                  <Plus size={16} /> Додати Booking.com
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {connections.map(conn => {
                  const info = CHANNEL_INFO[conn.channel] || { name: conn.channel, color: '#666', icon: '🔗' };
                  const isConnected = conn.status === 'connected';
                  const hasCredentials = !!conn.credentials_id;
                  const hasToken = !!conn.token_valid;

                  return (
                    <div key={conn.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-primary)' }}>
                        {/* Channel icon */}
                        <div style={{
                          width: 48, height: 48, borderRadius: 'var(--radius-md)',
                          background: `${info.color}15`, color: info.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 22, fontWeight: 700, flexShrink: 0,
                        }}>
                          {info.icon}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                              {info.name}
                            </span>
                            <span className="badge" style={{
                              background: isConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                              color: isConnected ? '#22c55e' : 'var(--accent-danger)',
                              fontWeight: 700, fontSize: 11,
                            }}>
                              {isConnected ? <><Wifi size={10} /> Connected</> : <><WifiOff size={10} /> {conn.status}</>}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            {conn.external_property_id && (
                              <span>🏨 Property: <b>{conn.external_property_id}</b></span>
                            )}
                            <span>🔑 {hasCredentials ? (hasToken ? '✅ Token active' : '⚠ Token expired') : '❌ No credentials'}</span>
                            <span>📋 {conn.connection_types?.join(', ') || '—'}</span>
                            {conn.last_synced_at && (
                              <span><Clock size={11} /> {formatTime(conn.last_synced_at)}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => openMappingModal(conn)} title="Room Mapping">
                            <MapPin size={14} /> Mapping
                          </button>
                          <button
                            className={`btn btn-sm ${isConnected ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => handleActivateConnection(conn)}
                            title={isConnected ? 'Деактивувати' : 'Активувати'}
                          >
                            {isConnected ? <WifiOff size={14} /> : <Wifi size={14} />}
                          </button>
                          <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDeleteConnection(conn)} title="Видалити">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Error */}
                      {conn.error_message && (
                        <div style={{
                          padding: '8px 20px', background: 'rgba(239,68,68,0.08)',
                          borderTop: '1px solid var(--border-primary)',
                          fontSize: 12, color: 'var(--accent-danger)',
                        }}>
                          ⚠ {conn.error_message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recent Sync Logs */}
            {syncStats && syncStats.recentLogs.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                  📜 Останні sync логи
                </h3>
                <div className="card" style={{ padding: 0, overflow: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Час</th>
                        <th>Канал</th>
                        <th>Напрямок</th>
                        <th>Endpoint</th>
                        <th>Status</th>
                        <th>RUID</th>
                        <th>Час (ms)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncStats.recentLogs.map((log: any) => (
                        <tr key={log.id}>
                          <td>{formatTime(log.created_at)}</td>
                          <td>{CHANNEL_INFO[log.channel]?.name || log.channel}</td>
                          <td>{log.direction === 'outbound' ? '⬆' : '⬇'} {log.direction}</td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.endpoint}</td>
                          <td>
                            <span className="badge" style={{
                              background: log.response_status < 300 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                              color: log.response_status < 300 ? '#22c55e' : 'var(--accent-danger)',
                              fontSize: 10,
                            }}>
                              {log.response_status || '—'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{log.ruid || '—'}</td>
                          <td>{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════
             iCAL TAB (existing logic, preserved)
             ═══════════════════════════════════════════════════ */
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-secondary" onClick={handleSyncAllICal} disabled={syncingAll || channels.length === 0}>
                <RefreshCw size={16} className={syncingAll ? 'animate-pulse' : ''} />
                {syncingAll ? 'Синхронізація...' : 'Синхронізувати все'}
              </button>
              <button className="btn btn-primary" onClick={openNewICal}>
                <Plus size={16} /> Додати канал
              </button>
            </div>

            {channels.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                  Немає налаштованих iCal каналів
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>
                  Додайте iCal канал для синхронізації з VRBO, Airbnb або іншим OTA
                </div>
                <button className="btn btn-primary" onClick={openNewICal}>
                  <Plus size={16} /> Додати перший канал
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {channels.map((ch) => (
                  <div key={ch.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-primary)' }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 'var(--radius-md)',
                        background: ch.source_color ? `${ch.source_color}18` : 'var(--bg-tertiary)',
                        color: ch.source_color || 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 700, flexShrink: 0,
                      }}>
                        {ch.channel_type === 'building' ? <Building2 size={22} /> : <Home size={22} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{ch.target_name || ch.target_code}</span>
                          <span className="badge" style={{ background: (ch.source_color || '#6c7086') + '22', color: ch.source_color || '#6c7086', fontWeight: 700, fontSize: 11 }}>
                            {ch.source_icon} {ch.source_name || ch.source_code}
                          </span>
                          {!ch.is_active && <span className="badge badge-danger" style={{ fontSize: 10 }}>Вимкнено</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Інтервал: {ch.sync_interval_minutes} хв</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {ch.last_log?.status === 'success'
                              ? <><CheckCircle size={12} style={{ color: 'var(--accent-success)' }} /> {formatTime(ch.last_synced_at)}</>
                              : ch.last_log?.status === 'error'
                              ? <><AlertCircle size={12} style={{ color: 'var(--accent-danger)' }} /> Помилка</>
                              : <>Ще не синхронізовано</>
                            }
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {ch.ical_url && (
                          <button className="btn btn-sm btn-secondary" onClick={() => handleSyncICal(ch.id)} disabled={syncing === ch.id} title="Синхронізувати">
                            <RefreshCw size={14} className={syncing === ch.id ? 'animate-pulse' : ''} />
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openEditICal(ch)} title="Редагувати"><Edit3 size={14} /></button>
                        <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDeleteICal(ch)} title="Видалити"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ch.ical_url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, minWidth: 56 }}>⬇ Імпорт</span>
                          <code style={{ flex: 1, fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.ical_url}
                          </code>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, minWidth: 56 }}>⬆ Експорт</span>
                        <code style={{ flex: 1, fontSize: 11, padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          /api/ical-export/{ch.export_token}
                        </code>
                        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => copyExportUrl(ch.export_token)} title="Копіювати URL" style={{ color: copiedToken === ch.export_token ? 'var(--accent-success)' : 'var(--text-tertiary)' }}>
                          {copiedToken === ch.export_token ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <a href={`/api/ical-export/${ch.export_token}`} target="_blank" className="btn btn-sm btn-ghost btn-icon" title="Відкрити iCal" style={{ color: 'var(--text-tertiary)' }}>
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </div>
                    {ch.last_log?.status === 'error' && ch.last_log.error_message && (
                      <div style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.08)', borderTop: '1px solid var(--border-primary)', fontSize: 12, color: 'var(--accent-danger)' }}>
                        ⚠ {ch.last_log.error_message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ MODALS ═══ */}

        {/* New API Connection Modal */}
        <Modal
          open={showConnModal}
          onClose={() => setShowConnModal(false)}
          title="Нове API з'єднання"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowConnModal(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleCreateConnection} disabled={saving}>
              <Save size={16} /> {saving ? 'Створення...' : 'Створити'}
            </button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">Канал *</label>
            <select className="form-select" value={connForm.channel} onChange={e => setConnForm(p => ({ ...p, channel: e.target.value }))}>
              <option value="booking_com">🅱 Booking.com</option>
              <option value="airbnb">🏠 Airbnb</option>
              <option value="vrbo">🏡 VRBO</option>
              <option value="expedia">✈ Expedia</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">External Property ID</label>
            <input className="form-input" placeholder="Наприклад: 12345678" value={connForm.external_property_id} onChange={e => setConnForm(p => ({ ...p, external_property_id: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              ID вашого об&apos;єкту на платформі OTA (можна додати пізніше)
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Типи з&apos;єднання</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['RESERVATIONS', 'AVAILABILITY', 'CONTENT', 'PHOTOS', 'PROMOTIONS'].map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={connForm.connection_types.includes(t)}
                    onChange={e => {
                      setConnForm(p => ({
                        ...p,
                        connection_types: e.target.checked
                          ? [...p.connection_types, t]
                          : p.connection_types.filter(x => x !== t),
                      }));
                    }}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
        </Modal>

        {/* Credentials Modal */}
        <Modal
          open={showCredModal}
          onClose={() => setShowCredModal(false)}
          title="API Credentials"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowCredModal(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleSaveCredentials} disabled={saving}>
              <Shield size={16} /> {saving ? 'Збереження...' : 'Зберегти'}
            </button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">Канал *</label>
            <select className="form-select" value={credForm.channel} onChange={e => setCredForm(p => ({ ...p, channel: e.target.value }))}>
              <option value="booking_com">🅱 Booking.com</option>
              <option value="airbnb">🏠 Airbnb</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Середовище *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn ${credForm.environment === 'test' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setCredForm(p => ({ ...p, environment: 'test' }))}>
                🧪 Test
              </button>
              <button className={`btn ${credForm.environment === 'production' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setCredForm(p => ({ ...p, environment: 'production' }))}>
                🚀 Production
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Client ID *</label>
            <input className="form-input" placeholder="machine-account-client-id" value={credForm.client_id} onChange={e => setCredForm(p => ({ ...p, client_id: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Client Secret *</label>
            <input className="form-input" type="password" placeholder="●●●●●●●●●●" value={credForm.client_secret} onChange={e => setCredForm(p => ({ ...p, client_secret: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Отримані з Booking.com Provider Portal → Machine Accounts
            </div>
          </div>
        </Modal>

        {/* Room Mapping Modal */}
        <Modal
          open={showMappingModal}
          onClose={() => setShowMappingModal(false)}
          title={`Room Mapping — ${selectedConn ? (CHANNEL_INFO[selectedConn.channel]?.name || selectedConn.channel) : ''}`}
          width={640}
          footer={<button className="btn btn-secondary" onClick={() => setShowMappingModal(false)}>Закрити</button>}
        >
          {/* Existing mappings */}
          {mappingData.mappings.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-tertiary)' }}>АКТИВНІ MAPPING</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {mappingData.mappings.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                    <Link2 size={14} style={{ color: 'var(--accent-primary-text)' }} />
                    <span style={{ flex: 1, fontSize: 13 }}>
                      <b>{m.unit_type_name}</b> ({m.unit_type_code})
                      <span style={{ color: 'var(--text-tertiary)' }}> → </span>
                      Room: <b>{m.external_room_type_id || '—'}</b>, Rate: <b>{m.external_rate_plan_id || '—'}</b>
                    </span>
                    <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }} onClick={() => handleDeleteMapping(m.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add new mapping */}
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-tertiary)' }}>ДОДАТИ MAPPING</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Тип кімнати (PMS)</label>
              <select className="form-select" value={mappingForm.unit_type_id} onChange={e => setMappingForm(p => ({ ...p, unit_type_id: e.target.value }))}>
                <option value="">Оберіть...</option>
                {mappingData.unitTypes.map(ut => (
                  <option key={ut.id} value={ut.id}>{ut.name} ({ut.code})</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">External Room Type ID</label>
                <input className="form-input" placeholder="RT_12345" value={mappingForm.external_room_type_id} onChange={e => setMappingForm(p => ({ ...p, external_room_type_id: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">External Rate Plan ID</label>
                <input className="form-input" placeholder="RP_STD" value={mappingForm.external_rate_plan_id} onChange={e => setMappingForm(p => ({ ...p, external_rate_plan_id: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSaveMapping} disabled={!mappingForm.unit_type_id || saving}>
              <Plus size={14} /> Зберегти mapping
            </button>
          </div>
        </Modal>

        {/* iCal Create/Edit Modal */}
        <Modal
          open={showICalModal}
          onClose={() => setShowICalModal(false)}
          title={editChannel ? 'Редагувати канал' : 'Новий iCal канал'}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setShowICalModal(false)}>Скасувати</button>
            <button className="btn btn-primary" onClick={handleSaveICal} disabled={saving}>
              <Save size={16} /> {saving ? 'Збереження...' : 'Зберегти'}
            </button>
          </>}
        >
          {!editChannel && (<>
            <div className="form-group">
              <label className="form-label">Тип каналу *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn ${icalForm.channel_type === 'building' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setICalForm(p => ({ ...p, channel_type: 'building', unit_id: '' }))}>
                  <Building2 size={16} /> Будівля
                </button>
                <button className={`btn ${icalForm.channel_type === 'unit' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => setICalForm(p => ({ ...p, channel_type: 'unit', building_id: '' }))}>
                  <Home size={16} /> Будинок
                </button>
              </div>
            </div>
            {icalForm.channel_type === 'building' && (
              <div className="form-group">
                <label className="form-label">Будівля *</label>
                <select className="form-select" value={icalForm.building_id} onChange={e => setICalForm(p => ({ ...p, building_id: e.target.value }))}>
                  <option value="">Оберіть...</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {icalForm.channel_type === 'unit' && (
              <div className="form-group">
                <label className="form-label">Будинок (Glamping) *</label>
                <select className="form-select" value={icalForm.unit_id} onChange={e => setICalForm(p => ({ ...p, unit_id: e.target.value }))}>
                  <option value="">Оберіть...</option>
                  {glampingUnits.map(u => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                </select>
              </div>
            )}
          </>)}
          <div className="form-group">
            <label className="form-label">Джерело (OTA) *</label>
            <select className="form-select" value={icalForm.source_code} onChange={e => setICalForm(p => ({ ...p, source_code: e.target.value }))}>
              {sources.filter(s => !['direct', 'phone', 'whatsapp'].includes(s.code)).map(s => (
                <option key={s.code} value={s.code}>{s.icon_letter} {s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">📥 iCal URL (імпорт)</label>
            <input className="form-input" placeholder="https://www.vrbo.com/icalendar/...ics" value={icalForm.ical_url} onChange={e => setICalForm(p => ({ ...p, ical_url: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Посилання з OTA платформи для імпорту бронювань.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">⏱ Інтервал синхронізації</label>
            <select className="form-select" value={icalForm.sync_interval_minutes} onChange={e => setICalForm(p => ({ ...p, sync_interval_minutes: Number(e.target.value) }))}>
              <option value={5}>5 хв</option>
              <option value={15}>15 хв (рекомендовано)</option>
              <option value={30}>30 хв</option>
              <option value={60}>1 година</option>
            </select>
          </div>
        </Modal>
      </div>
    </>
  );
}
