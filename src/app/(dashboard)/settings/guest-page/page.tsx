/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { Save, Check, Plus, Trash2, ChevronDown, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ImageUploadField } from '@/components/ui/ImageUploadField';

// ─── Interfaces ──────────────────────────────────
interface ConfigItem {
  unit_type_id: string;
  unit_type_name: string;
  unit_type_code: string;
  category_type: string;
  category_name: string;
  category_icon: string;
  amenities: string;
  check_in_instructions: string;
  external_amenities: string | null;
  faq_items: string;
  rules: string;
  wifi_network: string;
  wifi_password: string;
  restaurant_name: string;
  restaurant_hours: string;
  restaurant_menu_url: string | null;
  useful_info: string;
  lock_code: string;
  maps_url: string;
  territory_map_url: string | null;
}

interface AmenityItem { icon: string; name: string; }
interface FaqItem { q: string; a: string; }
interface RuleItem { icon: string; text: string; }
interface UsefulItem { icon: string; title: string; desc: string; url?: string; photo_url?: string; }

function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ─── Upload helper ───────────────────────────────
async function uploadImage(file: File, folder: string): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  try {
    const res = await fetch('/api/file-upload', { method: 'POST', body: formData });
    if (res.ok) {
      const data = await res.json();
      return data.url;
    }
    return null;
  } catch { return null; }
}

// ─── Section Header ──────────────────────────────
function SectionHeader({ id, title, icon, openSections, toggle }: { id: string; title: string; icon: string; openSections: Set<string>; toggle: (id: string) => void }) {
  return (
    <button onClick={() => toggle(id)} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0',
      background: 'none', border: 'none', borderBottom: '1px solid var(--border-primary)',
      color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, flex: 1, textAlign: 'left' }}>{title}</span>
      {openSections.has(id) ? <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />}
    </button>
  );
}

