import { getDb } from '@core/db';

// Evening cross-check: what Andrey logged in Telegram vs what PMS actually
// holds. Two questions the operator asks every night:
//   1. Do the card takings match the payments recorded in PMS?
//   2. Does every arrival today have money against it — and did Andrey log them
//      all (someone unpaid, or someone simply forgotten)?
// Read-only: this never writes anything, it only reports mismatches.

export interface ArrivalRow {
  id: string;
  guest: string;
  unit: string;
  total_price: number;
  currency: string;
  payment_status: string;
  status: string;
}

export interface DayReconcile {
  date: string;
  card: { daylog: number; pms: number; diff: number };
  cash: { daylog: number; pms: number; diff: number };
  arrivals: {
    total: number;
    paid: number;
    unpaid: number;
    unpaidList: ArrivalRow[];
    expectedUnpaidTotal: number;
  };
  loggedLodging: number;   // day-log entries that look like accommodation income
  issues: string[];        // plain-language list of what does not add up
}

const CARD_METHODS = ['card', 'online'];
const LODGING_PROJECTS = ['bu_camping', 'bu_budova_fd', 'bu_glamping'];

export function reconcileDay(date: string): DayReconcile {
  const db = getDb();

  // ── PMS side ────────────────────────────────────────────────────────────
  const pmsCard = sumPayments(db, date, CARD_METHODS);
  const pmsCash = sumPayments(db, date, ['cash']);

  const arrivals = db.prepare(`
    SELECT r.id,
           TRIM(COALESCE(g.first_name, '') || ' ' || COALESCE(g.last_name, '')) AS guest,
           COALESCE(u.name, '') AS unit,
           r.total_price, r.currency, r.payment_status, r.status
    FROM reservations r
    LEFT JOIN guests g ON g.id = r.guest_id
    LEFT JOIN units  u ON u.id = r.unit_id
    WHERE date(r.check_in) = date(?)
      AND r.status NOT IN ('cancelled', 'no_show', 'draft')
    ORDER BY u.name
  `).all(date) as ArrivalRow[];

  const paidArrivals = arrivals.filter((a) => a.payment_status === 'paid' || a.payment_status === 'prepaid');
  const unpaidList = arrivals.filter((a) => a.payment_status !== 'paid' && a.payment_status !== 'prepaid');

  // ── Day-log side ────────────────────────────────────────────────────────
  // Income only: `payments` records money coming in, so comparing against the
  // net cash/card balance would let a card purchase silently cancel out takings.
  const dlCard = sumLoggedIncome(db, date, 'card');
  const dlCash = sumLoggedIncome(db, date, 'cash');

  const loggedLodging = countLodgingEntries(db, date);

  // ── Differences ─────────────────────────────────────────────────────────
  const cardDiff = round2(dlCard - pmsCard);
  const cashDiff = round2(dlCash - pmsCash);

  const issues: string[] = [];

  if (Math.abs(cardDiff) >= 1) {
    issues.push(
      cardDiff > 0
        ? `Карта: у журналі на ${fmt(cardDiff)} CZK більше, ніж проведено в PMS (${fmt(dlCard)} проти ${fmt(pmsCard)}). Схоже, оплату не зафіксовано в системі.`
        : `Карта: у PMS на ${fmt(-cardDiff)} CZK більше, ніж у журналі (${fmt(pmsCard)} проти ${fmt(dlCard)}). Андрій міг не записати оплату.`,
    );
  }

  if (Math.abs(cashDiff) >= 1 && pmsCash > 0) {
    issues.push(
      `Готівка: журнал ${fmt(dlCash)} CZK, PMS ${fmt(pmsCash)} CZK — розбіжність ${fmt(Math.abs(cashDiff))} CZK.`,
    );
  }

  if (unpaidList.length) {
    const names = unpaidList
      .map((a) => `${a.guest || 'без імені'}${a.unit ? ` (${a.unit})` : ''}`)
      .slice(0, 10)
      .join(', ');
    issues.push(`Заїзди без оплати: ${unpaidList.length} — ${names}.`);
  }

  if (arrivals.length && loggedLodging < arrivals.length) {
    issues.push(
      `Заїздів у PMS ${arrivals.length}, а в журналі записів про проживання ${loggedLodging} — схоже, ${arrivals.length - loggedLodging} не внесено.`,
    );
  }

  if (!arrivals.length && loggedLodging > 0) {
    issues.push(`У журналі ${loggedLodging} записів про проживання, але в PMS сьогодні заїздів немає — перевір, чи бронь заведена.`);
  }

  return {
    date,
    card: { daylog: dlCard, pms: pmsCard, diff: cardDiff },
    cash: { daylog: dlCash, pms: pmsCash, diff: cashDiff },
    arrivals: {
      total: arrivals.length,
      paid: paidArrivals.length,
      unpaid: unpaidList.length,
      unpaidList,
      expectedUnpaidTotal: round2(unpaidList.reduce((t, a) => t + (a.total_price || 0), 0)),
    },
    loggedLodging,
    issues,
  };
}

function sumPayments(db: any, date: string, methods: string[]): number {
  const placeholders = methods.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE date(COALESCE(paid_at, created_at)) = date(?)
      AND status = 'completed'
      AND method IN (${placeholders})
      AND COALESCE(currency, 'CZK') = 'CZK'
  `).get(date, ...methods) as { total: number };
  return round2(row?.total || 0);
}

function sumLoggedIncome(db: any, date: string, method: 'card' | 'cash'): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM daylog_entries
    WHERE entry_date = ?
      AND direction = 'income'
      AND payment_method = ?
      AND COALESCE(currency, 'CZK') = 'CZK'
  `).get(date, method) as { total: number };
  return round2(row?.total || 0);
}

function countLodgingEntries(db: any, date: string): number {
  const placeholders = LODGING_PROJECTS.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM daylog_entries
    WHERE entry_date = ?
      AND direction = 'income'
      AND (project_id IN (${placeholders}) OR category_id = 'ec_accommodation')
  `).get(date, ...LODGING_PROJECTS) as { n: number };
  return row?.n || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('uk-UA');
}
