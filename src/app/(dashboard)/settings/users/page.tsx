'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import {
  Plus, Pencil, Trash2, X, Check, Shield, Eye, EyeOff, Search, ChevronDown,
  MessageCircle, Key,
} from 'lucide-react';
import {
  ROLE_LABELS, ROLE_COLORS, PERMISSION_GROUPS, ROLE_DEFAULTS,
  ALL_PERMISSIONS, getUserPermissions,
  type Permission, type PermissionOverride,
} from '@/lib/permissions';
import type { UserRole } from '@/types/database';

interface UserData {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  telegram_chat_id: string | null;
  role: UserRole;
  is_active: number;
  last_login: string | null;
  created_at: string;
  permissions: Permission[];
  overrides: PermissionOverride[];
}

interface UserForm {
  full_name: string;
  email: string;
  phone: string;
  telegram_chat_id: string;
  role: UserRole;
  password: string;
  is_active: boolean;
  overrides: PermissionOverride[];
}

const emptyForm: UserForm = {
  full_name: '', email: '', phone: '', telegram_chat_id: '', role: 'receptionist',
  password: '', is_active: true, overrides: [],
};

const ALL_ROLES: UserRole[] = ['owner', 'director', 'manager', 'receptionist', 'housekeeper', 'maintenance', 'accountant'];