// ═════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════
export default function GuestPageSettingsPage() {
  const [activeTab, setActiveTab] = useState<'property' | 'unit-types'>('property');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['wifi', 'restaurant']));
  const onMenuClick = useMobileMenu();

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  const toggleSection = (id: string) => {
    setOpenSections(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // ═══ PROPERTY STATE ═══
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [propConfig, setPropConfig] = useState<any>(null);
  // Property form fields
  const [pWifi, setPWifi] = useState('');
  const [pWifiPass, setPWifiPass] = useState('');
  const [pRestName, setPRestName] = useState('');
  const [pRestHours, setPRestHours] = useState('');
  const [pRestMenu, setPRestMenu] = useState('');
  const [pRules, setPRules] = useState<RuleItem[]>([]);
  const [pFaq, setPFaq] = useState<FaqItem[]>([]);
  const [pUseful, setPUseful] = useState<UsefulItem[]>([]);
  const [pMaps, setPMaps] = useState('');
  const [pTerritoryMap, setPTerritoryMap] = useState('');
  const [pPets, setPPets] = useState('welcome');
  const [pParking, setPParking] = useState('');
  const [pParkingPhoto, setPParkingPhoto] = useState('');
  const [pWeatherLat, setPWeatherLat] = useState('');
  const [pWeatherLon, setPWeatherLon] = useState('');
  const [pEmergency, setPEmergency] = useState('');
  const [pVideoGuide, setPVideoGuide] = useState('');
  const [pGateCode, setPGateCode] = useState('4545');
  const [pGatePhoto, setPGatePhoto] = useState('');

  // ═══ UNIT TYPE STATE ═══
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [selected, setSelected] = useState<string>('');
  // Unit type form fields
  const [amenities, setAmenities] = useState<AmenityItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [lockCode, setLockCode] = useState('');
  const [petsPolicy, setPetsPolicy] = useState('');
  const [entryPhotoUrl, setEntryPhotoUrl] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [gatePhotoUrl, setGatePhotoUrl] = useState('');

  // ─── Fetch ─────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch properties
      const propRes = await fetch('/api/properties');
      const propData = await propRes.json();
      if (Array.isArray(propData)) {
        setProperties(propData);
        if (!selectedProperty && propData.length > 0) {
          setSelectedProperty(propData[0].id);
        }
      }

      // Fetch property guest configs
      const pgcRes = await fetch('/api/property-guest-config');
      const pgcData = await pgcRes.json();
      if (Array.isArray(pgcData) && pgcData.length > 0) {
        setPropConfig(pgcData[0]);
        loadPropertyConfig(pgcData[0]);
        if (!selectedProperty) setSelectedProperty(pgcData[0].property_id);
      }

      // Fetch unit type configs
      const utRes = await fetch('/api/guest-page-config');
      const utData = await utRes.json();
      if (Array.isArray(utData)) {
        setConfigs(utData);
        if (!selected && utData.length > 0) {
          setSelected(utData[0].unit_type_id);
          loadUnitTypeConfig(utData[0]);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Load property config ─────────────────────
  const loadPropertyConfig = (cfg: any) => {
    setPWifi(cfg.wifi_network || '');
    setPWifiPass(cfg.wifi_password || '');
    setPRestName(cfg.restaurant_name || '');
    setPRestHours(cfg.restaurant_hours || '');
    setPRestMenu(cfg.restaurant_menu_url || '');
    setPRules(parseJSON<RuleItem[]>(cfg.rules, []));
    setPFaq(parseJSON<FaqItem[]>(cfg.faq_items, []));
    setPUseful(parseJSON<UsefulItem[]>(cfg.useful_info, []));
    setPMaps(cfg.maps_url || '');
    setPTerritoryMap(cfg.territory_map_url || '');
    setPPets(cfg.pets_policy || 'welcome');
    setPParking(cfg.parking_info || '');
    setPParkingPhoto(cfg.parking_photo_url || '');
    setPWeatherLat(cfg.weather_lat?.toString() || '');
    setPWeatherLon(cfg.weather_lon?.toString() || '');
    setPEmergency(cfg.emergency_phone || '');
    setPVideoGuide(cfg.video_guide_url || '');
    setPGateCode(cfg.gate_code || '4545');
    setPGatePhoto(cfg.gate_photo_url || '');
  };

  // ─── Load unit type config ────────────────────
  const loadUnitTypeConfig = (cfg: ConfigItem) => {
    setAmenities(parseJSON<AmenityItem[]>(cfg.amenities, []));
    setInstructions(cfg.check_in_instructions || '');
    setLockCode((cfg as any).lock_code || '');
    setPetsPolicy((cfg as any).pets_policy || '');
    setEntryPhotoUrl((cfg as any).entry_photo_url || '');
    setGateCode((cfg as any).gate_code || '');
    setGatePhotoUrl((cfg as any).gate_photo_url || '');
  };

  const handleSelectUnitType = (utId: string) => {
    setSelected(utId);
    const cfg = configs.find(c => c.unit_type_id === utId);
    if (cfg) loadUnitTypeConfig(cfg);
  };

  // ─── Save property config ─────────────────────
  const savePropertyConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/property-guest-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: selectedProperty || propConfig?.property_id,
          wifi_network: pWifi, wifi_password: pWifiPass,
          restaurant_name: pRestName, restaurant_hours: pRestHours, restaurant_menu_url: pRestMenu || null,
          rules: pRules, faq_items: pFaq, useful_info: pUseful,
          maps_url: pMaps || null, territory_map_url: pTerritoryMap || null,
          pets_policy: pPets, parking_info: pParking, parking_photo_url: pParkingPhoto || null,
          weather_lat: pWeatherLat ? parseFloat(pWeatherLat) : null,
          weather_lon: pWeatherLon ? parseFloat(pWeatherLon) : null,
          emergency_phone: pEmergency || null, video_guide_url: pVideoGuide || null,
          gate_code: pGateCode || '4545', gate_photo_url: pGatePhoto || null,
        }),
      });
      if (res.ok) { showToast('Збережено!'); fetchAll(); } else showToast('Помилка збереження');
    } catch { showToast('Помилка мережі'); }
    setSaving(false);
  };

  // ─── Save unit type config ────────────────────
  const saveUnitTypeConfig = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/guest-page-config/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amenities,
          check_in_instructions: instructions,
          lock_code: lockCode || null,
          pets_policy: petsPolicy || null,
          entry_photo_url: entryPhotoUrl || null,
          gate_code: gateCode || null,
          gate_photo_url: gatePhotoUrl || null,
        }),
      });
      if (res.ok) { showToast('Збережено!'); fetchAll(); } else showToast('Помилка збереження');
    } catch { showToast('Помилка мережі'); }
    setSaving(false);
  };

  const SH = ({ id, title, icon }: { id: string; title: string; icon: string }) => (
    <SectionHeader id={id} title={title} icon={icon} openSections={openSections} toggle={toggleSection} />
  );

  const catColors: Record<string, string> = { glamping: '#a78bfa', resort: '#60a5fa', camping: '#34d399' };
  const selectedConfig = configs.find(c => c.unit_type_id === selected);

  // ═════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════
  return (
    <>
      <Header title="Гостьова сторінка" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 1000,
            background: 'var(--accent-success)', color: '#fff',
            padding: '12px 20px', borderRadius: 'var(--radius-md)',
            fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease',
          }}>
            <Check size={16} /> {toast}
          </div>
        )}

        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Link href="/settings" style={{ color: 'var(--text-tertiary)', display: 'flex' }}><ArrowLeft size={18} /></Link>
              <h2 className="page-title">Налаштування гостьової сторінки</h2>
            </div>
            <div className="page-subtitle">Спільні налаштування та контент для кожного типу проживання</div>
          </div>
          <button className="btn btn-primary" onClick={activeTab === 'property' ? savePropertyConfig : saveUnitTypeConfig} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-pulse" /> : <Save size={16} />} Зберегти
          </button>
        </div>

        {/* ═══ TAB SWITCHER ═══ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 4 }}>
          {[
            { id: 'property' as const, label: '🏨 Property (спільне)', desc: 'WiFi, ресторан, правила, Explore' },
            { id: 'unit-types' as const, label: '🏠 Unit Types', desc: 'Amenities, код замка, інструкції' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex: 1, padding: '10px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 700 : 500, fontSize: 13, fontFamily: 'inherit',
              transition: 'all 0.2s ease', textAlign: 'left',
            }}>
              <div>{tab.label}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{tab.desc}</div>
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
            <Loader2 size={20} className="animate-pulse" style={{ display: 'inline-block' }} /> Завантаження…
          </div>
        ) : (
          <>
            {/* ═══════════════════════════════════════════ */}
            {/* ═══ PROPERTY TAB ═══════════════════════════ */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === 'property' && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>🏨</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Спільні налаштування</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Ці дані відображаються для ВСІХ типів проживання</div>
                  </div>
                </div>

                {/* Gate & Territory */}
                <SH id="gate" title="Вхід на територію (Ворота та калітка)" icon="🚪" />
                {openSections.has('gate') && (
                  <div style={{ padding: '16px 0' }}>
                    <div className="form-group">
                      <label className="form-label">Код від калітки (на панелі при вході)</label>
                      <input className="form-input" value={pGateCode} placeholder="4545" onChange={e => setPGateCode(e.target.value)} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <ImageUploadField
                        label="📸 Фото калітки та ворот"
                        value={pGatePhoto}
                        onChange={url => setPGatePhoto(url)}
                        folder="guest-config"
                        aspectRatio="16/9"
                      />
                    </div>
                  </div>
                )}

                {/* WiFi */}
                <SH id="wifi" title="Wi-Fi" icon="📶" />
                {openSections.has('wifi') && (
                  <div style={{ padding: '16px 0' }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Мережа</label>
                        <input className="form-input" value={pWifi} onChange={e => setPWifi(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Пароль</label>
                        <input className="form-input" value={pWifiPass} onChange={e => setPWifiPass(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Restaurant */}
                <SH id="restaurant" title="Ресторан" icon="🍽️" />
                {openSections.has('restaurant') && (
                  <div style={{ padding: '16px 0' }}>
                    <div className="form-group">
                      <label className="form-label">Назва</label>
                      <input className="form-input" value={pRestName} onChange={e => setPRestName(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Години роботи</label>
                      <textarea className="form-input" rows={3} value={pRestHours} onChange={e => setPRestHours(e.target.value)} style={{ resize: 'vertical' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Посилання на меню (URL)</label>
                      <input className="form-input" type="url" value={pRestMenu} placeholder="https://..." onChange={e => setPRestMenu(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Rules */}
                <SH id="rules" title="Правила перебування" icon="📜" />
                {openSections.has('rules') && (
                  <div style={{ padding: '16px 0' }}>
                    {pRules.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <input className="form-input" style={{ width: 50, textAlign: 'center', fontSize: 18, padding: '6px 4px' }}
                          value={r.icon} onChange={e => setPRules(prev => prev.map((p, idx) => idx === i ? { ...p, icon: e.target.value } : p))} />
                        <input className="form-input" style={{ flex: 1 }} value={r.text} placeholder="Правило"
                          onChange={e => setPRules(prev => prev.map((p, idx) => idx === i ? { ...p, text: e.target.value } : p))} />
                        <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                          onClick={() => setPRules(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button className="btn btn-sm btn-ghost" onClick={() => setPRules(prev => [...prev, { icon: '📌', text: '' }])}>
                      <Plus size={14} /> Додати правило
                    </button>
                  </div>
                )}

                {/* FAQ */}
                <SH id="faq" title="FAQ" icon="❓" />
                {openSections.has('faq') && (
                  <div style={{ padding: '16px 0' }}>
                    {pFaq.map((f, i) => (
                      <div key={i} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>Питання {i + 1}</span>
                          <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                            onClick={() => setPFaq(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={12} /></button>
                        </div>
                        <input className="form-input" value={f.q} placeholder="Питання" style={{ marginBottom: 8, fontWeight: 600 }}
                          onChange={e => setPFaq(prev => prev.map((p, idx) => idx === i ? { ...p, q: e.target.value } : p))} />
                        <textarea className="form-input" rows={2} value={f.a} placeholder="Відповідь" style={{ resize: 'vertical' }}
                          onChange={e => setPFaq(prev => prev.map((p, idx) => idx === i ? { ...p, a: e.target.value } : p))} />
                      </div>
                    ))}
                    <button className="btn btn-sm btn-ghost" onClick={() => setPFaq(prev => [...prev, { q: '', a: '' }])}>
                      <Plus size={14} /> Додати питання
                    </button>
                  </div>
                )}

                {/* Useful Info / Explore */}
                <SH id="useful" title="Explore — Корисна інформація" icon="💡" />
                {openSections.has('useful') && (
                  <div style={{ padding: '16px 0' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                      Магазини, аптеки, маршрути — спільне для всіх гостей
                    </div>
                    {pUseful.map((u, i) => (
                      <div key={i} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>Блок {i + 1}</span>
                          <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                            onClick={() => setPUseful(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={12} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input className="form-input" style={{ width: 50, textAlign: 'center', fontSize: 18, padding: '6px 4px' }}
                            value={u.icon} onChange={e => setPUseful(prev => prev.map((p, idx) => idx === i ? { ...p, icon: e.target.value } : p))} />
                          <input className="form-input" style={{ flex: 1 }} value={u.title} placeholder="Заголовок"
                            onChange={e => setPUseful(prev => prev.map((p, idx) => idx === i ? { ...p, title: e.target.value } : p))} />
                        </div>
                        <textarea className="form-input" rows={2} value={u.desc} placeholder="Опис" style={{ resize: 'vertical', marginBottom: 8 }}
                          onChange={e => setPUseful(prev => prev.map((p, idx) => idx === i ? { ...p, desc: e.target.value } : p))} />
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: 11 }}>🔗 Посилання (URL) — з'явиться кнопка &quot;Navigate&quot; на сторінці</label>
                          <input className="form-input" type="url" value={u.url || ''} placeholder="https://maps.google.com/..."
                            onChange={e => setPUseful(prev => prev.map((p, idx) => idx === i ? { ...p, url: e.target.value } : p))} />
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <ImageUploadField
                            label="📸 Фото місця (показується в каруселі)"
                            value={(u as any).photo_url || ''}
                            onChange={url => setPUseful(prev => prev.map((p, idx) => idx === i ? { ...p, photo_url: url } : p))}
                            folder="explore"
                            aspectRatio="4/3"
                          />
                        </div>
                      </div>
                    ))}
                    <button className="btn btn-sm btn-ghost" onClick={() => setPUseful(prev => [...prev, { icon: '📌', title: '', desc: '', url: '', photo_url: '' }])}>
                      <Plus size={14} /> Додати блок
                    </button>
                  </div>
                )}

                {/* Navigation */}
                <SH id="navigation" title="Навігація та карти" icon="🗺" />
                {openSections.has('navigation') && (
                  <div style={{ padding: '16px 0' }}>
                    <div className="form-group">
                      <label className="form-label">Google Maps URL (спільний)</label>
                      <input className="form-input" type="url" value={pMaps} placeholder="https://maps.app.goo.gl/..." onChange={e => setPMaps(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Карта території (URL зображення)</label>
                      <input className="form-input" type="url" value={pTerritoryMap} placeholder="https://..." onChange={e => setPTerritoryMap(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Pets & Parking */}
                <SH id="pets-parking" title="Тварини та паркінг" icon="🐕" />
                {openSections.has('pets-parking') && (
                  <div style={{ padding: '16px 0' }}>
                    <div className="form-group">
                      <label className="form-label">Політика щодо тварин</label>
                      <select className="form-input" value={pPets} onChange={e => setPPets(e.target.value)}>
                        <option value="welcome">🐕 Можна з тваринами</option>
                        <option value="with_fee">💰 З доплатою</option>
                        <option value="not_allowed">🚫 Не допускаються</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Інформація про паркінг</label>
                      <textarea className="form-input" rows={2} value={pParking} placeholder="Free parking at the entrance..." onChange={e => setPParking(e.target.value)} style={{ resize: 'vertical' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Фото паркінгу (URL)</label>
                      <input className="form-input" value={pParkingPhoto} placeholder="https://example.com/parking.jpg" onChange={e => setPParkingPhoto(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Weather */}
                <SH id="weather" title="Погода та контакти" icon="🌤" />
                {openSections.has('weather') && (
                  <div style={{ padding: '16px 0' }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Широта (lat)</label>
                        <input className="form-input" type="number" step="0.0001" value={pWeatherLat} placeholder="50.2311" onChange={e => setPWeatherLat(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Довгота (lon)</label>
                        <input className="form-input" type="number" step="0.0001" value={pWeatherLon} placeholder="12.8730" onChange={e => setPWeatherLon(e.target.value)} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Телефон підтримки / екстренний</label>
                      <input className="form-input" value={pEmergency} placeholder="+420 773 708 849" onChange={e => setPEmergency(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Відео-гайд (URL)</label>
                      <input className="form-input" type="url" value={pVideoGuide} placeholder="https://youtube.com/..." onChange={e => setPVideoGuide(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* ═══ UNIT TYPES TAB ═════════════════════════ */}
            {/* ═══════════════════════════════════════════ */}
            {activeTab === 'unit-types' && (
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
                {/* Left — Unit type selector */}
                <div className="card" style={{ padding: 0, position: 'sticky', top: 80 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Тип проживання
                  </div>
                  {configs.map(cfg => {
                    const active = cfg.unit_type_id === selected;
                    const catColor = catColors[cfg.category_type] || '#6c7086';
                    return (
                      <div key={cfg.unit_type_id} onClick={() => handleSelectUnitType(cfg.unit_type_id)} style={{
                        padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: '1px solid var(--border-primary)',
                        background: active ? 'rgba(79,110,247,0.08)' : 'transparent',
                        borderLeft: active ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        transition: 'all 0.15s ease',
                      }}>
                        <span style={{ fontSize: 16 }}>{cfg.category_icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.unit_type_name}</div>
                          <div style={{ fontSize: 11, color: catColor, fontWeight: 600 }}>{cfg.category_name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right — Editor */}
                <div className="card" style={{ padding: 20 }}>
                  {selectedConfig && (
                    <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 24 }}>{selectedConfig.category_icon}</span>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedConfig.unit_type_name}</div>
                        <div style={{ fontSize: 12, color: catColors[selectedConfig.category_type], fontWeight: 600 }}>{selectedConfig.category_name}</div>
                      </div>
                    </div>
                  )}

                  <div style={{ padding: '8px 12px', marginBottom: 16, background: 'rgba(79,110,247,0.06)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-tertiary)', border: '1px solid rgba(79,110,247,0.12)' }}>
                    💡 Wi-Fi, ресторан, правила, FAQ та Explore редагуються на вкладці <strong>&quot;Property&quot;</strong> (спільні для всіх)
                  </div>

                  {/* Amenities */}
                  <SH id="amenities" title="Зручності" icon="✨" />
                  {openSections.has('amenities') && (
                    <div style={{ padding: '16px 0' }}>
                      {amenities.map((a, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                          <input className="form-input" style={{ width: 50, textAlign: 'center', fontSize: 18, padding: '6px 4px' }}
                            value={a.icon} onChange={e => setAmenities(prev => prev.map((p, idx) => idx === i ? { ...p, icon: e.target.value } : p))} />
                          <input className="form-input" style={{ flex: 1 }} value={a.name} placeholder="Назва"
                            onChange={e => setAmenities(prev => prev.map((p, idx) => idx === i ? { ...p, name: e.target.value } : p))} />
                          <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                            onClick={() => setAmenities(prev => prev.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <button className="btn btn-sm btn-ghost" onClick={() => setAmenities(prev => [...prev, { icon: '✅', name: '' }])}>
                        <Plus size={14} /> Додати зручність
                      </button>
                    </div>
                  )}

                  {/* Check-in Instructions */}
                  <SH id="instructions" title="Інструкція по заїзду" icon="🚪" />
                  {openSections.has('instructions') && (
                    <div style={{ padding: '16px 0' }}>
                      <textarea className="form-input" rows={4} value={instructions} placeholder="Інструкція для гостя при заїзді..."
                        onChange={e => setInstructions(e.target.value)} style={{ resize: 'vertical' }} />
                    </div>
                  )}

                  {/* Lock code */}
                  <SH id="lock" title="Код замка" icon="🔑" />
                  {openSections.has('lock') && (
                    <div style={{ padding: '16px 0' }}>
                      <div className="form-group">
                        <label className="form-label">Код замка / лок-бокса</label>
                        <input className="form-input" value={lockCode} placeholder="4971#" onChange={e => setLockCode(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {/* Pets & Entry Photo (override) */}
                  <SH id="pets-override" title="Тварини та фото входу" icon="🐕" />
                  {openSections.has('pets-override') && (
                    <div style={{ padding: '16px 0' }}>
                      <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(79,110,247,0.06)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                        Якщо залишити порожнім — буде використано значення з Property
                      </div>
                      <div className="form-group">
                        <label className="form-label">Політика щодо тварин (override)</label>
                        <select className="form-input" value={petsPolicy} onChange={e => setPetsPolicy(e.target.value)}>
                          <option value="">— Використати з Property —</option>
                          <option value="welcome">🐕 Можна з тваринами</option>
                          <option value="with_fee">💰 З доплатою</option>
                          <option value="not_allowed">🚫 Не допускаються</option>
                        </select>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <ImageUploadField
                          label="Фото входу / лок-бокса будиночка"
                          value={entryPhotoUrl}
                          onChange={setEntryPhotoUrl}
                          folder="entry-photos"
                        />
                      </div>
                      <div className="form-group" style={{ marginTop: 16 }}>
                        <label className="form-label">Код калітки (override)</label>
                        <input className="form-input" value={gateCode} placeholder="4545 (за замовчуванням)" onChange={e => setGateCode(e.target.value)} />
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <ImageUploadField
                          label="Фото калітки та ворот (override)"
                          value={gatePhotoUrl}
                          onChange={setGatePhotoUrl}
                          folder="gate-photos"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
