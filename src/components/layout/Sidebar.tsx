'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  DollarSign,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Users,
  FileText,
  LogOut,
  X,
  Wallet,
  Landmark,
  ClipboardList,
  Upload,
  Clock,
  Repeat,
  ListChecks,
  Inbox,
  MessageSquare,
  Mail,
  GitBranch,
  UserPlus,
  Globe,
  CheckSquare,
  Target,
} from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { NAV_PERMISSION_MAP, ROLE_LABELS, ROLE_COLORS, hasPermission } from '@/lib/permissions';
import type { Permission } from '@/lib/permissions';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: Permission;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const navigation: NavSection[] = [
  {
    title: 'Основне',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} />, permission: 'nav:dashboard' },
      { label: 'Календар', href: '/calendar', icon: <CalendarDays size={20} />, permission: 'nav:calendar' },
      { label: 'Бронювання', href: '/bookings', icon: <BookOpen size={20} />, permission: 'nav:bookings' },
      { label: 'Імпорт Booking.com', href: '/imports/booking-com', icon: <Upload size={20} />, permission: 'nav:bookings' },
      { label: 'Виписки Airbnb/Booking', href: '/imports/ota-payouts', icon: <Repeat size={20} />, permission: 'nav:finance' },
      { label: 'Журнал змін', href: '/audit', icon: <Clock size={20} />, permission: 'nav:settings' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { label: 'Сьогодні', href: '/crm/today', icon: <Target size={20} />, permission: 'nav:crm' },
      { label: 'Inbox', href: '/crm/inbox', icon: <MessageSquare size={20} />, permission: 'nav:crm' },
      { label: 'Pipeline', href: '/crm', icon: <GitBranch size={20} />, permission: 'nav:crm' },
      { label: 'Ліди', href: '/crm/leads', icon: <UserPlus size={20} />, permission: 'nav:crm' },
      { label: 'Налаштування', href: '/crm/settings', icon: <Settings size={20} />, permission: 'nav:crm' },
    ],
  },
  {
    title: 'Управління',
    items: [
      { label: 'Ціноутворення', href: '/pricing', icon: <DollarSign size={20} />, permission: 'nav:pricing' },
      { label: 'Аналітика продажів', href: '/reports', icon: <BarChart3 size={20} />, permission: 'nav:reports' },
      { label: 'Гості', href: '/guests', icon: <Users size={20} />, permission: 'nav:guests' },
      { label: 'Evidenční kniha', href: '/guest-registry', icon: <ClipboardList size={20} />, permission: 'nav:guests' },
      { label: 'Документи', href: '/documents', icon: <FileText size={20} />, permission: 'nav:documents' },
      { label: 'Задачі', href: '/tasks', icon: <CheckSquare size={20} />, permission: 'nav:tasks' },
      { label: 'Сайти', href: '/sites', icon: <Globe size={20} />, permission: 'nav:sites' },
    ],
  },
  {
    title: 'Фінанси',
    items: [
      { label: 'Огляд', href: '/finance', icon: <Wallet size={20} />, permission: 'nav:finance' },
      { label: 'Reconcile (чеклист)', href: '/finance/reconcile', icon: <Inbox size={20} />, permission: 'nav:finance' },
      { label: 'Операції', href: '/finance/operations', icon: <ListChecks size={20} />, permission: 'nav:finance' },
      { label: 'Історія змін', href: '/finance/history', icon: <Clock size={20} />, permission: 'nav:finance' },
      { label: 'Clearing (платформи)', href: '/finance/clearing', icon: <Repeat size={20} />, permission: 'nav:finance' },
      { label: 'Чеки з пошти', href: '/finance/receipts', icon: <Mail size={20} />, permission: 'nav:finance' },
      { label: 'Import wizard', href: '/finance/import', icon: <Upload size={20} />, permission: 'nav:finance' },
      { label: 'Інвестори (адмін)', href: '/finance/investors', icon: <Users size={20} />, permission: 'nav:investors' },
      { label: 'Звіти', href: '/finance/reports', icon: <BarChart3 size={20} />, permission: 'nav:finance' },
      { label: 'Календар', href: '/finance/calendar', icon: <CalendarDays size={20} />, permission: 'nav:finance' },
      { label: 'Очікувані оплати', href: '/finance/expected-payments', icon: <Clock size={20} />, permission: 'nav:finance' },
      { label: 'CAPEX', href: '/finance/capex', icon: <Landmark size={20} />, permission: 'nav:finance' },
      { label: 'Нарахування', href: '/finance/accruals', icon: <ClipboardList size={20} />, permission: 'nav:finance' },
      { label: 'Банк', href: '/finance/bank', icon: <Upload size={20} />, permission: 'nav:finance' },
      { label: 'Налаштування фінансів', href: '/finance/settings', icon: <Settings size={20} />, permission: 'nav:finance' },
    ],
  },
  {
    title: 'Система',
    items: [
      { label: 'Налаштування', href: '/settings', icon: <Settings size={20} />, permission: 'nav:settings' },
    ],
  },
];

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const pathname = usePathname();
  const { user, loading, logout } = useCurrentUser();

  // Close mobile sidebar on route change
  useEffect(() => {
    if (onMobileClose) onMobileClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch draft pool count for sidebar badge
  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const res = await fetch('/api/booking/drafts-count');
        if (res.ok) {
          const data = await res.json();
          setDraftCount(data.count || 0);
        }
      } catch { /* non-critical */ }
    };
    fetchDrafts();
    const interval = setInterval(fetchDrafts, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  // Finance access restrictions for non-owner users
  const [financeAccess, setFinanceAccess] = useState<{
    is_owner: boolean; allowed_tabs: string[];
  } | null>(null);

  useEffect(() => {
    if (!user || user.role === 'owner') return;
    fetch('/api/finance/access/my')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setFinanceAccess(data); })
      .catch(() => {});
  }, [user]);

  // Map finance route paths to tab IDs for filtering
  const FINANCE_TAB_MAP: Record<string, string> = {
    '/finance': 'overview',
    '/finance/operations': 'operations',
    '/finance/reports': 'reports',
    '/finance/bank': 'bank',
    '/finance/clearing': 'clearing',
    '/finance/receipts': 'receipts',
    '/finance/calendar': 'calendar',
    '/finance/expected-payments': 'expected-payments',
    '/finance/capex': 'capex',
    '/finance/accruals': 'accruals',
    '/finance/history': 'history',
    '/finance/import': 'import',
    '/finance/reconcile': 'reconcile',
    '/finance/investors': 'investors',
    '/finance/settings': 'settings',
  };

  // Filter navigation based on user permissions
  const filteredNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!user) return true;

        // For non-owner finance users: filter by allowed_tabs FIRST — independent
        // of item.permission, otherwise finance links without a permission field
        // would bypass the tab restriction and always show.
        if (financeAccess && !financeAccess.is_owner && item.href.startsWith('/finance')) {
          const tabId = FINANCE_TAB_MAP[item.href];
          if (tabId && tabId !== 'overview' && !financeAccess.allowed_tabs.includes(tabId)) {
            return false;
          }
        }

        if (item.permission && !hasPermission(user.permissions, item.permission)) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={onMobileClose}
      />

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">A</div>
          <span className="sidebar-logo-text">ALiSiO PMS</span>
          {/* Mobile close button */}
          {mobileOpen && (
            <button
              className="mobile-menu-btn"
              onClick={onMobileClose}
              style={{ marginLeft: 'auto', display: 'flex' }}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {filteredNavigation.map((section) => (
            <div key={section.title}>
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && item.href !== '/crm' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="sidebar-nav-icon">{item.icon}</span>
                    <span className="sidebar-nav-label">{item.label}</span>
                    {item.href === '/calendar' && draftCount > 0 && (
                      <span className="sidebar-draft-badge" title={`${draftCount} бронювань у чорновику`}>
                        {draftCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User info + Logout */}
        {user && !loading && (
          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <div
                className="sidebar-user-avatar"
                style={{ background: ROLE_COLORS[user.role] }}
              >
                {user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div className="sidebar-user-details">
                <div className="sidebar-user-name">{user.full_name}</div>
                <div className="sidebar-user-role">{ROLE_LABELS[user.role]}</div>
              </div>
            </div>
            <button
              className="sidebar-logout-btn"
              onClick={logout}
              title="Вийти"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}

        {/* Toggle (hidden on mobile via CSS) */}
        <div className="sidebar-toggle">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>
    </>
  );
}
