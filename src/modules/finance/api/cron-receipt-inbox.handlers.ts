/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Cron-driven receipt inbox poll.
//
// Bank statements have had a cron entry since PR #63; forwarded invoices never
// did. Their only automatic path was the tick inside getDb(), which fires when
// somebody happens to load a page — and which had been throwing on every
// startup, so in practice invoices were only imported when someone remembered
// to press "check now" in the UI.
//
// Same contract as the bank endpoint: no session, header `X-Cron-Secret` must
// match process.env.CRON_SECRET, and the 15-minute throttle marker is refreshed
// afterwards so a web visit does not immediately re-poll the same mailbox.
//
// crontab (installed by .github/workflows/deploy.yml):
//   */15 * * * * curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//     http://localhost:3001/api/cron/poll-receipt-inboxes >> /var/log/pms-cron-receipt.log 2>&1
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { checkReceiptInbox, type ReceiptInboxConfig, type CheckReceiptResult } from '../data/receipt-inbox-engine';

export async function pollReceiptInboxesFromCron(request: NextRequest): Promise<NextResponse> {
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

  // Reading a mailbox needs the password, and the password is encrypted with
  // this key. Without it every inbox below would fail one by one with the same
  // message; say it once instead.
  if (!process.env.BANK_INBOX_SECRET) {
    return NextResponse.json(
      { error: 'BANK_INBOX_SECRET env variable is not configured — inbox passwords cannot be decrypted' },
      { status: 500 },
    );
  }

  const db = getDb();
  const inboxes = db.prepare("SELECT * FROM fin_receipt_inboxes WHERE is_active = 1").all() as ReceiptInboxConfig[];

  const startedAt = Date.now();
  const results: Array<{
    inbox_id: string;
    mailbox: string;
    new_emails: number;
    attachments_imported: number;
    auto_matched: number;
    errors: string[];
    elapsed_ms: number;
  }> = [];

  for (const inbox of inboxes) {
    const t0 = Date.now();
    try {
      const r: CheckReceiptResult = await checkReceiptInbox(db, inbox);
      results.push({
        inbox_id: inbox.id,
        mailbox: inbox.imap_user,
        new_emails: r.newEmails,
        attachments_imported: r.attachmentsImported,
        auto_matched: r.autoMatched,
        errors: r.errors,
        elapsed_ms: Date.now() - t0,
      });
    } catch (e: any) {
      const message = e?.message || String(e);
      results.push({
        inbox_id: inbox.id,
        mailbox: inbox.imap_user,
        new_emails: 0,
        attachments_imported: 0,
        auto_matched: 0,
        errors: [message],
        elapsed_ms: Date.now() - t0,
      });
      // One unreachable mailbox must not stop the others, but it has to be
      // visible on the settings page rather than only in a log nobody opens.
      try {
        db.prepare("UPDATE fin_receipt_inboxes SET last_error = ?, updated_at = datetime('now') WHERE id = ?")
          .run(String(message).slice(0, 1000), inbox.id);
      } catch { /* swallow secondary failures */ }
    }
  }

  // Epoch milliseconds, because that is what runReceiptInboxTickIfDue compares
  // against. The bank endpoint writes an ISO string into its own marker, which
  // parses to NaN there and quietly defeats that throttle — not a mistake worth
  // copying.
  try {
    db.prepare(`
      INSERT INTO fin_system_state (key, value) VALUES ('last_receipt_inbox_tick', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(String(Date.now()));
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - startedAt,
    inboxes_checked: results.length,
    new_emails_total: results.reduce((s, r) => s + r.new_emails, 0),
    imported_total: results.reduce((s, r) => s + r.attachments_imported, 0),
    auto_matched_total: results.reduce((s, r) => s + r.auto_matched, 0),
    errors_total: results.reduce((s, r) => s + r.errors.length, 0),
    results,
  });
}

export const runtime = 'nodejs';
