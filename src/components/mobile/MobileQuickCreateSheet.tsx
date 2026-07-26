'use client';

import { X, BookOpen, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface MobileQuickCreateSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileQuickCreateSheet({ open, onClose }: MobileQuickCreateSheetProps) {
  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" style={{ paddingBottom: 24 }}>
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2>⚡ Швидке створення</h2>
          <button className="m-header-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px' }}>
          <Link
            href="/bookings?new=1"
            onClick={onClose}
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Нове бронювання</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Забронювати юніт для гостя</div>
            </div>
          </Link>

          <Link
            href="/guests?new=1"
            onClick={onClose}
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Новий гість</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Створити картку клієнта</div>
            </div>
          </Link>

          <Link
            href="/finance/operations?new=1"
            onClick={onClose}
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(34,197,94,0.15)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Нова фінансова операція</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Записати дохід або витрату</div>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
