import { getDb } from '@core/db';

// Evening cross-check across EVERY channel money can enter the system, so the
// operator can see in one place what each source recorded and where they
// disagree:
//   • the Telegram day-log (Andrey)
//   • reservation payments (fin_operations carrying a reservation_id)
//   • the bot working in other groups (source telegram_*)
//   • Teya (terminal, pay-by-link, webhook, CSV)
//   • bank import / manual entries / everything else
//   • the calendar itself — arrivals today and bookings created today
//
// Note: reservation payments live in fin_operations (createPaymentOperation
// replaced the legacy `payments` table), so fin_operations is the source of
// truth here; `payments` is still summed separately in case an old flow writes
// it, and would otherwise be invisible.
//
// Read-only: this never writes anything.

export interface ArrivalRow {
  id: string;
  guest: string;
  unit: string;
  total_price: number;
  currency: string;
  payment_status: string;
  status: string;
}

export interface SourceTotals {
  label: string;
  income: number;
  expense: number;
  count: number;
}

export interface DayReconcile {
  date: string;
  daylog: { income: number; expense: number; card: number; cash: number; count: number };
  sources: SourceTotals[];       // per-channel breakdown, PMS side
  pmsIncome: number;             // all PMS-recorded income for the day (CZK)
  pmsCard: number;
  pmsCash: number;
  legacyPayments: number;        // old `payments` table, if anything still lands there
  bookings: {
    arrivalsToday: number;
    paid: number;
    unpaid: number;
    unpaidList: ArrivalRow[];
    expectedUnpaidTotal: number;
    createdToday: number;
  };
  loggedLodging: number;
  issues: string[];
}

const LODGING_PROJECTS = ['bu_camping', 'bu_budova_fd', 'bu_glamping'];

const SOURCE_GROUPS: Array<{ label: string; test: string; params: string[] }> = [
  {
    label: 'Бот (інші групи)',
    test: "source IN ('telegram_sauna','telegram_cash','telegram_income','telegram_expense','telegram_transfer','telegram_service')",
    params: [],
  },
  {
    label: 'Teya (термінал/лінк)',
    test: "source IN ('teia','teya','teya_webhook','teya_sync','teya_csv','pms_paylink')",
    params: [],
  },
  {
    label: 'Онлайн (сайт/віджет)',
    test: "source IN ('guest_page','guest_cart','booking_widget','widget','widget_service','website','web_form')",
    params: [],
  },
  {
    label: 'OTA (Airbnb/Booking)',
    test: "source IN ('airbnb','booking_com','vrbo','ota_import')",
    params: [],
  },
  {
    label: 'Банк / ручні',
    test: "source IN ('bank_import','manual','statement','wizard_import','recurring')",
    params: [],
  },
];

