'use client';

import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import Link from 'next/link';
import {
  Building2,
  BedDouble,
  Users,
  FileText,
  Settings as SettingsIcon,
  ChevronRight,
  Globe,
  CreditCard,
  Bell,
  LinkIcon,
  UserCheck,
  Code2,
  Sparkles,
  Brain,
} from 'lucide-react';

const settingsItems = [
  {
    title: "Об'єкти (Properties)",
    desc: 'Керування об\'єктами розміщення',
    icon: <Building2 size={22} />,
    href: '/settings/properties',
    color: 'blue',
  },
  {
    title: 'Номери / Юніти',
    desc: 'Управління номерами, типами юнітів та будівлями',
    icon: <BedDouble size={22} />,
    href: '/settings/units',
    color: 'blue',
  },
  {
    title: 'Користувачі та ролі',
    desc: 'Адміни, менеджери, оператори',
    icon: <Users size={22} />,
    href: '/settings/users',
    color: 'purple',
  },
  {
    title: 'Джерела бронювань',
    desc: 'Booking.com, Airbnb, Direct та інші канали',
    icon: <LinkIcon size={22} />,
    href: '/settings/booking-sources',
    color: 'green',
  },
  {
    title: 'Гостьова сторінка',
    desc: 'Контент для гостей: зручності, FAQ, правила, WiFi',
    icon: <UserCheck size={22} />,
    href: '/settings/guest-page',
    color: 'blue',
  },
  {
    title: 'Послуги для гостей',
    desc: 'Сніданки, сауна, велосипеди, чан — ціни та статуси',
    icon: <Sparkles size={22} />,
    href: '/settings/services',
    color: 'orange',
  },
  {
    title: 'AI База знань',
    desc: 'Навчання AI-рецепціоніста: знання, правила, відповіді',
    icon: <Brain size={22} />,
    href: '/settings/ai-knowledge',
    color: 'purple',
  },
  {
    title: 'Шаблони документів',
    desc: 'Підтвердження, інструкції, правила',
    icon: <FileText size={22} />,
    href: '/settings/templates',
    color: 'yellow',
  },
  {
    title: 'Канал-менеджер',
    desc: 'iCal синхронізація з VRBO, Airbnb та іншими OTA',
    icon: <Globe size={22} />,
    href: '/settings/channel-manager',
    color: 'blue',
  },
  {
    title: 'Віджет бронювання',
    desc: 'Код для вставки на зовнішні сайти',
    icon: <Code2 size={22} />,
    href: '/settings/booking-widget',
    color: 'green',
  },
  {
    title: 'Оплата та збори',
    desc: 'Податки, збори, методи оплати',
    icon: <CreditCard size={22} />,
    href: '/settings/payments',
    color: 'green',
  },
  {
    title: 'Сповіщення',
    desc: 'Email, Telegram, внутрішні нагадування',
    icon: <Bell size={22} />,
    href: '/settings/notifications',
    color: 'yellow',
  },
  {
    title: 'Загальні налаштування',
    desc: 'Часовий пояс, мова, валюта',
    icon: <SettingsIcon size={22} />,
    href: '/settings/general',
    color: 'purple',
  },
];

export default function SettingsPage() {
  const onMenuClick = useMobileMenu();
  return (
    <>
      <Header title="Налаштування" onMenuClick={onMenuClick} />
      <div className="app-content">
        <div className="page-header">
          <div>
            <h2 className="page-title">Налаштування системи</h2>
            <div className="page-subtitle">Керування об&apos;єктами, юнітами, користувачами та інтеграціями</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {settingsItems.map((item) => (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                <div className={`stat-icon ${item.color}`}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{item.desc}</div>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--text-tertiary)' }} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
