'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import MobileHeader from './MobileHeader';
import MobileBottomTabs from './MobileBottomTabs';
import MobileMoreSheet from './MobileMoreSheet';
import MobileQuickCreateSheet from './MobileQuickCreateSheet';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const [showMore, setShowMore] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  return (
    <div className="m-app" style={{ position: 'relative' }}>
      <MobileHeader />
      <main className="m-content">
        {children}
      </main>

      {/* Global Quick Action FAB */}
      <button
        onClick={() => setShowQuickCreate(true)}
        aria-label="Швидке створення"
        style={{
          position: 'fixed',
          bottom: 72,
          right: 18,
          width: 50,
          height: 50,
          borderRadius: 25,
          background: 'linear-gradient(135deg, var(--accent-primary), #2563eb)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 40,
        }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <MobileBottomTabs onMoreClick={() => setShowMore(true)} />
      <MobileMoreSheet open={showMore} onClose={() => setShowMore(false)} />
      <MobileQuickCreateSheet open={showQuickCreate} onClose={() => setShowQuickCreate(false)} />
    </div>
  );
}
