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
