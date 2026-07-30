/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import {
  createOperationInTx,
  recalcReservationPaymentStatus,
  type OperationActor,
} from './operations.handlers';
import { applyRulesToOperation, loadActiveRules } from '../data/auto-rules-engine';

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'invoice' | 'online' | 'booking_platform';
export type PaymentSubtype = 'deposit' | 'full' | 'partial' | 'service' | 'refund';
export type PaymentSource = 'teia' | 'hostex' | 'booking_widget' | 'manual';

export interface CreatePaymentOperationInput {
  reservationId: string;
  amount: number;
  currency?: string;
  method: PaymentMethod;
  paymentSubtype: PaymentSubtype;
  source: PaymentSource;
  sourceRef?: string;
  paidAt?: string;
  accountId?: string;
  status?: 'completed' | 'pending';
  comment?: string;
  /**
   * Channel descriptor (Hostex passes 'booking.com' / 'airbnb' / 'vrbo').
   * Used by the resolver to route the operation to the matching clearing
   * account ('Booking.com (CZK)' / 'Airbnb (EUR)' / etc) instead of
   * defaulting to the first cash account.
   */
  channelType?: string;
  /**
   * Who triggered this payment. Forwarded into the fin_operation as
   * `created_by_user_id` + recorded in the audit table. Null for
   * system flows (Hostex sync, Teia webhook, etc.) where there's no
   * HTTP user — those audit rows read «System» in the UI.
   */
  actor?: OperationActor | null;
}

/**
 * Look up the clearing account that matches a channel + currency. Returns
 * null when no clearing account is seeded for this combination — caller
 * should then fall back AND tag the operation as needs_review.
 */
function findClearingAccount(db: any, orgId: string, channelType: string | undefined, currency: string): string | null {
  if (!channelType) return null;
  const ch = channelType.toLowerCase();
  const display = ch === 'booking.com' || ch === 'booking_com' || ch === 'booking'
    ? 'Booking.com'
    : ch === 'airbnb' ? 'Airbnb'
    : ch === 'vrbo' ? 'VRBO'
    : ch === 'expedia' ? 'Expedia'
    : null;
  if (!display) return null;
  const wanted = `${display} (${currency.toUpperCase()})`;
  const row = db.prepare(
    "SELECT id FROM finance_accounts WHERE organization_id = ? AND name = ? AND type = 'clearing' AND is_active = 1 LIMIT 1"
  ).get(orgId, wanted) as { id: string } | undefined;
  return row?.id || null;
}

/**
 * Create a payment-style operation tied to a reservation.
 * Handles op_type mapping (refund → expense, others → income) and recalculates
 * the reservation.payment_status.
 *
 * This replaces direct INSERT INTO payments across hostex-sync, Teya webhook,
 * and widget-payment-return handlers.
 */
