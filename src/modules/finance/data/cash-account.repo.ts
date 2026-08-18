/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Whose till does this cash belong in?
 *
 * Three flows take cash and each answered that question differently. The widget
 * asks for a PIN and reads the person's default account — correct. The finance
 * bridge matches `recorded_by` against app_users.full_name with LIKE — which
 * cannot work here: Telegram sends "Oleg Stepeniev" and "Andrii Bukovetskyi",
 * while the accounts are held by "Admin ALiSiO" and "Andrey". Neither name
 * matches, so every bot operation fell through to the same last resort:
 *
 *     ORDER BY sort_order ASC LIMIT 1
 *
 * which is "Андріїв cash" for CZK. Andriy's own entries looked right by
 * coincidence; everyone else's money landed in his till. The ledger has the
 * proof — 550 CZK "Внесено: Oleg Stepeniev" sitting in Андріїв cash.
 *
 * Telegram already knows who pressed the button, and app_users.telegram_chat_id
 * is populated for the people who use the bot. That is the identity to route on:
 * exact, no guessing, and no PIN to type at the counter.
 */
import { getDb } from '@core/db';

export interface ResolvedCashAccount {
  userId: string | null;
  userName: string | null;
  accountId: string | null;
  accountName: string | null;
  /** How the person was identified. null = not identified at all. */
  matchedBy: 'telegram' | 'name' | null;
  /**
   * True when the account is NOT the person's own — either they are unknown, or
   * they have none set for this currency. The caller should flag the operation
   * for review rather than pretend it is filed correctly.
   */
  fellBack: boolean;
}

export function resolveCashAccount(
  db: any,
  organizationId: string,
  currency: string,
  who: { telegramUserId?: string | number | null; recordedBy?: string | null },
): ResolvedCashAccount {
  const cur = String(currency || 'CZK').toUpperCase();
  const out: ResolvedCashAccount = {
    userId: null, userName: null, accountId: null, accountName: null,
    matchedBy: null, fellBack: true,
  };

  let user: any;
  const tg = who.telegramUserId != null ? String(who.telegramUserId).trim() : '';
  if (tg) {
    user = db.prepare(`
      SELECT id, full_name, default_cash_account_id, default_cash_account_eur_id
      FROM app_users
      WHERE organization_id = ? AND is_active = 1 AND telegram_chat_id = ?
      LIMIT 1
    `).get(organizationId, tg);
    if (user) out.matchedBy = 'telegram';
  }
  // Name matching stays as a second chance for callers that predate the
  // telegram id being sent. It is unreliable — see the header — so it never
  // runs first.
  if (!user && who.recordedBy && who.recordedBy.trim()) {
    user = db.prepare(`
      SELECT id, full_name, default_cash_account_id, default_cash_account_eur_id
      FROM app_users
      WHERE organization_id = ? AND is_active = 1 AND full_name LIKE ?
      LIMIT 1
    `).get(organizationId, `%${who.recordedBy.trim()}%`);
    if (user) out.matchedBy = 'name';
  }

  if (user) {
    out.userId = user.id;
    out.userName = user.full_name;
    const wanted = cur === 'EUR' ? user.default_cash_account_eur_id : user.default_cash_account_id;
    if (wanted) {
      // The currency is checked, not assumed: a CZK till holding a EUR payment
      // is the same class of error as the wrong person's till.
      const acct = db.prepare(`
        SELECT id, name FROM finance_accounts
        WHERE id = ? AND is_active = 1 AND currency = ?
      `).get(wanted, cur) as { id: string; name: string } | undefined;
      if (acct) {
        out.accountId = acct.id;
        out.accountName = acct.name;
        out.fellBack = false;
        return out;
      }
    }
  }

  const fallback = db.prepare(`
    SELECT id, name FROM finance_accounts
    WHERE organization_id = ? AND currency = ? AND is_active = 1
      AND type IN ('cash', 'bank')
    ORDER BY (type = 'cash') DESC, sort_order ASC, created_at ASC
    LIMIT 1
  `).get(organizationId, cur) as { id: string; name: string } | undefined;
  out.accountId = fallback?.id || null;
  out.accountName = fallback?.name || null;
  return out;
}
