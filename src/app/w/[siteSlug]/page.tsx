'use client';

import dynamicImport from 'next/dynamic';
import { useParams } from 'next/navigation';

const BookingV2 = dynamicImport(() => import('@/modules/bookings/ui/BookingV2'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100vh', background: '#FAFAF7' }} />
});

export default function WidgetPage() {
  const params = useParams();
  const siteSlug = (params?.siteSlug as string) || '';

  if (!siteSlug) return <div style={{ minHeight: '100vh', background: '#FAFAF7' }} />;

  return (
    <BookingV2 siteSlug={siteSlug} />
  );
}
