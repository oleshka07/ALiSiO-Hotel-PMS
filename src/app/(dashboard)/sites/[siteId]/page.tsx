'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useMobileMenu } from '@/lib/MobileMenuContext';
import { Globe, ArrowLeft, Loader2 } from 'lucide-react';
import { TABS } from './_components/SiteHelpers';
import { AnalyticsTab } from './_components/AnalyticsTab';
import { BookingsTab } from './_components/BookingsTab';
import { ListingsTab }   from './_components/ListingsTab';
import { ServicesTab }   from './_components/ServicesTab';
import { DesignTab }     from './_components/DesignTab';
import { WidgetTab }     from './_components/WidgetTab';
import { RatePlansTab }  from './_components/RatePlansTab';
import { PaymentsTab }   from './_components/PaymentsTab';
import { CouponsTab } from './_components/CouponsTab';
import { PackageOffersTab } from './_components/PackageOffersTab';
import { ThankYouTab } from './_components/ThankYouTab';
import { FormsTab } from './_components/FormsTab';
import { NotificationsTab } from './_components/NotificationsTab';
import type { Site } from './_types';

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  paused: '#f59e0b',
  deleted: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Активний',
  paused: 'Призупинено',
  deleted: 'Видалено',
};

export default function SiteDetailPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = params?.siteId as string;
  const router = useRouter();
  const onMenuClick = useMobileMenu();

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('tab') || 'analytics';
    }
    return 'analytics';
  });
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(null, '', url.toString());
  }, [activeTab]);


  const couponCountCb = useCallback((n: number) => setTabCounts(prev => ({ ...prev, coupons: n })), []);
  const ratePlanCountCb = useCallback((n: number) => setTabCounts(prev => ({ ...prev, 'rate-plans': n })), []);
  const packageCountCb = useCallback((n: number) => setTabCounts(prev => ({ ...prev, packages: n })), []);
  const formsCountCb = useCallback((n: number) => setTabCounts(prev => ({ ...prev, forms: n })), []);

  const fetchSite = useCallback(async () => {
    if (siteId === 'all') {
      setSite({
        id: 'all',
        name: 'Всі джерела',
        type: 'widget',
        currency: 'CZK',
        status: 'active',
        created_at: new Date().toISOString()
      } as unknown as Site);
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/booking-sites/${siteId}`);
    const d = await res.json();
    if (d.site) setSite(d.site);
    setLoading(false);
  }, [siteId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchSite();

    // Pre-fetch counts for tabs so badges display immediately
    if (siteId !== 'all') {
      Promise.all([
        fetch(`/api/coupons?site_id=${siteId}`).then(r => r.json()).catch(() => null),
        fetch(`/api/package-offers?site_id=${siteId}`).then(r => r.json()).catch(() => null),
        fetch(`/api/booking-sites/${siteId}/rate-plans`).then(r => r.json()).catch(() => null),
      ]).then(([couponData, bundleData, ratePlanData]) => {
        if (couponData && Array.isArray(couponData)) couponCountCb(couponData.length);
        if (bundleData?.bundles) packageCountCb(bundleData.bundles.length);
        if (ratePlanData?.ratePlans) ratePlanCountCb(ratePlanData.ratePlans.length);
      });
    }
  }, [fetchSite, siteId, couponCountCb, packageCountCb, ratePlanCountCb, formsCountCb]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return (
    <>
      <Header title="Завантаження..." onMenuClick={onMenuClick} />
      <div className="app-content" style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Loader2 size={36} className="spin" style={{ color: 'var(--accent-primary)' }} />
      </div>
    </>
  );

  if (!site) return (
    <>
      <Header title="Сайт не знайдено" onMenuClick={onMenuClick} />
      <div className="app-content" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 16, marginBottom: 12 }}>Сайт не знайдено або видалено</div>
        <button className="btn btn-primary" onClick={() => router.push('/sites')}><ArrowLeft size={16} /> Назад до списку</button>
      </div>
    </>
  );

  return (
    <>
      <Header title={site.name} onMenuClick={onMenuClick} onBack={() => router.push('/sites')} />

      <div className="app-content">
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn btn-ghost" onClick={() => router.push('/sites')} style={{ padding: '6px 10px' }}>
            <ArrowLeft size={16} /> Сайти
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={18} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontWeight: 700, fontSize: 18 }}>{site.name}</span>
            <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 99, background: `${STATUS_COLOR[site.status]}22`, color: STATUS_COLOR[site.status], fontWeight: 600 }}>
              {STATUS_LABEL[site.status] ?? site.status}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{site.currency}</span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-primary)', marginBottom: 24, overflowX: 'auto' }}>
          {(siteId === 'all' ? TABS.filter(t => t.id === 'analytics' || t.id === 'bookings') : TABS).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent-primary)' : 'transparent'}`,
                color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                marginBottom: -1, transition: 'all .15s',
              }}>
              {tab.icon} {tab.label}
              {tabCounts[tab.id] !== undefined && (
                <span style={{
                  fontSize: 11, fontWeight: 700, minWidth: 18, height: 18,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 99, padding: '0 5px',
                  background: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--surface-secondary)',
                  color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                }}>{tabCounts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'analytics'   && <AnalyticsTab siteId={siteId} siteCurrency={site?.currency || 'CZK'} />}
        {activeTab === 'bookings'    && <BookingsTab siteId={siteId} />}
        {activeTab === 'listings'    && <ListingsTab siteId={siteId} siteSlug={site.slug} siteCurrency={site.currency} />}
        {activeTab === 'services'    && <ServicesTab siteId={siteId} siteCurrency={site.currency} />}
        {activeTab === 'design'      && <DesignTab site={site} onUpdate={cfg => setSite(s => s ? { ...s, design_config: cfg } : s)} />}
        {activeTab === 'widget'      && <WidgetTab site={site} onUpdate={cfg => setSite(s => s ? { ...s, widget_config: cfg } : s)} />}
        {activeTab === 'thank-you'   && <ThankYouTab site={site} onUpdate={cfg => setSite(s => s ? { ...s, widget_config: { ...s.widget_config, ...cfg } } : s)} />}
        {activeTab === 'payments'    && <PaymentsTab site={site} onUpdate={cfg => setSite(s => s ? { ...s, payment_config: cfg } : s)} />}
        {activeTab === 'rate-plans'  && <RatePlansTab siteId={siteId} onCountChange={ratePlanCountCb} />}
        {activeTab === 'coupons' && <CouponsTab siteId={siteId} siteCurrency={site.currency} onCountChange={couponCountCb} />}
        {activeTab === 'packages'    && <PackageOffersTab siteId={siteId} siteCurrency={site.currency} onCountChange={packageCountCb} />}
        {activeTab === 'forms'       && <FormsTab siteId={siteId} onCountChange={formsCountCb} />}
        {activeTab === 'notifications' && <NotificationsTab site={site} onUpdate={cfg => setSite(s => s ? { ...s, widget_config: { ...s.widget_config, ...cfg } } : s)} />}
      </div>
    </>
  );
}
