'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import {
  LayoutList, Sparkles, Palette, Code2, Tag, CreditCard, Percent, Package, BarChart2, Inbox, Mail, PieChart,
} from 'lucide-react';

export const TABS = [
  { id: 'analytics',   label: 'Аналітика',          icon: <PieChart size={16} /> },
  { id: 'bookings',    label: 'Бронювання',         icon: <LayoutList size={16} /> },
  { id: 'listings',    label: 'Оголошення',       icon: <LayoutList size={16} /> },
  { id: 'services',   label: 'Сервіси',           icon: <Sparkles size={16} /> },
  { id: 'design',     label: 'Дизайн',            icon: <Palette size={16} /> },
  { id: 'widget',     label: 'Віджет пошуку',     icon: <Code2 size={16} /> },
  { id: 'thank-you',  label: 'Конверсії',           icon: <BarChart2 size={16} /> },
  { id: 'payments',   label: 'Платежі',            icon: <CreditCard size={16} /> },
  { id: 'rate-plans', label: 'Тарифні плани',     icon: <Tag size={16} /> },
  { id: 'coupons',    label: 'Промокоди',          icon: <Percent size={16} /> },
  { id: 'packages',   label: 'Пакети',             icon: <Package size={16} /> },
  { id: 'forms',      label: 'Форми',              icon: <Inbox size={16} /> },
  { id: 'notifications', label: 'Емайли',            icon: <Mail size={16} /> },
] as const;

export type TabId = typeof TABS[number]['id'];

export const CANCEL_LABELS: Record<string, string> = {
  non_refundable: '❌ Без повернення',
  full_refund:    '✅ Повне повернення',
  flexible:       '⚡ Гнучке',
};

export const THEME_CONFIGS: Record<string, { color: string; bg: string; card: string; text: string; sub: string; border: string }> = {
  Classical: { color: '#8B6914', bg: '#fdf8f0', card: '#fff8ec', text: '#2d1f0a', sub: '#8b7355', border: '#e8d5b0' },
  Modern:    { color: '#2563eb', bg: '#f8faff', card: '#ffffff', text: '#0f172a', sub: '#64748b', border: '#e2e8f0' },
  Minimal:   { color: '#374151', bg: '#ffffff', card: '#f9fafb', text: '#111827', sub: '#9ca3af', border: '#f3f4f6' },
  Nature:    { color: '#16a34a', bg: '#f0fdf4', card: '#dcfce7', text: '#14532d', sub: '#4ade80', border: '#bbf7d0' },
  Luxury:    { color: '#d4af37', bg: '#0d0d1a', card: '#1a1628', text: '#f5efe6', sub: '#c9a84c', border: '#2d2540' },
  Ocean:     { color: '#0891b2', bg: '#ecfeff', card: '#cffafe', text: '#164e63', sub: '#0e7490', border: '#a5f3fc' },
  Sunset:    { color: '#ea580c', bg: '#fff7ed', card: '#ffedd5', text: '#431407', sub: '#c2410c', border: '#fed7aa' },
  Nordic:    { color: '#4f81bd', bg: '#f2f6fb', card: '#ffffff', text: '#1e3a5f', sub: '#7a9bbf', border: '#c8daf0' },
  Dark:      { color: '#22d3ee', bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', sub: '#94a3b8', border: '#334155' },
};

export const THEMES = Object.keys(THEME_CONFIGS);

export const BUTTON_STYLES = [
  { value: 'rounded_filled',  label: 'Rounded Filled' },
  { value: 'rounded_outline', label: 'Rounded Outline' },
  { value: 'sharp_filled',    label: 'Sharp Filled' },
  { value: 'sharp_outline',   label: 'Sharp Outline' },
  { value: 'pill_filled',     label: 'Pill Filled' },
  { value: 'pill_outline',    label: 'Pill Outline' },
];

export function Modal({ open, onClose, title, children, footer, size }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'lg' | 'xl';
}) {
  if (!open) return null;
  const w = size === 'xl' ? 900 : size === 'lg' ? 640 : 480;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: w, width: '95vw' }} onClick={e => e.stopPropagation()}>
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

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="btn btn-ghost" onClick={copy} style={{ padding: '4px 10px', fontSize: 12 }}>
      {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
      {copied ? 'Скопійовано' : 'Копіювати'}
    </button>
  );
}

export const Chk = ({ val }: { val?: string | null }) =>
  val
    ? <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>
    : <span style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>—</span>;
