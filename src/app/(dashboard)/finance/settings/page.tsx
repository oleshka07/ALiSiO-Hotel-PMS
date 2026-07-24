'use client';

import { useState } from 'react';
import { Settings, Wallet, ArrowLeftRight, FolderTree, FolderKanban, Users, Tag, Zap, UserCog, Repeat, Mail, CreditCard } from 'lucide-react';
import AccountsTab from './_components/AccountsTab';
import ExchangeRatesTab from './_components/ExchangeRatesTab';
import CategoriesTab from './_components/CategoriesTab';
import ProjectsTab from './_components/ProjectsTab';
import CounterpartiesTab from './_components/CounterpartiesTab';
import TagsTab from './_components/TagsTab';
import AutoRulesTab from './_components/AutoRulesTab';
import RecurringTemplatesTab from './_components/RecurringTemplatesTab';
import BankInboxesTab from './_components/BankInboxesTab';
import TeyaSyncTab from './_components/TeyaSyncTab';
import ReceiptInboxesTab from './_components/ReceiptInboxesTab';
import FinanceUsersTab from './_components/FinanceUsersTab';

type TabId =
  | 'accounts'
  | 'exchange-rates'
  | 'categories'
  | 'projects'
  | 'counterparties'
  | 'tags'
  | 'auto-rules'
  | 'recurring'
  | 'bank-inboxes'
  | 'receipt-inboxes'
  | 'teya-sync'
  | 'users';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const TABS: TabDef[] = [
  { id: 'accounts', label: 'Рахунки', icon: <Wallet size={16} />, enabled: true },
  { id: 'exchange-rates', label: 'Курси валют', icon: <ArrowLeftRight size={16} />, enabled: true },
  { id: 'categories', label: 'Категорії', icon: <FolderTree size={16} />, enabled: true },
  { id: 'projects', label: 'Проєкти', icon: <FolderKanban size={16} />, enabled: true },
  { id: 'counterparties', label: 'Контрагенти', icon: <Users size={16} />, enabled: true },
  { id: 'tags', label: 'Теги', icon: <Tag size={16} />, enabled: true },
  { id: 'auto-rules', label: 'Автоправила', icon: <Zap size={16} />, enabled: true },
  { id: 'recurring', label: 'Регулярки', icon: <Repeat size={16} />, enabled: true },
  { id: 'bank-inboxes', label: 'Банк-приймач', icon: <Mail size={16} />, enabled: true },
  { id: 'receipt-inboxes', label: 'Receipt inbox (чеки)', icon: <Mail size={16} />, enabled: true },
  { id: 'teya-sync', label: 'Teya sync', icon: <CreditCard size={16} />, enabled: true },
  { id: 'users', label: 'Користувачі', icon: <UserCog size={16} />, enabled: true },
];

export default function FinanceSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('accounts');

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Settings size={28} />
        <h1 style={{ margin: 0 }}>Фінанси — Налаштування</h1>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 16 }}>
        <aside
          style={{
            minWidth: 220,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            padding: 6,
            position: 'sticky',
            top: 80,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => tab.enabled && setActiveTab(tab.id)}
                disabled={!tab.enabled}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: isActive ? 'var(--bg-primary)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : tab.enabled ? 'var(--text-secondary)' : 'var(--text-muted, #999)',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  cursor: tab.enabled ? 'pointer' : 'not-allowed',
                  borderRadius: 8,
                  textAlign: 'left',
                  opacity: tab.enabled ? 1 : 0.6,
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  marginBottom: 2,
                }}
              >
                {tab.icon}
                <span style={{ flex: 1 }}>{tab.label}</span>
                {!tab.enabled && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'var(--bg-primary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    незабаром
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'accounts' && <AccountsTab />}
          {activeTab === 'exchange-rates' && <ExchangeRatesTab />}
          {activeTab === 'categories' && <CategoriesTab />}
          {activeTab === 'projects' && <ProjectsTab />}
          {activeTab === 'counterparties' && <CounterpartiesTab />}
          {activeTab === 'tags' && <TagsTab />}
          {activeTab === 'auto-rules' && <AutoRulesTab />}
          {activeTab === 'recurring' && <RecurringTemplatesTab />}
          {activeTab === 'bank-inboxes' && <BankInboxesTab />}
          {activeTab === 'receipt-inboxes' && <ReceiptInboxesTab />}
          {activeTab === 'teya-sync' && <TeyaSyncTab />}
          {activeTab === 'users' && <FinanceUsersTab />}
        </main>
      </div>
    </div>
  );
}
