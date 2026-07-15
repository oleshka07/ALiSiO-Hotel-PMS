'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wallet, TrendingUp, FileText, FolderKanban, Scale, Target, BarChart3, History, ArrowLeft } from 'lucide-react';
import IndicatorsModal from './_components/IndicatorsModal';

interface ReportCard {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function ReportsLandingPage() {
  const [showIndicators, setShowIndicators] = useState(false);

  const cards: ReportCard[] = [
    { id: 'cashflow', title: 'Гроші / Cash Flow', desc: 'Рух грошей по категоріях × місяцях', icon: <Wallet size={24} />, href: '/finance/reports/cashflow' },
    { id: 'pnl', title: 'P&L', desc: 'Прибутки та збитки з класифікатором', icon: <TrendingUp size={24} />, href: '/finance/reports/pnl' },
    { id: 'pnl-2', title: 'PNL-2 (Фінмодель)', desc: 'Звіт за структурою фінмоделі (EBITDA, Margin)', icon: <TrendingUp size={24} />, href: '/finance/reports/pnl-2' },
    { id: 'indicators', title: 'Фінансові показники', desc: 'EBITDA, Gross Profit, Margin % за місяць', icon: <BarChart3 size={24} />, onClick: () => setShowIndicators(true) },
    { id: 'log', title: 'Історія дій', desc: 'Усі операції в хронологічному порядку', icon: <History size={24} />, href: '/finance/operations' },
    { id: 'statement', title: 'Виписка за рахунком', desc: 'Звіт з банківських рахунків з running balance', icon: <FileText size={24} />, href: '/finance/reports/statement' },
    { id: 'projects', title: 'Проєкти', desc: 'Прибутковість по проєктах (дохід/витрата/маржа)', icon: <FolderKanban size={24} />, href: '/finance/reports/projects' },
    { id: 'balance', title: 'Баланс', desc: 'Активи та пасиви на обрану дату', icon: <Scale size={24} />, href: '/finance/reports/balance' },
    { id: 'plan-fact', title: 'План/Факт', desc: 'Порівняння планових і фактичних результатів', icon: <Target size={24} />, href: '/finance/reports/plan-fact' },
  ];

  return (
    <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/finance/operations" style={backLink}>
          <ArrowLeft size={14} />
        </Link>
        <h1 style={{ margin: 0 }}>📊 Звіти</h1>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
        marginTop: 24,
      }}>
        {cards.map((c) => {
          const content = (
            <div
              style={{
                padding: 20,
                background: c.disabled ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 12,
                cursor: c.disabled ? 'not-allowed' : 'pointer',
                opacity: c.disabled ? 0.5 : 1,
                transition: 'all 0.15s',
                minHeight: 110,
                position: 'relative',
              }}
              onMouseEnter={(e) => { if (!c.disabled) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent, #6366f1)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)'; }}
            >
              <div style={{ marginBottom: 10, color: 'var(--accent, #6366f1)' }}>{c.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.desc}</div>
              {c.disabled && (
                <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, padding: '2px 8px', background: 'var(--bg-secondary)', borderRadius: 4, color: 'var(--text-secondary)' }}>
                  незабаром
                </span>
              )}
            </div>
          );
          if (c.disabled) return <div key={c.id}>{content}</div>;
          if (c.onClick) return <button key={c.id} onClick={c.onClick} style={btnReset}>{content}</button>;
          return <Link key={c.id} href={c.href!} style={linkReset}>{content}</Link>;
        })}
      </div>

      {showIndicators && <IndicatorsModal onClose={() => setShowIndicators(false)} />}
    </div>
  );
}

const backLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: 8,
  background: 'var(--bg-secondary)', borderRadius: 8,
  color: 'var(--text-primary)', textDecoration: 'none',
};
const btnReset: React.CSSProperties = { all: 'unset', display: 'block', cursor: 'pointer' };
const linkReset: React.CSSProperties = { textDecoration: 'none', color: 'inherit' };
