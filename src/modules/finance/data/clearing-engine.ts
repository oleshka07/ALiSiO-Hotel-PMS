/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Clearing engine — manages receivables tracking for channel-sourced bookings.
//
// Each channel-sourced reservation (Booking.com, Airbnb, VRBO) creates a row
// in fin_channel_receivables linked to the matching clearing account. This
// gives us the "platform owes us X" view at any moment, and provides the
// reconciliation target for statement parsers (PR #17) and bank-op matching
// (PR #16).
//
// Lifecycle:
//   1. Reservation arrives via Hostex → upsertReceivableForReservation()
//      posts an 'expected' receivable with estimated commission
//   2. Statement uploaded (PR #17) → updates row to 'in_statement' with
//      actual commission + payout_id grouping
//   3. Bank op arrives matching the payout total (PR #16) → marks row
//      'paid' and links paid_operation_id
//

const HOSTEX_CHANNEL_TO_SOURCE: Record<string, string> = {
  'booking.com': 'booking',
  'airbnb': 'airbnb',
  'vrbo': 'vrbo',
  'expedia': 'expedia',
};

// Channel + currency → clearing account name (matches db.ts seeds)
const CLEARING_ACCOUNT_MAP: Record<string, string> = {
  'booking|CZK': 'Booking.com (CZK)',
  'booking|EUR': 'Booking.com (EUR)',
  'airbnb|EUR':  'Airbnb (EUR)',
  'vrbo|EUR':    'VRBO (EUR)',
  'teya|CZK':    'Teya (CZK)',
  'teya|EUR':    'Teya (EUR)',
};

// Channels that are booking platforms taking a commission. Teya is not one —
// it is the card acquirer — and the "OTA receivables" figure in the reports
// must keep meaning what its label says.
export const OTA_CLEARING_SOURCES = ['booking', 'airbnb', 'vrbo', 'expedia'] as const;

// Default commission percentages (used until statement gives actual numbers)
const DEFAULT_COMMISSION_PCT: Record<string, number> = {
  booking: 15,
  airbnb: 15,
  vrbo: 8,
  expedia: 18,
};

export interface UpsertReceivableInput {
  reservationId: string;
  organizationId: string;
  hostexChannelType: string;       // 'booking.com', 'airbnb', etc
  /**
   * Bypass the Hostex channel lookup. Teya payments do not come through
   * Hostex, so they name their clearing source directly.
   */
  channelSourceOverride?: string;
  externalReservationId: string;   // hostex_channel_id (Booking's res #)
  grossAmount: number;
  currency: string;                // per-reservation currency
  checkIn: string;                 // YYYY-MM-DD
  checkOut: string;                // YYYY-MM-DD
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'tentative' | 'cancelled' | 'no_show';
  commissionAmount?: number | null; // if known
}

/**
 * Map a Hostex channel_type + currency to the clearing-account name. Returns
 * null when there's no clearing account for that combination (e.g. direct
 * bookings, walk-ins). Caller should skip receivable creation in that case.
 */
function resolveClearingAccountName(channelSource: string, currency: string): string | null {
  return CLEARING_ACCOUNT_MAP[`${channelSource}|${currency}`] ?? null;
}

