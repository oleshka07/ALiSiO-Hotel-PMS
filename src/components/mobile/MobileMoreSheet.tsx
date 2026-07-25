'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X, DollarSign, BarChart3, Users, FileText,
  Settings, Wallet, Receipt, TrendingUp,
  LogOut, MessageSquare, GitBranch, List,
} from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const moreItems = [
  { section: 'Управління', items: [
    { label: 'Ціноутворення', href: '/pricing', icon: DollarSign },
    { label: 'Звіти', href: '/reports', icon: BarChart3 },
    { label: 'Гості', href: '/guests', icon: Users },
    { label: 'Документи', href: '/documents', icon: FileText },
  ]},
  { section: 'CRM', items: [
    { label: 'Inbox', href: '/crm/inbox', icon: MessageSquare },
    { label: 'Pipeline', href: '/crm', icon: GitBranch },
  ]},
  { section: 'Фінанси', items: [
    { label: 'Огляд', href: '/finance', icon: Wallet },
    { label: 'Журнал транзакцій', href: '/finance/operations', icon: List },
    { label: 'Витрати', href: '/finance/expenses', icon: Receipt },
    { label: 'Cash Flow', href: '/finance/cashflow', icon: TrendingUp },
  ]},
  { section: 'Система', items: [
    { label: 'Налаштування', href: '/settings', icon: Settings },
  ]},
];

export default function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const { user, logout } = useCurrentUser();

  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet">
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2>Більше</h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* User info */}
        {user && (
          <div className="m-sheet-user">
            <div className="m-sheet-avatar">{user.full_name?.[0]?.toUpperCase() || '?'}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{user.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{user.role}</div>
            </div>
          </div>
        )}

        <div className="m-sheet-sections">
          {moreItems.map(section => (
            <div key={section.section} className="m-sheet-section">
              <div className="m-sheet-section-title">{section.section}</div>
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`m-sheet-item ${isActive ? 'm-sheet-item-active' : ''}`}
                    onClick={onClose}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <button className="m-sheet-logout" onClick={logout}>
          <LogOut size={18} />
          <span>Вийти</span>
        </button>
      </div>
    </>
  );
}