export function createPaymentOperation(input: CreatePaymentOperationInput): { operationId: string } {
  const db = getDb();
  const {
    reservationId, amount, method, paymentSubtype, source,
    currency = 'CZK',
    sourceRef,
    paidAt = new Date().toISOString(),
    accountId,
    status = 'completed',
    comment,
  } = input;

  // Get organization_id via reservations -> properties (+ stay dates for
  // accrual attribution below)
  const row = db.prepare(`
    SELECT prop.organization_id AS org_id, r.check_in, r.check_out
    FROM reservations r JOIN properties prop ON r.property_id = prop.id
    WHERE r.id = ?
  `).get(reservationId) as { org_id: string; check_in: string | null; check_out: string | null } | undefined;
  if (!row) throw new Error(`Reservation ${reservationId} not found`);

  const isRefund = paymentSubtype === 'refund';
  const opType = isRefund ? 'expense' : 'income';

  // Auto-comment: when caller didn't supply one, build a short, info-rich
  // string from reservation context so the operator scanning the
  // operations list immediately sees which booking the money is for
  // («Hostex Airbnb · RES-123 · John Doe · 2026-05-20»). Caller's
  // explicit comment always wins.
  const resContext = (() => {
    try {
      const ctx = db.prepare(`
        SELECT r.id, r.check_in,
               TRIM(COALESCE(g.first_name, '') || ' ' || COALESCE(g.last_name, '')) AS guest_name
        FROM reservations r
        LEFT JOIN guests g ON g.id = r.guest_id
        WHERE r.id = ?
      `).get(reservationId) as { id: string; check_in: string | null; guest_name: string | null } | undefined;
      if (!ctx) return null;
      const parts = [
        `RES ${ctx.id.slice(0, 8)}`,
        ctx.guest_name && ctx.guest_name.length > 0 ? ctx.guest_name : null,
        ctx.check_in ? `check-in ${ctx.check_in.substring(0, 10)}` : null,
      ].filter(Boolean);
      return parts.join(' · ');
    } catch { return null; }
  })();

  const fullComment = comment
    ? `${comment}${resContext ? ' | ' + resContext : ''}`
    : `${source === 'booking_widget' ? 'Віджет (готівка)' : 'Готівка'} · ${paymentSubtype}${resContext ? ' | ' + resContext : ''}`;

  // Resolve account in 3 stages:
  //   1) Explicit accountId from caller — always honoured.
  //   2) For channel signals (Hostex prepaid via Booking/Airbnb/VRBO),
  //      route to the matching clearing account ("Booking.com (CZK)" etc).
  //   3) Final fallback — first cash account in matching currency, BUT
  //      flag the operation needs_review=1 so the admin can triage.
  let resolvedAccountId = accountId;
  let needsReview = 0;
  if (!resolvedAccountId && source === 'hostex') {
    resolvedAccountId = findClearingAccount(db, row.org_id, input.channelType, currency) || undefined;
  }
  if (!resolvedAccountId) {
    const fallback = db.prepare(`
      SELECT id FROM finance_accounts
      WHERE organization_id = ? AND currency = ?
        AND type IN ('cash', 'bank') AND is_active = 1
      ORDER BY sort_order ASC, created_at ASC LIMIT 1
    `).get(row.org_id, currency) as { id: string } | undefined;
    resolvedAccountId = fallback?.id || undefined;
    if (source === 'hostex' || source === 'teia' || source === 'booking_widget') {
      needsReview = 1;
    }
  }

  const accruedAt = (!isRefund && row.check_in) ? row.check_in : undefined;

  // ONLY cash payments create an operation in fin_operations (the central ledger).
  // Non-cash methods (card, bank_transfer, online, booking_platform, etc.) arrive
  // via bank statement import and will be recorded when the real bank transaction lands.
  if (method !== 'cash') {
    recalcReservationPaymentStatus(db, reservationId);
    return { operationId: '' };
  }

  const operationId = createOperationInTx(db, row.org_id, {
    op_type: opType,
    account_from_id: isRefund ? (resolvedAccountId || null) : null,
    account_to_id: isRefund ? null : (resolvedAccountId || null),
    amount: Math.abs(amount),
    currency,
    paid_at: paidAt,
    ...(accruedAt ? { accrued_at: accruedAt } : {}),
    ...(row.check_in ? { period_from: row.check_in } : {}),
    ...(row.check_out ? { period_to: row.check_out } : {}),
    category_id: isRefund ? 'ec_other_exp' : 'ec_accommodation',
    reservation_id: reservationId,
    status,
    method,
    payment_subtype: paymentSubtype,
    comment: fullComment,
    source,
    source_ref: sourceRef || reservationId,
    needs_review: needsReview,
  }, input.actor || null);

  recalcReservationPaymentStatus(db, reservationId);

  // Auto-rules: payment-bridge ops (Hostex / Teia / widget / manual
  // payment) start with no category / counterparty / project. Run the
  // active rules so they get auto-tagged the same way bank-imported ops
  // already do. Failure here must not break the payment write — wrapped
  // in try/catch with console-only logging.
  try {
    const rules = loadActiveRules(db, row.org_id);
    if (rules.length > 0) {
      const op = db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(operationId) as any;
      if (op) applyRulesToOperation(db, op, rules, row.org_id);
    }
  } catch (e: any) {
    console.error('[payment-bridge] auto-rules apply failed (non-fatal):', e.message);
  }

  return { operationId };
}

/**
 * Check if a payment operation already exists for a reservation matching
 * the given source + source_ref. Used by Hostex sync to avoid duplicates.
 */
export function hasPaymentOperation(reservationId: string, source: PaymentSource, sourceRef?: string): boolean {
  const db = getDb();
  if (sourceRef) {
    const row = db.prepare(`
      SELECT id FROM fin_operations
      WHERE reservation_id = ? AND source = ? AND source_ref = ? LIMIT 1
    `).get(reservationId, source, sourceRef);
    return !!row;
  }
  const row = db.prepare(`
    SELECT id FROM fin_operations
    WHERE reservation_id = ? AND source = ? LIMIT 1
  `).get(reservationId, source);
  return !!row;
}

/**
 * Delete all payment operations associated with a reservation.
 * Used by cleanup-ical handler.
 */
export function deletePaymentOperationsForReservation(reservationId: string): number {
  const db = getDb();
  db.prepare('UPDATE bank_transactions SET matched_operation_id = NULL WHERE matched_operation_id IN (SELECT id FROM fin_operations WHERE reservation_id = ?)').run(reservationId);
  const result = db.prepare('DELETE FROM fin_operations WHERE reservation_id = ?').run(reservationId);
  return result.changes;
}
