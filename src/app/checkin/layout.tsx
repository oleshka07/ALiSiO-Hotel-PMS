import type { Viewport } from 'next';
import '../book/booking-wizard.css';

export const metadata = {
  title: 'Check-in — Kemp Carlsbad',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2E6B4F',
};

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  // .kc-root is where the wizard's palette lives — background, text colour and
  // the font all hang off it. Without it the page inherits the app's own body
  // colour, which on a phone in dark mode is light text on the light card
  // background: readable in the simulator, invisible at the gate.
  return <div className="kc-root">{children}</div>;
}
