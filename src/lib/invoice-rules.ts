/**
 * ALiSiO PMS — shared invoice presentation rules.
 */

/**
 * Below this CZK amount the buyer (Odběratel) is left anonymous, matching the
 * Czech "zjednodušený daňový doklad" convention. At or above it, the buyer name
 * is mandatory. An explicitly requested company/custom buyer is always shown,
 * regardless of amount.
 */
export const BUYER_NAME_THRESHOLD_CZK = 9900;

/**
 * Whether a buyer name must appear on the document.
 * @param amountCzk  payable amount already converted to CZK
 * @param hasExplicitBuyer  true when a company/custom buyer was explicitly requested
 */
export function showBuyerName(amountCzk: number, hasExplicitBuyer: boolean): boolean {
  if (hasExplicitBuyer) return true;
  return Math.abs(amountCzk) >= BUYER_NAME_THRESHOLD_CZK;
}

/** Standard payment term: due date and tax point (DUZP) = issue date + 14 days. */
export const INVOICE_DUE_DAYS = 14;

/** Add n days to a YYYY-MM-DD date; returns YYYY-MM-DD (input echoed if unparseable). */
export function addDaysIso(iso: string, n: number): string {
  const base = (iso || '').slice(0, 10);
  const d = new Date(`${base}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** DUZP + splatnost date for an invoice = issue date + 14 days. */
export function dueDateFor(issueDateIso: string): string {
  return addDaysIso(issueDateIso, INVOICE_DUE_DAYS);
}
