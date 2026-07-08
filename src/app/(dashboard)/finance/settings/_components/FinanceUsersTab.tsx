'use client';

import { useCallback, useEffect, useState } from 'react';
import { Settings, ShieldCheck, ShieldOff } from 'lucide-react';
import FinanceUserModal from './FinanceUserModal';

export interface FinanceAccess {
  is_enabled: boolean;
  period_mode: 'all' | 'month';
  allowed_tabs: string[];
  allowed_accounts: string[];
  can_export: boolean;
  read_only: boolean;
}

export interface FinanceUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  access: FinanceAccess | null;
}

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Адмін',
  manager: 'Менеджер',
  receptionist: 'Рецепціоніст',
  housekeeper: 'Покоївка',
  accountant: 'Бухгалтер',
  viewer: 'Переглядач',
};

export default function FinanceUsersTab() {
  const [users, setUsers] = useState<FinanceUser[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<FinanceUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, accRes] = await Promise.all([
        fetch('/api/finance/access'),
        fetch('/api/finance/accounts'),
      ]);
      const usersJson = await usersRes.json();
      setUsers(Array.isArray(usersJson.users) ? usersJson.users : []);
      const accJson = await accRes.json();
      setAccounts(Array.isArray(accJson) ? accJson : Array.isArray(accJson.accounts) ? accJson.accounts : []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleToggle(user: FinanceUser) {
    const newEnabled = !(user.access?.is_enabled);
    setTogglingId(user.id);
    try {
      await fetch(`/api/finance/access/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: newEnabled }),
      });
      await fetchData();
    } catch (e) {
      console.error(e);
    }
    setTogglingId(null);
  }

  const enabledCount = users.filter((u) => u.access?.is_enabled).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Доступ користувачів</h2>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {enabledCount} з доступом / {users.length} всього
        </span>
      </div>

      <div style={infoBox}>
        🔐 Керуйте доступом співробітників до фінансового модуля. Увімкніть доступ тоглом, а натисніть ⚙️ щоб
        обрати доступні вкладки, рахунки та режим перегляду.
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження…</div>
      ) : users.length === 0 ? (
        <div style={emptyStyle}>Немає користувачів для налаштування доступу.</div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Користувач</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Роль</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Доступ</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const enabled = !!user.access?.is_enabled;
                return (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: enabled ? 'rgba(34,197,94,0.12)' : 'var(--bg-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: enabled ? '#16a34a' : 'var(--text-secondary)',
                            fontSize: 13, fontWeight: 600, flexShrink: 0,
                          }}
                        >
                          {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span style={{ fontWeight: 500 }}>{user.full_name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 13 }}>{user.email}</td>
                    <td style={tdStyle}>
                      <span style={roleBadge}>{ROLE_LABELS[user.role] || user.role}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => handleToggle(user)}
                        disabled={togglingId === user.id}
                        style={{
                          ...toggleTrack,
                          background: enabled ? '#22c55e' : 'var(--bg-secondary)',
                          border: enabled ? '1px solid #22c55e' : '1px solid var(--border-primary)',
                          opacity: togglingId === user.id ? 0.6 : 1,
                        }}
                        title={enabled ? 'Вимкнути доступ' : 'Увімкнути доступ'}
                      >
                        <span
                          style={{
                            ...toggleThumb,
                            transform: enabled ? 'translateX(18px)' : 'translateX(0)',
                          }}
                        />
                      </button>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => setEditingUser(user)}
                        style={iconBtn}
                        title="Налаштувати доступ"
                      >
                        <Settings size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {!loading && users.length > 0 && (
        <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={13} color="#16a34a" /> Доступ увімкнено
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ShieldOff size={13} /> Без доступу
          </span>
        </div>
      )}

      {editingUser && (
        <FinanceUserModal
          user={editingUser}
          accounts={accounts}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); fetchData(); }}
        />
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────── */

const infoBox: React.CSSProperties = {
  padding: 12, background: 'rgba(99,102,241,0.08)', borderRadius: 8,
  fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16,
};
const emptyStyle: React.CSSProperties = {
  padding: 40, textAlign: 'center', color: 'var(--text-secondary)',
  border: '1px dashed var(--border-primary)', borderRadius: 10,
};
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 14,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11,
  textTransform: 'uppercase', color: 'var(--text-secondary)',
  background: 'var(--bg-secondary)', fontWeight: 600,
  borderBottom: '1px solid var(--border-primary)',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 14px', verticalAlign: 'middle',
};
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 6,
  cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 6,
};
const roleBadge: React.CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 4,
  background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
  fontWeight: 600, textTransform: 'uppercase',
};
const toggleTrack: React.CSSProperties = {
  position: 'relative', width: 40, height: 22, borderRadius: 12,
  cursor: 'pointer', padding: 0, transition: 'background 0.2s',
};
const toggleThumb: React.CSSProperties = {
  display: 'block', width: 18, height: 18, borderRadius: '50%',
  background: '#fff', position: 'absolute', top: 1, left: 1,
  transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
};