export default function UsersPage() {
  const onMenuClick = useMobileMenu();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  // Modal
  const [modal, setModal] = useState<'create' | 'edit' | 'permissions' | null>(null);
  const [form, setForm] = useState<UserForm>({ ...emptyForm });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Filtered users
  const filtered = users.filter(u => {
    const matchSearch = u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // Open create modal
  function openCreate() {
    setForm({ ...emptyForm });
    setEditId(null);
    setError('');
    setShowPassword(false);
    setModal('create');
  }

  // Open edit modal
  function openEdit(user: UserData) {
    setForm({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      telegram_chat_id: user.telegram_chat_id || '',
      role: user.role,
      password: '',
      is_active: user.is_active === 1,
      overrides: user.overrides || [],
    });
    setEditId(user.id);
    setError('');
    setShowPassword(false);
    setModal('edit');
  }

  // Open permissions modal
  function openPermissions(user: UserData) {
    setForm({
      ...emptyForm,
      role: user.role,
      overrides: user.overrides || [],
    });
    setEditId(user.id);
    setError('');
    setModal('permissions');
  }

  // Current effective permissions (defaults + overrides preview)
  function getEffectivePermissions(): Permission[] {
    return getUserPermissions(form.role, form.overrides);
  }

  // Toggle a permission override
  function togglePermission(perm: Permission) {
    const defaults = ROLE_DEFAULTS[form.role] || [];
    const isDefault = defaults.includes(perm);
    const existingOverride = form.overrides.find(o => o.permission === perm);

    let newOverrides = form.overrides.filter(o => o.permission !== perm);

    if (existingOverride) {
      // If we had an override, remove it (revert to default)
      // But if removing means the default doesn't match what we want, add opposite
      // Simply removing toggles back to default state
    } else {
      // No override exists — toggle from default
      if (isDefault) {
        // Default is granted, so override to revoke
        newOverrides.push({ permission: perm, granted: false });
      } else {
        // Default is not granted, so override to grant
        newOverrides.push({ permission: perm, granted: true });
      }
    }

    setForm(prev => ({ ...prev, overrides: newOverrides }));
  }

  // Is permission currently active?
  function isPermissionActive(perm: Permission): boolean {
    return getEffectivePermissions().includes(perm);
  }

  // Is permission overridden from default?
  function isOverridden(perm: Permission): boolean {
    return form.overrides.some(o => o.permission === perm);
  }

  // Save user
  async function handleSave() {
    setSaving(true);
    setError('');

    try {
      if (modal === 'create') {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            phone: form.phone || null,
            telegram_chat_id: form.telegram_chat_id || null,
            role: form.role,
            password: form.password,
            permissions_overrides: form.overrides,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Помилка'); return; }
      } else if (modal === 'edit') {
        const payload: Record<string, unknown> = {
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || null,
          telegram_chat_id: form.telegram_chat_id || null,
          role: form.role,
          is_active: form.is_active,
          permissions_overrides: form.overrides,
        };
        if (form.password) payload.password = form.password;

        const res = await fetch(`/api/users/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Помилка'); return; }
      } else if (modal === 'permissions') {
        const res = await fetch(`/api/users/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions_overrides: form.overrides }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Помилка'); return; }
      }

      setModal(null);
      fetchUsers();
    } catch {
      setError('Помилка мережі');
    } finally {
      setSaving(false);
    }
  }

  // Quick reset password — for staff who forget their password
  async function handleResetPassword(user: UserData) {
    const pwd = window.prompt(`Новий пароль для «${user.full_name}» (мінімум 6 символів):`);
    if (pwd === null) return; // cancelled
    if (pwd.length < 6) { alert('Пароль замалий — мінімум 6 символів.'); return; }
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Не вдалося скинути пароль'); return; }
      alert(`✅ Пароль для «${user.full_name}» оновлено.`);
    } catch {
      alert('Помилка мережі');
    }
  }

  // Delete user
  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchUsers();
      }
    } catch {
      // ignore
    }
  }

  // Format date
  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(d: string | null) {
    if (!d) return 'Ніколи';
    return new Date(d).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <>
      <Header title="Користувачі" onMenuClick={onMenuClick} />
      <div className="app-content">
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h2 className="page-title">Користувачі та ролі</h2>
            <div className="page-subtitle">
              Керування доступами та ролями співробітників
            </div>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Додати користувача
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Пошук за ім'ям або email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 36 }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="form-input"
              style={{ paddingRight: 32, minWidth: 180 }}
            >
              <option value="all">Всі ролі</option>
              {ALL_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
          </div>
        </div>

        {/* Users Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Завантаження...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Користувачів не знайдено
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Користувач</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Останній вхід</th>
                  <th>Дозволи</th>
                  <th style={{ width: 120 }}>Дії</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="user-avatar" style={{ background: ROLE_COLORS[user.role], color: '#fff', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                          {user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{user.full_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: ROLE_COLORS[user.role] + '20', color: ROLE_COLORS[user.role], border: `1px solid ${ROLE_COLORS[user.role]}30`, fontWeight: 600 }}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${user.is_active ? 'badge-green' : 'badge-red'}`}>
                        {user.is_active ? 'Активний' : 'Неактивний'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {fmtDateTime(user.last_login)}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openPermissions(user)}
                        title="Налаштувати дозволи"
                      >
                        <Shield size={14} />
                        {user.overrides?.length > 0 && (
                          <span style={{ fontSize: 10, background: 'var(--color-warning)', color: '#000', borderRadius: 8, padding: '1px 5px', marginLeft: 4, fontWeight: 600 }}>
                            {user.overrides.length}
                          </span>
                        )}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(user)} title="Редагувати">
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleResetPassword(user)} title="Скинути пароль">
                          <Key size={14} />
                        </button>
                        {deleteConfirm === user.id ? (
                          <>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(user.id)} title="Підтвердити" style={{ color: 'var(--color-error)' }}>
                              <Check size={14} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteConfirm(null)} title="Скасувати">
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteConfirm(user.id)} title="Видалити" style={{ color: 'var(--color-error)' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Role Legend */}
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Ролі</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ALL_ROLES.map(r => (
              <span key={r} className="badge" style={{ background: ROLE_COLORS[r] + '20', color: ROLE_COLORS[r], border: `1px solid ${ROLE_COLORS[r]}30`, fontWeight: 500 }}>
                {ROLE_LABELS[r]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Create / Edit Modal ──────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>{modal === 'create' ? 'Новий користувач' : 'Редагувати користувача'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
                  {error}
                </div>
              )}
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Повне ім&apos;я *</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Ім'я Прізвище" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Телефон</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="+380..." />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MessageCircle size={14} /> Telegram Chat ID
                  </label>
                  <input className="form-input" value={form.telegram_chat_id} onChange={e => setForm(prev => ({ ...prev, telegram_chat_id: e.target.value }))} placeholder="123456789" />
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Для сповіщень про задачі. Дізнатися: @userinfobot</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Роль *</label>
                  <div style={{ position: 'relative' }}>
                    <select className="form-input" value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value as UserRole, overrides: [] }))}>
                      {ALL_ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tertiary)' }} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{modal === 'create' ? 'Пароль *' : 'Новий пароль'}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={modal === 'edit' ? 'Залишити порожнім' : '••••••••'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {modal === 'edit' && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    />
                    Активний
                  </label>
                </div>
              )}

              {/* Inline permissions */}
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Shield size={14} />
                  Дозволи (базові для ролі + коригування)
                </div>
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.title} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{group.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4 }}>
                      {group.permissions.map(p => {
                        const active = isPermissionActive(p.key);
                        const overridden = isOverridden(p.key);
                        return (
                          <label
                            key={p.key}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 6,
                              background: overridden ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                              border: overridden ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid transparent',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => togglePermission(p.key)}
                              style={{ accentColor: overridden ? '#8b5cf6' : undefined }}
                            />
                            <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                              {p.label}
                            </span>
                            {overridden && (
                              <span style={{ fontSize: 9, color: '#8b5cf6', fontWeight: 600 }}>змінено</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Скасувати</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Permissions-only Modal ────────────────────────── */}
      {modal === 'permissions' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Дозволи</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                Роль: <span className="badge" style={{ background: ROLE_COLORS[form.role] + '20', color: ROLE_COLORS[form.role], fontWeight: 600 }}>{ROLE_LABELS[form.role]}</span>
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Прапорець «змінено» = відхилення від базових дозволів ролі
                </span>
              </div>
              {PERMISSION_GROUPS.map(group => (
                <div key={group.title} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{group.title}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4 }}>
                    {group.permissions.map(p => {
                      const active = isPermissionActive(p.key);
                      const overridden = isOverridden(p.key);
                      return (
                        <label
                          key={p.key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            cursor: 'pointer', fontSize: 13, padding: '6px 8px', borderRadius: 6,
                            background: overridden ? 'rgba(139, 92, 246, 0.08)' : 'transparent',
                            border: overridden ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid transparent',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => togglePermission(p.key)}
                            style={{ accentColor: overridden ? '#8b5cf6' : undefined }}
                          />
                          <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                            {p.label}
                          </span>
                          {overridden && (
                            <span style={{ fontSize: 9, color: '#8b5cf6', fontWeight: 600 }}>змінено</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Скасувати</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Збереження...' : 'Зберегти дозволи'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
