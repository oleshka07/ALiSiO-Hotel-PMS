'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Building2, Edit3, Trash2, Plus, Save, X, Check, Search,
  ChevronRight, ChevronDown, Tent, TreePine, BedDouble,
  Home, Loader2, RefreshCw, Copy, MapPin, Clock, Phone, Mail,
} from 'lucide-react';

/* ================================================================
   Types
   ================================================================ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

interface PropertyRow extends AnyRow {
  id: string; name: string; slug: string; address?: string; city?: string;
  country?: string; phone?: string; email?: string;
  check_in_time: string; check_out_time: string; is_active: number;
  category_count: number; building_count: number; unit_count: number; unit_type_count: number;
}

interface CategoryRow extends AnyRow {
  id: string; property_id: string; name: string; type: string;
  description?: string; sort_order: number; icon?: string; color?: string;
  unit_count: number;
}

interface BuildingRow extends AnyRow {
  id: string; category_id: string; property_id: string; name: string; code: string;
  description?: string; sort_order: number; unit_count: number;
}

interface UnitTypeRow extends AnyRow {
  id: string; property_id: string; category_id: string; building_id?: string;
  name: string; code: string; max_adults: number; base_occupancy: number;
  beds_single: number; beds_double: number; sort_order: number; unit_count: number;
}

interface UnitRow extends AnyRow {
  id: string; unit_type_id: string; property_id: string; category_id: string;
  building_id?: string; name: string; code: string; beds: number;
  zone?: string; room_status: string; cleaning_status: string; is_active: number;
  sort_order: number; unit_type_name?: string; category_name?: string;
  category_type?: string; building_name?: string;
}

type ModalType = 'none' | 'property' | 'category' | 'building' | 'unitType' | 'unit' | 'bulkUnit' | 'delete';

/* ================================================================
   Constants
   ================================================================ */
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  glamping: <Tent size={16} />,
  resort: <Building2 size={16} />,
  camping: <TreePine size={16} />,
  facility: <Building2 size={16} />,
  area: <MapPin size={16} />,
  zone: <MapPin size={16} />,
};

const CATEGORY_EMOJI: Record<string, string> = {
  glamping: '🏕️', resort: '🏨', camping: '⛺',
  facility: '🏭', area: '🌳', zone: '📍',
};

const CATEGORY_COLORS: Record<string, string> = {
  glamping: '#a78bfa', resort: '#60a5fa', camping: '#34d399',
  facility: '#f59e0b', area: '#22c55e', zone: '#6c7086',
};

const VISIBILITY_FLAGS = [
  { key: 'show_in_tasks', label: 'Задачі', color: '#3b82f6' },
  { key: 'show_in_finance', label: 'Фінанси', color: '#22c55e' },
  { key: 'show_in_booking', label: 'Бронювання', color: '#f59e0b' },
  { key: 'show_in_investor', label: 'Інвестори', color: '#a855f7' },
];

const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  available: { label: 'Вільний', color: '#22c55e' },
  occupied: { label: 'Зайнятий', color: '#ef4444' },
  maintenance: { label: 'Обслуговування', color: '#f59e0b' },
  blocked: { label: 'Заблокований', color: '#6b7280' },
};

/* ================================================================
   Modal
   ================================================================ */