export function reconcileDay(date: string): DayReconcile {
  const db = getDb();

  // ── Day-log side ────────────────────────────────────────────────────────
  const daylog = {
    income: sumDaylog(db, date, 'income'),
    expense: sumDaylog(db, date, 'expense'),
    card: sumDaylogByMethod(db, date, 'card'),
    cash: sumDaylogByMethod(db, date, 'cash'),
    count: countDaylog(db, date),
  };
  const loggedLodging = countLodgingEntries(db, date);

  // ── PMS side, per channel ───────────────────────────────────────────────
  const sources: SourceTotals[] = [];

  // Reservation payments first — these are the ones that must line up with
  // arrivals, regardless of which integration recorded them.
  sources.push(opsTotals(db, date, 'Оплати броней', 'reservation_id IS NOT NULL', []));
  for (const g of SOURCE_GROUPS) {
    const t = opsTotals(db, date, g.label, `reservation_id IS NULL AND ${g.test}`, g.params);
    if (t.count) sources.push(t);
  }

  const pmsIncome = sumOps(db, date, 'income');
  const pmsCard = sumOpsByMethod(db, date, ['card', 'online']);
  const pmsCash = sumOpsByMethod(db, date, ['cash']);
  const legacyPayments = sumLegacyPayments(db, date);

  // ── Calendar ────────────────────────────────────────────────────────────
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

  const createdToday = (db.prepare(`
    SELECT COUNT(*) AS n FROM reservations
    WHERE date(created_at) = date(?) AND status NOT IN ('cancelled', 'draft')
  `).get(date) as { n: number })?.n || 0;

  // ── What does not add up ────────────────────────────────────────────────
  const issues: string[] = [];
  const totalDiff = round2(daylog.income - pmsIncome);

  if (Math.abs(totalDiff) >= 1) {
    issues.push(
      totalDiff > 0
        ? `Журнал показує ${fmt(daylog.income)} CZK доходу, а в PMS проведено ${fmt(pmsIncome)} CZK — ${fmt(totalDiff)} CZK ніде не зафіксовано.`
        : `У PMS проведено ${fmt(pmsIncome)} CZK, а в журналі лише ${fmt(daylog.income)} CZK — ${fmt(-totalDiff)} CZK Андрій не записав.`,
    );
  }

  const cardDiff = round2(daylog.card - pmsCard);
  if (Math.abs(cardDiff) >= 1) {
    issues.push(`Карта: журнал ${fmt(daylog.card)} CZK проти PMS ${fmt(pmsCard)} CZK — різниця ${fmt(Math.abs(cardDiff))} CZK.`);
  }

  const cashDiff = round2(daylog.cash - pmsCash);
  if (Math.abs(cashDiff) >= 1 && (pmsCash > 0 || daylog.cash > 0)) {
    issues.push(`Готівка: журнал ${fmt(daylog.cash)} CZK проти PMS ${fmt(pmsCash)} CZK — різниця ${fmt(Math.abs(cashDiff))} CZK.`);
  }

  if (unpaidList.length) {
    const names = unpaidList
      .map((a) => `${a.guest || 'без імені'}${a.unit ? ` (${a.unit})` : ''}`)
      .slice(0, 10)
      .join(', ');
    issues.push(`Заїзди без оплати: ${unpaidList.length} — ${names}.`);
  }

  if (arrivals.length && loggedLodging < arrivals.length) {
    issues.push(`Заїздів у календарі ${arrivals.length}, а в журналі записів про проживання ${loggedLodging} — схоже, ${arrivals.length - loggedLodging} не внесено.`);
  }

  if (!arrivals.length && loggedLodging > 0) {
    issues.push(`У журналі ${loggedLodging} записів про проживання, але заїздів у календарі сьогодні немає — перевір, чи заведено бронь.`);
  }

  const bot = sources.find((s) => s.label === 'Бот (інші групи)');
  if (bot && bot.income > 0 && daylog.income === 0) {
    issues.push(`Бот записав ${fmt(bot.income)} CZK з інших груп, а в журналі Андрія за сьогодні порожньо.`);
  }

  if (legacyPayments > 0) {
    issues.push(`У старій таблиці payments ${fmt(legacyPayments)} CZK — ці гроші можуть не потрапляти у звіти.`);
  }

  return {
    date,
    daylog,
    sources,
    pmsIncome,
    pmsCard,
    pmsCash,
    legacyPayments,
    bookings: {
      arrivalsToday: arrivals.length,
      paid: paidArrivals.length,
      unpaid: unpaidList.length,
      unpaidList,
      expectedUnpaidTotal: round2(unpaidList.reduce((t, a) => t + (a.total_price || 0), 0)),
      createdToday,
    },
    loggedLodging,
    issues,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────

function opsTotals(db: any, date: string, label: string, where: string, params: string[]): SourceTotals {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN op_type = 'income'  THEN amount END), 0) AS income,
      COALESCE(SUM(CASE WHEN op_type = 'expense' THEN amount END), 0) AS expense,
      COUNT(*) AS count
    FROM fin_operations
    WHERE date(paid_at) = date(?)
      AND status = 'completed'
      AND COALESCE(currency, 'CZK') = 'CZK'
      AND ${where}
  `).get(date, ...params) as { income: number; expense: number; count: number };
  return { label, income: round2(row?.income || 0), expense: round2(row?.expense || 0), count: row?.count || 0 };
}

function sumOps(db: any, date: string, opType: 'income' | 'expense'): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM fin_operations
    WHERE date(paid_at) = date(?) AND status = 'completed'
      AND op_type = ? AND COALESCE(currency, 'CZK') = 'CZK'
  `).get(date, opType) as { total: number };
  return round2(row?.total || 0);
}

function sumOpsByMethod(db: any, date: string, methods: string[]): number {
  const ph = methods.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM fin_operations
    WHERE date(paid_at) = date(?) AND status = 'completed'
      AND op_type = 'income' AND method IN (${ph})
      AND COALESCE(currency, 'CZK') = 'CZK'
  `).get(date, ...methods) as { total: number };
  return round2(row?.total || 0);
}

function sumLegacyPayments(db: any, date: string): number {
  try {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments
      WHERE date(COALESCE(paid_at, created_at)) = date(?)
        AND status = 'completed' AND COALESCE(currency, 'CZK') = 'CZK'
    `).get(date) as { total: number };
    return round2(row?.total || 0);
  } catch {
    return 0; // legacy table may be gone — not an error
  }
}

function sumDaylog(db: any, date: string, direction: 'income' | 'expense'): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM daylog_entries
    WHERE entry_date = ? AND direction = ? AND COALESCE(currency, 'CZK') = 'CZK'
  `).get(date, direction) as { total: number };
  return round2(row?.total || 0);
}

function sumDaylogByMethod(db: any, date: string, method: 'card' | 'cash'): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM daylog_entries
    WHERE entry_date = ? AND direction = 'income' AND payment_method = ?
      AND COALESCE(currency, 'CZK') = 'CZK'
  `).get(date, method) as { total: number };
  return round2(row?.total || 0);
}

function countDaylog(db: any, date: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM daylog_entries WHERE entry_date = ?').get(date) as { n: number };
  return row?.n || 0;
}

function countLodgingEntries(db: any, date: string): number {
  const ph = LODGING_PROJECTS.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM daylog_entries
    WHERE entry_date = ?
      AND direction = 'income'
      AND (project_id IN (${ph}) OR category_id = 'ec_accommodation')
  `).get(date, ...LODGING_PROJECTS) as { n: number };
  return row?.n || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('uk-UA');
}
