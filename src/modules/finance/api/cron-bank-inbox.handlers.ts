/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Cron-driven bank inbox poll.
//
// The normal poll path is fired from `getDb()` and depends on someone
// actually browsing the PMS to wake it up. If nobody visits the site
// for a day, statements pile up in IMAP and import is delayed.
//
// This endpoint is meant to be hit by an external `crontab` entry on
// the VPS every 15 minutes. It accepts no auth cookie — instead it
// requires the header `X-Cron-Secret` to match `process.env.CRON_SECRET`.
//
// crontab example (on Hetzner VPS):
//   */15 * * * * curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     http://localhost:3000/api/cron/poll-bank-inboxes > /var/log/pms-cron-bank.log 2>&1
//
// Generate the secret once: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Add to .env on the VPS (and never commit to git).
//
// Unlike `runBankInboxTickIfDue`, this entry point bypasses the 15-min
// throttle so cron + web traffic don't cancel each other out. The cron
// runs on its own schedule; if a web visit happens to fire a tick at
// the same moment, the 15-min state row will absorb the redundant
// invocation (cron writes the same key after a successful run).
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { checkInbox, type BankInboxConfig, type CheckResult } from '../data/bank-inbox-engine';

export async function pollBankInboxesFromCron(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET env variable is not configured on the server' },
      { status: 500 },
    );
  }

  const provided = request.headers.get('x-cron-secret') || '';
  if (provided !== expected) {
    return NextResponse.json({ error: 'invalid or missing X-Cron-Secret header' }, { status: 401 });
  }

  const db = getDb();
  const inboxes = db.prepare("SELECT * FROM fin_bank_inboxes WHERE is_active = 1").all() as BankInboxConfig[];

  const startedAt = Date.now();
  const results: Array<{
    inbox_id: string;
    inbox_name: string;
    new_emails: number;
    imported: number;
    unmatched: number;
    errors: string[];
    elapsed_ms: number;
  }> = [];

  for (const inbox of inboxes) {
    const t0 = Date.now();
    try {
      const r: CheckResult = await checkInbox(db, inbox);
      results.push({
        inbox_id: inbox.id,
        inbox_name: inbox.name,
        new_emails: r.newEmails,
        imported: r.imported,
        unmatched: r.unmatched,
        errors: r.errors,
        elapsed_ms: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({
        inbox_id: inbox.id,
        inbox_name: inbox.name,
        new_emails: 0,
        imported: 0,
        unmatched: 0,
        errors: [e.message || String(e)],
        elapsed_ms: Date.now() - t0,
      });
      try {
        db.prepare("UPDATE fin_bank_inboxes SET last_error = ?, updated_at = datetime('now') WHERE id = ?")
          .run(e.message || String(e), inbox.id);
      } catch { /* swallow secondary failures */ }
    }
  }

  // Refresh the 15-min throttle marker so the web-driven `runBankInboxTickIfDue`
  // doesn't double-fire shortly after cron just finished.
  try {
    db.prepare(`
      INSERT INTO fin_system_state (key, value) VALUES ('last_bank_inbox_tick', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(new Date().toISOString());
  } catch { /* non-fatal */ }

  const totalEmails  = results.reduce((s, r) => s + r.new_emails, 0);
  const totalImports = results.reduce((s, r) => s + r.imported, 0);
  const totalErrors  = results.reduce((s, r) => s + r.errors.length, 0);

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - startedAt,
    inboxes_checked: results.length,
    new_emails_total: totalEmails,
    imported_total: totalImports,
    errors_total: totalErrors,
    results,
  });
}