function Modal({ open, onClose, title, children, footer, size }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'lg';
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
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

/* ================================================================
   Main Component
   ================================================================ */
export default function SettingsPropertiesPage() {
  // ── Data ──
  const onMenuClick = useMobileMenu();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitTypeRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI State ──
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  // ── Modal State ──
  const [modal, setModal] = useState<ModalType>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Forms ──
  const [propForm, setPropForm] = useState({ name: '', slug: '', address: '', city: '', country: 'CZ', phone: '', email: '', check_in_time: '15:00', check_out_time: '10:00' });
  const [catForm, setCatForm] = useState({ name: '', type: 'glamping', description: '', icon: '🏕️', color: '#a78bfa', sort_order: 0, show_in_tasks: 1, show_in_finance: 0, show_in_booking: 1, show_in_investor: 0 });
  const [bldForm, setBldForm] = useState({ category_id: '', name: '', code: '', description: '', sort_order: 0 });
  const [utForm, setUtForm] = useState({ category_id: '', building_id: '', name: '', code: '', max_adults: 2, max_children: 2, max_occupancy: 4, base_occupancy: 2, beds_single: 0, beds_double: 1, beds_sofa: 0, extra_bed_available: 0, sort_order: 0 });
  const [unitForm, setUnitForm] = useState({ unit_type_id: '', category_id: '', building_id: '', name: '', code: '', beds: 2, floor: '', zone: '', notes: '', sort_order: 0 });
  const [bulkForm, setBulkForm] = useState({ unit_type_id: '', category_id: '', building_id: '', prefix: '', from: 1, to: 10, beds: 0, zone: '' });
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);

  // ── Fetch Properties List ──
  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch('/api/properties');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProperties(data);
        if (data.length > 0 && !selectedProperty) {
          setSelectedProperty(data[0].id);
        }
      }
    } catch (e) { console.error('Fetch properties error:', e); }
  }, [selectedProperty]);

  // ── Fetch Property Details ──
  const fetchDetails = useCallback(async () => {
    if (!selectedProperty) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/properties/${selectedProperty}`);
      const data = await res.json();
      setCategories(data.categories || []);
      setBuildings(data.buildings || []);
      setUnitTypes(data.unitTypes || []);
      setUnits(data.units || []);
    } catch (e) { console.error('Fetch details error:', e); }
    setLoading(false);
  }, [selectedProperty]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  // ── Helpers ──
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  const toggle = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  const currentProperty = properties.find(p => p.id === selectedProperty);

  // ── Filtered Units (search) ──
  const filteredUnits = useMemo(() => {
    if (!search) return units;
    const q = search.toLowerCase();
    return units.filter(u =>
      u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q) ||
      u.unit_type_name?.toLowerCase().includes(q) || u.category_name?.toLowerCase().includes(q) ||
      u.building_name?.toLowerCase().includes(q)
    );
  }, [units, search]);

  // ── Tree structure ──
  const tree = useMemo(() => {
    return categories.map(cat => {
      const catBuildings = buildings.filter(b => b.category_id === cat.id);
      const catUnitTypes = unitTypes.filter(ut => ut.category_id === cat.id);
      const catUnits = filteredUnits.filter(u => u.category_id === cat.id);
      return { category: cat, buildings: catBuildings, unitTypes: catUnitTypes, units: catUnits };
    });
  }, [categories, buildings, unitTypes, filteredUnits]);

  /* ════════════════════════════════════════════════════════════
     CRUD Operations
     ════════════════════════════════════════════════════════════ */

  // ── Property CRUD ──
  const openPropertyModal = (p?: PropertyRow) => {
    if (p) {
      setEditId(p.id);
      setPropForm({
        name: p.name, slug: p.slug, address: p.address || '', city: p.city || '',
        country: p.country || 'CZ', phone: p.phone || '', email: p.email || '',
        check_in_time: p.check_in_time, check_out_time: p.check_out_time,
      });
    } else {
      setEditId(null);
      setPropForm({ name: '', slug: '', address: '', city: '', country: 'CZ', phone: '', email: '', check_in_time: '15:00', check_out_time: '10:00' });
    }
    setModal('property');
  };

  const saveProperty = async () => {
    if (!propForm.name) { alert("Назва обов'язкова"); return; }
    setSaving(true);
    try {
      const slug = propForm.slug || propForm.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (editId) {
        await fetch(`/api/properties/${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...propForm, slug }),
        });
        showToast('Об\'єкт оновлено!');
      } else {
        const res = await fetch('/api/properties', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...propForm, slug }),
        });
        const data = await res.json();
        if (res.ok) {
          setSelectedProperty(data.id);
          showToast('Об\'єкт створено!');
        } else {
          alert(data.error || 'Помилка створення');
          setSaving(false);
          return;
        }
      }
      setModal('none');
      fetchProperties();
      fetchDetails();
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ── Category CRUD ──
  const openCategoryModal = (cat?: CategoryRow) => {
    if (cat) {
      setEditId(cat.id);
      setCatForm({ name: cat.name, type: cat.type, description: cat.description || '', icon: cat.icon || '🏕️', color: cat.color || '#a78bfa', sort_order: cat.sort_order, show_in_tasks: (cat as any).show_in_tasks ?? 1, show_in_finance: (cat as any).show_in_finance ?? 0, show_in_booking: (cat as any).show_in_booking ?? 1, show_in_investor: (cat as any).show_in_investor ?? 0 });
    } else {
      setEditId(null);
      setCatForm({ name: '', type: 'glamping', description: '', icon: '🏕️', color: '#a78bfa', sort_order: categories.length, show_in_tasks: 1, show_in_finance: 0, show_in_booking: 1, show_in_investor: 0 });
    }
    setModal('category');
  };

  const saveCategory = async () => {
    if (!catForm.name) { alert("Назва обов'язкова"); return; }
    setSaving(true);
    try {
      if (editId) {
        await fetch(`/api/categories/${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(catForm),
        });
        showToast('Категорію оновлено!');
      } else {
        const res = await fetch('/api/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...catForm, property_id: selectedProperty }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error); setSaving(false); return; }
        showToast('Категорію створено!');
      }
      setModal('none');
      fetchDetails();
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ── Building CRUD ──
  const openBuildingModal = (catId: string, bld?: BuildingRow) => {
    if (bld) {
      setEditId(bld.id);
      setBldForm({ category_id: bld.category_id, name: bld.name, code: bld.code, description: bld.description || '', sort_order: bld.sort_order });
    } else {
      setEditId(null);
      setBldForm({ category_id: catId, name: '', code: '', description: '', sort_order: 0 });
    }
    setModal('building');
  };

  const saveBuilding = async () => {
    if (!bldForm.name || !bldForm.code) { alert("Назва і код обов'язкові"); return; }
    setSaving(true);
    try {
      if (editId) {
        await fetch(`/api/buildings/${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bldForm),
        });
        showToast('Корпус оновлено!');
      } else {
        const res = await fetch('/api/buildings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bldForm, property_id: selectedProperty }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error); setSaving(false); return; }
        showToast('Корпус створено!');
      }
      setModal('none');
      fetchDetails();
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ── Unit Type CRUD ──
  const openUnitTypeModal = (catId: string, bldId?: string, ut?: UnitTypeRow) => {
    if (ut) {
      setEditId(ut.id);
      setUtForm({
        category_id: ut.category_id, building_id: ut.building_id || '',
        name: ut.name, code: ut.code,
        max_adults: ut.max_adults, max_children: 2, max_occupancy: 4, base_occupancy: ut.base_occupancy,
        beds_single: ut.beds_single, beds_double: ut.beds_double, beds_sofa: 0,
        extra_bed_available: 0, sort_order: ut.sort_order,
      });
    } else {
      setEditId(null);
      setUtForm({
        category_id: catId, building_id: bldId || '',
        name: '', code: '', max_adults: 2, max_children: 2, max_occupancy: 4, base_occupancy: 2,
        beds_single: 0, beds_double: 1, beds_sofa: 0, extra_bed_available: 0, sort_order: 0,
      });
    }
    setModal('unitType');
  };

  const saveUnitType = async () => {
    if (!utForm.name || !utForm.code) { alert("Назва і код обов'язкові"); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/unit-types/${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(utForm),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || 'Помилка оновлення'); setSaving(false); return; }
        showToast('Тип юніта оновлено!');
      } else {
        const res = await fetch('/api/unit-types', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...utForm, property_id: selectedProperty }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error); setSaving(false); return; }
        showToast('Тип юніта створено!');
      }
      setModal('none');
      fetchDetails();
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ── Unit CRUD ──
  const openUnitModal = (catId: string, utId: string, bldId?: string, u?: UnitRow) => {
    if (u) {
      setEditId(u.id);
      setUnitForm({
        unit_type_id: u.unit_type_id, category_id: u.category_id, building_id: u.building_id || '',
        name: u.name, code: u.code, beds: u.beds, floor: '', zone: u.zone || '',
        notes: '', sort_order: u.sort_order,
      });
    } else {
      setEditId(null);
      setUnitForm({
        unit_type_id: utId, category_id: catId, building_id: bldId || '',
        name: '', code: '', beds: 2, floor: '', zone: '', notes: '', sort_order: 0,
      });
    }
    setModal('unit');
  };

  const saveUnit = async () => {
    if (!unitForm.name || !unitForm.code) { alert("Назва і код обов'язкові"); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/units/${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(unitForm),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || 'Помилка оновлення'); setSaving(false); return; }
        showToast('Юніт оновлено!');
      } else {
        const res = await fetch('/api/units', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...unitForm, property_id: selectedProperty }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error); setSaving(false); return; }
        showToast('Юніт створено!');
      }
      setModal('none');
      fetchDetails();
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ── Bulk Unit Creation ──
  const openBulkModal = (catId: string, utId: string, bldId?: string) => {
    setBulkForm({ unit_type_id: utId, category_id: catId, building_id: bldId || '', prefix: '', from: 1, to: 10, beds: 0, zone: '' });
    setModal('bulkUnit');
  };

  const saveBulk = async () => {
    if (!bulkForm.prefix) { alert("Префікс обов'язковий"); return; }
    if (bulkForm.from > bulkForm.to) { alert('Від має бути менше За'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/units', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bulkForm, property_id: selectedProperty, bulk: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Створено ${data.created} юнітів!`);
        setModal('none');
        fetchDetails();
      } else {
        alert(data.error || 'Помилка');
      }
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  // ── Delete ──
  const openDelete = (type: string, id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    setModal('delete');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const urlMap: Record<string, string> = {
      property: `/api/properties/${deleteTarget.id}`,
      category: `/api/categories/${deleteTarget.id}`,
      building: `/api/buildings/${deleteTarget.id}`,
      unitType: `/api/unit-types/${deleteTarget.id}`,
      unit: `/api/units/${deleteTarget.id}`,
    };
    try {
      const res = await fetch(urlMap[deleteTarget.type], { method: 'DELETE' });
      if (res.ok) {
        showToast(`${deleteTarget.name} видалено!`);
        setModal('none');
        if (deleteTarget.type === 'property') {
          setSelectedProperty('');
          fetchProperties();
        } else {
          fetchDetails();
        }
      } else {
        const d = await res.json();
        alert(d.error || 'Помилка видалення');
      }
    } catch { alert('Помилка мережі'); }
    setSaving(false);
  };

  /* ════════════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════════════ */
  return (
    <>
      <Header title="Об'єкти" onMenuClick={onMenuClick} />
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

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h2 className="page-title">Об&apos;єкти розміщення</h2>
            <div className="page-subtitle">
              {properties.length} об&apos;єктів · Керування структурою
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => { fetchProperties(); fetchDetails(); }} title="Оновити">
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-primary" onClick={() => openPropertyModal()}>
              <Plus size={16} /> Додати об&apos;єкт
            </button>
          </div>
        </div>

        {/* Property Selector (if multiple) */}
        {properties.length > 1 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="flex gap-3 items-center">
              <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Об&apos;єкт:</label>
              <select className="form-select" style={{ width: 300 }} value={selectedProperty} onChange={(e) => setSelectedProperty(e.target.value)}>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Property Card */}
        {currentProperty && (
          <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, var(--accent-primary), #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, flexShrink: 0,
            }}>
              🏨
            </div>
            <div style={{ flex: 1 }}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{currentProperty.name}</h3>
                  <div className="flex gap-3" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {(currentProperty.city || currentProperty.country) && (
                      <span className="flex items-center gap-2"><MapPin size={12} /> {currentProperty.city}{currentProperty.city && currentProperty.country ? ', ' : ''}{currentProperty.country}</span>
                    )}
                    <span className="flex items-center gap-2"><Clock size={12} /> Check-in {currentProperty.check_in_time} / Check-out {currentProperty.check_out_time}</span>
                    {currentProperty.phone && <span className="flex items-center gap-2"><Phone size={12} /> {currentProperty.phone}</span>}
                    {currentProperty.email && <span className="flex items-center gap-2"><Mail size={12} /> {currentProperty.email}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-secondary btn-sm" onClick={() => openPropertyModal(currentProperty)}>
                    <Edit3 size={14} /> Редагувати
                  </button>
                  {properties.length > 1 && (
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--accent-danger)' }}
                      onClick={() => openDelete('property', currentProperty.id, currentProperty.name)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {categories.map(cat => (
                  <div key={cat.id} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div className="flex items-center gap-2" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      <span>{CATEGORY_EMOJI[cat.type] || '📊'}</span> {cat.name}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{cat.unit_count}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>юнітів</div>
                  </div>
                ))}
                <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div className="flex items-center gap-2" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    <span>📊</span> Всього
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{units.length}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>юнітів</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search + Add Category */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
            <div className="search-box" style={{ minWidth: 250 }}>
              <Search size={14} className="search-icon" />
              <input className="form-input" placeholder="Пошук юнітів..." style={{ paddingLeft: 34 }}
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => openCategoryModal()}>
              <Plus size={14} /> Категорія
            </button>
            {search && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                <X size={14} /> Скинути
              </button>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {search ? `${filteredUnits.length} з ${units.length} юнітів` : `${units.length} юнітів`}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
            <Loader2 size={20} className="animate-pulse" /> <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>Завантаження...</span>
          </div>
        )}

        {/* Tree View */}
        {!loading && (
          <div className="settings-tree">
            {tree.map(({ category: cat, buildings: catBlds, unitTypes: catUTs, units: catUnits }) => (
              <div className="settings-tree-group" key={cat.id}>
                {/* Category Header */}
                <div className="settings-tree-header" onClick={() => toggle(`cat-${cat.id}`)}>
                  <div className="settings-tree-header-left">
                    <span className={`settings-tree-chevron ${!collapsed[`cat-${cat.id}`] ? 'open' : ''}`}>
                      <ChevronRight size={16} />
                    </span>
                    {CATEGORY_ICONS[cat.type] || <Building2 size={16} />}
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{cat.name}</span>
                    <span className="badge" style={{
                      background: `${CATEGORY_COLORS[cat.type] || '#888'}22`,
                      color: CATEGORY_COLORS[cat.type] || '#888',
                    }}>
                      {catUnits.length}
                    </span>
                    {VISIBILITY_FLAGS.map(flag => {
                      const val = (cat as any)[flag.key];
                      return val ? (
                        <span key={flag.key} style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 3,
                          background: `${flag.color}18`, color: flag.color,
                          fontWeight: 600, letterSpacing: '0.3px',
                        }}>
                          {flag.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" title="Додати корпус" onClick={() => openBuildingModal(cat.id)}>
                      <Home size={14} />
                    </button>
                    <button className="btn btn-sm btn-ghost" title="Додати тип юніта" onClick={() => openUnitTypeModal(cat.id)}>
                      <BedDouble size={14} />
                    </button>
                    <button className="btn btn-sm btn-ghost" title="Редагувати" onClick={() => openCategoryModal(cat)}>
                      <Edit3 size={14} />
                    </button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--accent-danger)' }}
                      title="Видалити" onClick={() => openDelete('category', cat.id, cat.name)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {!collapsed[`cat-${cat.id}`] && (
                  <div className="settings-tree-children">
                    {/* Buildings in this category */}
                    {catBlds.map(bld => {
                      const bldUTs = catUTs.filter(ut => ut.building_id === bld.id);
                      const bldUnits = catUnits.filter(u => u.building_id === bld.id);

                      return (
                        <div key={bld.id}>
                          <div className="settings-tree-item" style={{ paddingLeft: 32, background: 'var(--bg-secondary)', cursor: 'pointer' }}
                            onClick={() => toggle(`bld-${bld.id}`)}>
                            <div className="settings-tree-item-info">
                              <span className={`settings-tree-chevron ${!collapsed[`bld-${bld.id}`] ? 'open' : ''}`}>
                                <ChevronRight size={14} />
                              </span>
                              <Home size={14} style={{ color: 'var(--text-tertiary)' }} />
                              <span style={{ fontWeight: 500, fontSize: 13 }}>{bld.name}</span>
                              <span className="badge badge-primary" style={{ fontSize: 10 }}>{bldUnits.length}</span>
                            </div>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <button className="btn btn-sm btn-ghost" title="Додати тип юніта"
                                onClick={() => openUnitTypeModal(cat.id, bld.id)}>
                                <Plus size={14} />
                              </button>
                              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openBuildingModal(cat.id, bld)}>
                                <Edit3 size={14} />
                              </button>
                              <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                                onClick={() => openDelete('building', bld.id, bld.name)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Unit types in building */}
                          {!collapsed[`bld-${bld.id}`] && bldUTs.map(ut => {
                            const utUnits = bldUnits.filter(u => u.unit_type_id === ut.id);
                            return renderUnitType(ut, utUnits, cat.id, bld.id, 56);
                          })}
                        </div>
                      );
                    })}

                    {/* Unit Types without building */}
                    {catUTs.filter(ut => !ut.building_id).map(ut => {
                      const utUnits = catUnits.filter(u => u.unit_type_id === ut.id && !u.building_id);
                      return renderUnitType(ut, utUnits, cat.id, undefined, 32);
                    })}
                  </div>
                )}
              </div>
            ))}

            {tree.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
                Немає категорій. Натисніть &quot;+ Категорія&quot; щоб почати.
              </div>
            )}
          </div>
        )}

        {/* ═══════════ MODALS ═══════════ */}

        {/* Property Modal */}
        <Modal open={modal === 'property'} onClose={() => setModal('none')}
          title={editId ? 'Редагувати об\'єкт' : 'Новий об\'єкт'}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setModal('none')}>Скасувати</button>
            <button className="btn btn-primary" onClick={saveProperty} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />}
              {editId ? ' Зберегти' : ' Створити'}
            </button>
          </>}>
          <div className="form-group">
            <label className="form-label">Назва *</label>
            <input className="form-input" value={propForm.name} onChange={e => setPropForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Назва об'єкта" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Адреса</label>
              <input className="form-input" value={propForm.address} onChange={e => setPropForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Місто</label>
              <input className="form-input" value={propForm.city} onChange={e => setPropForm(p => ({ ...p, city: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Країна</label>
              <input className="form-input" value={propForm.country} onChange={e => setPropForm(p => ({ ...p, country: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Телефон</label>
              <input className="form-input" value={propForm.phone} onChange={e => setPropForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={propForm.email} onChange={e => setPropForm(p => ({ ...p, email: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Check-in</label>
              <input className="form-input" type="time" value={propForm.check_in_time} onChange={e => setPropForm(p => ({ ...p, check_in_time: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Check-out</label>
              <input className="form-input" type="time" value={propForm.check_out_time} onChange={e => setPropForm(p => ({ ...p, check_out_time: e.target.value }))} />
            </div>
          </div>
        </Modal>

        {/* Category Modal */}
        <Modal open={modal === 'category'} onClose={() => setModal('none')}
          title={editId ? 'Редагувати категорію' : 'Нова категорія'}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setModal('none')}>Скасувати</button>
            <button className="btn btn-primary" onClick={saveCategory} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />}
              {editId ? ' Зберегти' : ' Створити'}
            </button>
          </>}>
          <div className="form-group">
            <label className="form-label">Назва *</label>
            <input className="form-input" value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Назва категорії" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Тип *</label>
              <select className="form-select" value={catForm.type} onChange={e => {
                const t = e.target.value;
                setCatForm(p => ({ ...p, type: t, icon: CATEGORY_EMOJI[t] || '🏕️', color: CATEGORY_COLORS[t] || '#a78bfa' }));
              }}>
                <option value="glamping">Glamping</option>
                <option value="resort">Resort</option>
                <option value="camping">Camping</option>
                <option value="facility">Об&apos;єкт інфраструктури</option>
                <option value="area">Зона / Територія</option>
                <option value="zone">Ділянка</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Іконка</label>
              <input className="form-input" value={catForm.icon} onChange={e => setCatForm(p => ({ ...p, icon: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Колір</label>
              <input className="form-input" type="color" value={catForm.color} onChange={e => setCatForm(p => ({ ...p, color: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Порядок</label>
              <input className="form-input" type="number" value={catForm.sort_order} onChange={e => setCatForm(p => ({ ...p, sort_order: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Опис</label>
            <input className="form-input" value={catForm.description} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Відображати в модулях</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              {VISIBILITY_FLAGS.map(flag => (
                <label key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!(catForm as any)[flag.key]}
                    onChange={e => setCatForm(f => ({ ...f, [flag.key]: e.target.checked ? 1 : 0 }))}
                  />
                  <span style={{ color: flag.color }}>{flag.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Modal>

        {/* Building Modal */}
        <Modal open={modal === 'building'} onClose={() => setModal('none')}
          title={editId ? 'Редагувати корпус' : 'Новий корпус'}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setModal('none')}>Скасувати</button>
            <button className="btn btn-primary" onClick={saveBuilding} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />}
              {editId ? ' Зберегти' : ' Створити'}
            </button>
          </>}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Назва *</label>
              <input className="form-input" value={bldForm.name} onChange={e => setBldForm(p => ({ ...p, name: e.target.value }))} placeholder="Будова F (Standart)" />
            </div>
            <div className="form-group">
              <label className="form-label">Код *</label>
              <input className="form-input" value={bldForm.code} onChange={e => setBldForm(p => ({ ...p, code: e.target.value }))} placeholder="F" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Категорія</label>
            <select className="form-select" value={bldForm.category_id} onChange={e => setBldForm(p => ({ ...p, category_id: e.target.value }))}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Опис</label>
            <input className="form-input" value={bldForm.description} onChange={e => setBldForm(p => ({ ...p, description: e.target.value }))} />
          </div>
        </Modal>

        {/* Unit Type Modal */}
        <Modal open={modal === 'unitType'} onClose={() => setModal('none')}
          title={editId ? 'Редагувати тип юніта' : 'Новий тип юніта'}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setModal('none')}>Скасувати</button>
            <button className="btn btn-primary" onClick={saveUnitType} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />}
              {editId ? ' Зберегти' : ' Створити'}
            </button>
          </>}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Назва *</label>
              <input className="form-input" value={utForm.name} onChange={e => setUtForm(p => ({ ...p, name: e.target.value }))} placeholder="F — 3-місний" />
            </div>
            <div className="form-group">
              <label className="form-label">Код *</label>
              <input className="form-input" value={utForm.code} onChange={e => setUtForm(p => ({ ...p, code: e.target.value }))} placeholder="F-3BED" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Категорія</label>
              <select className="form-select" value={utForm.category_id} onChange={e => setUtForm(p => ({ ...p, category_id: e.target.value }))}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Корпус</label>
              <select className="form-select" value={utForm.building_id} onChange={e => setUtForm(p => ({ ...p, building_id: e.target.value }))}>
                <option value="">— Без корпуса —</option>
                {buildings.filter(b => b.category_id === utForm.category_id).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Макс. дорослих</label>
              <input className="form-input" type="number" value={utForm.max_adults} min={1} onChange={e => setUtForm(p => ({ ...p, max_adults: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Базова місткість</label>
              <input className="form-input" type="number" value={utForm.base_occupancy} min={1} onChange={e => setUtForm(p => ({ ...p, base_occupancy: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ліжка single</label>
              <input className="form-input" type="number" value={utForm.beds_single} min={0} onChange={e => setUtForm(p => ({ ...p, beds_single: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Ліжка double</label>
              <input className="form-input" type="number" value={utForm.beds_double} min={0} onChange={e => setUtForm(p => ({ ...p, beds_double: Number(e.target.value) }))} />
            </div>
          </div>
        </Modal>

        {/* Unit Modal */}
        <Modal open={modal === 'unit'} onClose={() => setModal('none')}
          title={editId ? 'Редагувати юніт' : 'Новий юніт'}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setModal('none')}>Скасувати</button>
            <button className="btn btn-primary" onClick={saveUnit} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Save size={14} />}
              {editId ? ' Зберегти' : ' Створити'}
            </button>
          </>}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Назва *</label>
              <input className="form-input" value={unitForm.name} onChange={e => setUnitForm(p => ({ ...p, name: e.target.value }))} placeholder="F12" />
            </div>
            <div className="form-group">
              <label className="form-label">Код *</label>
              <input className="form-input" value={unitForm.code} onChange={e => setUnitForm(p => ({ ...p, code: e.target.value }))} placeholder="F12" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ліжок</label>
              <input className="form-input" type="number" value={unitForm.beds} min={0} onChange={e => setUnitForm(p => ({ ...p, beds: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Зона</label>
              <input className="form-input" value={unitForm.zone} onChange={e => setUnitForm(p => ({ ...p, zone: e.target.value }))} placeholder="FB" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Тип юніта</label>
            <select className="form-select" value={unitForm.unit_type_id} onChange={e => setUnitForm(p => ({ ...p, unit_type_id: e.target.value }))}>
              {unitTypes.filter(ut => ut.category_id === unitForm.category_id).map(ut => (
                <option key={ut.id} value={ut.id}>{ut.name} ({ut.code})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Нотатки</label>
            <input className="form-input" value={unitForm.notes} onChange={e => setUnitForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </Modal>

        {/* Bulk Unit Modal */}
        <Modal open={modal === 'bulkUnit'} onClose={() => setModal('none')}
          title="Масове створення юнітів" size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setModal('none')}>Скасувати</button>
            <button className="btn btn-primary" onClick={saveBulk} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Copy size={14} />}
              Створити {bulkForm.to - bulkForm.from + 1} юнітів
            </button>
          </>}>
          <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            💡 Юніти будуть створені з іменами: <strong>{bulkForm.prefix || '...'}{bulkForm.from}</strong> → <strong>{bulkForm.prefix || '...'}{bulkForm.to}</strong>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Префікс *</label>
              <input className="form-input" value={bulkForm.prefix} onChange={e => setBulkForm(p => ({ ...p, prefix: e.target.value }))} placeholder="FB" />
            </div>
            <div className="form-group">
              <label className="form-label">Від *</label>
              <input className="form-input" type="number" value={bulkForm.from} min={0} onChange={e => setBulkForm(p => ({ ...p, from: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">До *</label>
              <input className="form-input" type="number" value={bulkForm.to} min={0} onChange={e => setBulkForm(p => ({ ...p, to: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ліжок на юніт</label>
              <input className="form-input" type="number" value={bulkForm.beds} min={0} onChange={e => setBulkForm(p => ({ ...p, beds: Number(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Зона</label>
              <input className="form-input" value={bulkForm.zone} onChange={e => setBulkForm(p => ({ ...p, zone: e.target.value }))} placeholder="Зона (опціонально)" />
            </div>
          </div>
        </Modal>

        {/* Delete Confirmation */}
        <Modal open={modal === 'delete'} onClose={() => setModal('none')}
          title="Підтвердження видалення"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setModal('none')}>Скасувати</button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-pulse" /> : <Trash2 size={14} />}
              Видалити
            </button>
          </>}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Ви впевнені, що хочете видалити <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget?.name}</strong>?
          </p>
          <p style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: 8 }}>
            ⚠️ Ця дія може бути незворотною. Всі пов&apos;язані дані можуть бути видалені.
          </p>
        </Modal>
      </div>
    </>
  );

  /* ════════════════════════════════════════════════════════════
     Render Unit Type (reused in tree)
     ════════════════════════════════════════════════════════════ */
  function renderUnitType(ut: UnitTypeRow, utUnits: UnitRow[], catId: string, bldId?: string, paddingLeft = 32) {
    return (
      <div key={ut.id}>
        {/* Unit Type Header */}
        <div className="settings-tree-item" style={{ paddingLeft, background: 'var(--bg-secondary)', cursor: 'pointer' }}
          onClick={() => toggle(`ut-${ut.id}`)}>
          <div className="settings-tree-item-info">
            <span className={`settings-tree-chevron ${!collapsed[`ut-${ut.id}`] ? 'open' : ''}`}>
              <ChevronRight size={14} />
            </span>
            <BedDouble size={14} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              {ut.name}
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                [{ut.code}] · {ut.max_adults} місць
              </span>
            </span>
            <span className="badge badge-primary" style={{ fontSize: 10 }}>{utUnits.length}</span>
          </div>
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-sm btn-ghost" title="Додати юніт" onClick={() => openUnitModal(catId, ut.id, bldId)}>
              <Plus size={14} />
            </button>
            <button className="btn btn-sm btn-ghost" title="Масове створення" onClick={() => openBulkModal(catId, ut.id, bldId)}>
              <Copy size={14} />
            </button>
            <button className="btn btn-sm btn-ghost btn-icon" title="Редагувати" onClick={() => openUnitTypeModal(catId, bldId, ut)}>
              <Edit3 size={14} />
            </button>
            <button className="btn btn-sm btn-ghost btn-icon" title="Видалити" style={{ color: 'var(--accent-danger)' }}
              onClick={() => openDelete('unitType', ut.id, ut.name)}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Units */}
        {!collapsed[`ut-${ut.id}`] && utUnits.map(unit => (
          <div className="settings-tree-item" key={unit.id} style={{ paddingLeft: paddingLeft + 24 }}>
            <div className="settings-tree-item-info">
              <div style={{
                width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-tertiary)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
              }}>
                {CATEGORY_EMOJI[unit.category_type || ''] || '🏨'}
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{unit.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {unit.code}
                  {unit.beds > 0 && ` · ${unit.beds} місць`}
                  {unit.zone && ` · ${unit.zone}`}
                  {unit.room_status && unit.room_status !== 'available' && (
                    <span style={{ marginLeft: 4, color: STATUS_COLORS[unit.room_status]?.color }}>
                      · {STATUS_COLORS[unit.room_status]?.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="settings-tree-item-actions">
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openUnitModal(catId, ut.id, bldId, unit)}>
                <Edit3 size={14} />
              </button>
              <button className="btn btn-sm btn-ghost btn-icon" style={{ color: 'var(--accent-danger)' }}
                onClick={() => openDelete('unit', unit.id, unit.name)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }
}
