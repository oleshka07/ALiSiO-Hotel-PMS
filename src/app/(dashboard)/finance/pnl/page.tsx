import { redirect } from 'next/navigation';

// Legacy page retired (step 3 of the finance reporting rework) — the
// replacement lives in the new reports. Redirect keeps old links working.
export default function LegacyRedirect() {
  redirect('/finance/reports/pnl');
}