function findClearingAccount(db: any, orgId: string, name: string): string | null {
  const row = db.prepare(
    "SELECT id FROM finance_accounts WHERE organization_id = ? AND name = ? AND type = 'clearing' LIMIT 1"
  ).get(orgId, name) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * Idempotent upsert. Called from hostex-sync after every reservation create
 * or update. Skips silently when there's no matching clearing account or
 * gross amount is zero.
 *
 * Once a receivable reaches status='paid', subsequent updates only refresh
 * dates/amounts but never re-open the status.
 */
export function upsertReceivableForReservation(db: any, input: UpsertReceivableInput): string | null {
  const channelSource = input.channelSourceOverride
    ?? HOSTEX_CHANNEL_TO_SOURCE[input.hostexChannelType?.toLowerCase()];
  if (!channelSource) return null;

  const clearingName = resolveClearingAccountName(channelSource, input.currency);
  if (!clearingName) return null;

  const clearingAccountId = findClearingAccount(db, input.organizationId, clearingName);
  if (!clearingAccountId) return null;

  if (!input.grossAmount || input.grossAmount <= 0) return null;

  // Cancellations: mark existing receivable as 'cancelled' but don't create new.
  const existing = db.prepare(
    "SELECT id, status FROM fin_channel_receivables WHERE reservation_id = ? AND clearing_account_id = ?"
  ).get(input.reservationId, clearingAccountId) as { id: string; status: string } | undefined;

  if (input.status === 'cancelled' || input.status === 'no_show') {
    if (existing) {
      // Don't downgrade a paid receivable; keep paid history
      if (existing.status !== 'paid') {
        db.prepare(
          "UPDATE fin_channel_receivables SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
        ).run(existing.id);
      }
      return existing.id;
    }
    return null;
  }

  const commissionPct = DEFAULT_COMMISSION_PCT[channelSource] ?? 15;
  const expectedCommission = input.commissionAmount != null && input.commissionAmount > 0
    ? input.commissionAmount
    : +(input.grossAmount * commissionPct / 100).toFixed(2);
  const expectedNet = +(input.grossAmount - expectedCommission).toFixed(2);

  if (existing) {
    // Refresh non-status fields. Keep status, statement_payout_id, paid_operation_id intact.
    db.prepare(`
      UPDATE fin_channel_receivables SET
        external_reservation_id = ?,
        gross_amount = ?,
        expected_commission = ?,
        expected_net = ?,
        currency = ?,
        check_in = ?,
        check_out = ?,
        channel_source = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      input.externalReservationId,
      input.grossAmount,
      expectedCommission,
      expectedNet,
      input.currency,
      input.checkIn,
      input.checkOut,
      channelSource,
      existing.id,
    );
    return existing.id;
  }

  const id = `recv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO fin_channel_receivables
      (id, organization_id, reservation_id, clearing_account_id,
       channel_source, external_reservation_id,
       gross_amount, expected_commission, expected_net, currency,
       check_in, check_out, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'expected')
  `).run(
    id, input.organizationId, input.reservationId, clearingAccountId,
    channelSource, input.externalReservationId,
    input.grossAmount, expectedCommission, expectedNet, input.currency,
    input.checkIn, input.checkOut,
  );
  return id;
}

/**
 * One-shot backfill. Iterates all existing reservations with hostex_channel_*
 * fields and creates receivables. Idempotent (UNIQUE constraint guards
 * against duplicates). Returns count of rows actually inserted/updated.
 */
export function backfillReceivables(db: any, orgId: string): number {
  const rows = db.prepare(`
    SELECT r.id, r.hostex_channel_type, r.hostex_channel_id, r.currency,
           r.total_price, r.total_rate_eur, r.commission_eur, r.net_rate_eur,
           r.check_in, r.check_out, r.status
    FROM reservations r
    JOIN properties p ON p.id = r.property_id
    WHERE p.organization_id = ?
      AND r.hostex_channel_type IS NOT NULL
      AND r.hostex_channel_id IS NOT NULL
  `).all(orgId) as any[];

  let count = 0;
  for (const r of rows) {
    // Hostex stores total_price in CZK and total_rate_eur in EUR. Booking
    // and Airbnb pay out in EUR, so prefer the EUR amount when present.
    const isEurChannel = ['airbnb', 'vrbo'].includes(
      HOSTEX_CHANNEL_TO_SOURCE[r.hostex_channel_type?.toLowerCase()] ?? ''
    );
    const currency = isEurChannel || (r.total_rate_eur && r.total_rate_eur > 0) ? 'EUR' : 'CZK';
    const grossAmount = currency === 'EUR' && r.total_rate_eur ? r.total_rate_eur : r.total_price;

    const id = upsertReceivableForReservation(db, {
      reservationId: r.id,
      organizationId: orgId,
      hostexChannelType: r.hostex_channel_type,
      externalReservationId: r.hostex_channel_id,
      grossAmount,
      currency,
      checkIn: r.check_in,
      checkOut: r.check_out,
      status: r.status,
      commissionAmount: r.commission_eur && r.commission_eur > 0 ? r.commission_eur : null,
    });
    if (id) count++;
  }
  return count;
}

/**
 * Try to match an incoming bank operation to outstanding receivables.
 *
 * Matching rules (in order of preference):
 *   1. By statement_payout_id → all receivables sharing the payout_id whose
 *      sum(actual_net) ≈ op.amount within tolerance → mark them all paid.
 *      Booking.com works this way (one bank transfer settles many bookings).
 *   2. Single receivable with matching amount + currency + date ±5 days.
 *      VRBO works this way (one bank transfer per booking).
 *
 * Returns the list of receivable IDs that got linked to this op, or [] when
 * no match was found.
 */
export function tryMatchBankOpToReceivables(
  db: any,
  orgId: string,
  opId: string,
  opAmount: number,
  opCurrency: string,
  opDate: string,
): string[] {
  if (opAmount <= 0) return [];
  const tolerance = Math.max(0.5, opAmount * 0.005); // 0.5% or 0.50, whichever bigger

  // Strategy 1: payout-group match (Booking.com)
  const groups = db.prepare(`
    SELECT statement_payout_id, SUM(COALESCE(actual_net, expected_net)) AS total, COUNT(*) AS n
    FROM fin_channel_receivables
    WHERE organization_id = ? AND status = 'in_statement'
      AND statement_payout_id IS NOT NULL
      AND currency = ?
    GROUP BY statement_payout_id
    HAVING ABS(SUM(COALESCE(actual_net, expected_net)) - ?) <= ?
    ORDER BY ABS(SUM(COALESCE(actual_net, expected_net)) - ?) ASC
    LIMIT 1
  `).get(orgId, opCurrency, opAmount, tolerance, opAmount) as { statement_payout_id: string; total: number; n: number } | undefined;

  if (groups) {
    const ids = db.prepare(`
      SELECT id FROM fin_channel_receivables
      WHERE organization_id = ? AND statement_payout_id = ? AND status = 'in_statement'
    `).all(orgId, groups.statement_payout_id) as { id: string }[];
    db.prepare(`
      UPDATE fin_channel_receivables
      SET status = 'paid', paid_operation_id = ?, updated_at = datetime('now')
      WHERE statement_payout_id = ? AND status = 'in_statement' AND organization_id = ?
    `).run(opId, groups.statement_payout_id, orgId);
    return ids.map((r) => r.id);
  }

  // Strategy 2: single-row match (VRBO and direct cases)
  const single = db.prepare(`
    SELECT id FROM fin_channel_receivables
    WHERE organization_id = ? AND status IN ('in_statement', 'expected')
      AND currency = ?
      AND ABS(COALESCE(actual_net, expected_net) - ?) <= ?
      AND ABS(julianday(?) - julianday(COALESCE(statement_payout_date, check_out))) <= 5
    ORDER BY ABS(COALESCE(actual_net, expected_net) - ?) ASC,
             ABS(julianday(?) - julianday(COALESCE(statement_payout_date, check_out))) ASC
    LIMIT 1
  `).get(orgId, opCurrency, opAmount, tolerance, opDate, opAmount, opDate) as { id: string } | undefined;

  if (single) {
    db.prepare(`
      UPDATE fin_channel_receivables
      SET status = 'paid', paid_operation_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(opId, single.id);
    return [single.id];
  }

  return [];
}

/**
 * Compute clearing-account balance: sum of (expected|in_statement) receivables
 * minus settled (paid) receivables. Returns net "platform owes us" amount.
 *
 * Note: balance is computed dynamically rather than stored, so we always
 * reflect the current state of receivables.
 */
export function getClearingBalance(db: any, accountId: string): {
  expected: number;
  in_statement: number;
  paid_total: number;
  outstanding: number;
  receivable_count: number;
} {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'expected'     THEN expected_net ELSE 0 END), 0) AS expected,
      COALESCE(SUM(CASE WHEN status = 'in_statement' THEN COALESCE(actual_net, expected_net) ELSE 0 END), 0) AS in_statement,
      COALESCE(SUM(CASE WHEN status = 'paid'         THEN COALESCE(actual_net, expected_net) ELSE 0 END), 0) AS paid_total,
      SUM(CASE WHEN status IN ('expected','in_statement') THEN 1 ELSE 0 END) AS receivable_count
    FROM fin_channel_receivables
    WHERE clearing_account_id = ?
  `).get(accountId) as any;

  const expected = Number(row?.expected) || 0;
  const inStatement = Number(row?.in_statement) || 0;
  return {
    expected,
    in_statement: inStatement,
    paid_total: Number(row?.paid_total) || 0,
    outstanding: +(expected + inStatement).toFixed(2),
    receivable_count: Number(row?.receivable_count) || 0,
  };
}

/**
 * Record a card payment as money Teya owes us.
 *
 * Card money is deliberately kept out of fin_operations: it enters the ledger
 * only when the bank statement arrives, so that the same koruna is not counted
 * twice. The cost of that rule was a blind spot — between the guest paying and
 * Banking Circle settling, the money existed nowhere in the system, and three
 * quarters of "paid" bookings had no money behind them anywhere.
 *
 * This fills the blind spot without touching the ledger: fin_channel_receivables
 * is a separate table that no balance, operation list or P&L reads.
 *
 * Idempotent — UNIQUE (reservation_id, clearing_account_id) means paying twice,
 * or a webhook arriving after the return URL, updates rather than duplicates.
 */
export function recordTeyaReceivable(db: any, reservationId: string): string | null {
  try {
    const r = db.prepare(`
      SELECT r.id, r.total_price, r.currency, r.check_in, r.check_out, r.status,
             p.organization_id
      FROM reservations r
      JOIN properties p ON p.id = r.property_id
      WHERE r.id = ?
    `).get(reservationId) as any;
    if (!r || !r.total_price || r.total_price <= 0) return null;

    return upsertReceivableForReservation(db, {
      reservationId: r.id,
      organizationId: r.organization_id,
      hostexChannelType: '',
      channelSourceOverride: 'teya',
      externalReservationId: r.id,
      grossAmount: Number(r.total_price),
      currency: (r.currency || 'CZK').toUpperCase(),
      checkIn: r.check_in,
      checkOut: r.check_out,
      status: r.status,
      // Teya's fee is not knowable here — it is whatever the settlement says.
      // Guessing a percentage would put an invented number in front of the
      // operator; the statement fills actual_commission when it arrives.
      commissionAmount: 0,
    });
  } catch (e: any) {
    console.error('[clearing] Teya receivable failed (non-fatal):', e.message);
    return null;
  }
}
