import '../book/booking-wizard.css';

export const metadata = {
  title: 'Check-in — Kemp Carlsbad',
  robots: { index: false, follow: false },
};

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--kc-bg, #F2F2F7)', minHeight: '100vh' }}>{children}</div>;
}
