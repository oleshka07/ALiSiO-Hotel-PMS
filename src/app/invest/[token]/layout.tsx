import type { Metadata } from 'next';
import '../invest.css';

const TITLE = 'Swipe Scape Investment Portfolio';
const DESCRIPTION = 'Your investment portfolio dashboard';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website' },
  robots: { index: false, follow: false },
};

export default function InvestLayout({ children }: { children: React.ReactNode }) {
  return <div className="invest-page-root">{children}</div>;
}
