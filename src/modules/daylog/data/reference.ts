import { getDb } from '@core/db';

// Live finance dictionaries handed to the parser so every day-log entry is
// captured already mapped onto real ids — the same ones fin_operations uses.
// Read from the DB (never hard-coded) so renaming a category in the UI takes
// effect immediately. Cached briefly to avoid re-reading on every message.

export interface RefCategory { id: string; name: string; std_group: string }
export interface RefProject { id: string; name: string; unit_type: string | null }
export interface RefCounterparty { id: string; name: string; aliases: string[] }

export interface DaylogReference {
  incomeCategories: RefCategory[];
  expenseCategories: RefCategory[];
  projects: RefProject[];
  counterparties: RefCounterparty[];
}

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; data: DaylogReference } | null = null;

const REVENUE_GROUPS = new Set(['Revenue']);
const MAX_COUNTERPARTIES = 80;

export function loadReference(): DaylogReference {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const db = getDb();
  const cats = db.prepare(`
    SELECT id, name, std_group FROM expense_categories
    WHERE is_active = 1 ORDER BY sort_order, name
  `).all() as RefCategory[];

  const projects = db.prepare(`
    SELECT id, name, unit_type FROM business_units
    WHERE is_active = 1 ORDER BY sort_order, name
  `).all() as RefProject[];

  const cpRows = db.prepare(`
    SELECT id, name, aliases_json FROM finance_counterparties
    WHERE is_active = 1 ORDER BY sort_order, name LIMIT ?
  `).all(MAX_COUNTERPARTIES) as Array<{ id: string; name: string; aliases_json: string }>;

  const data: DaylogReference = {
    incomeCategories: cats.filter((c) => REVENUE_GROUPS.has(c.std_group)),
    expenseCategories: cats.filter((c) => !REVENUE_GROUPS.has(c.std_group)),
    projects,
    counterparties: cpRows.map((r) => ({
      id: r.id,
      name: r.name,
      aliases: safeAliases(r.aliases_json),
    })),
  };

  cache = { at: Date.now(), data };
  return data;
}

/** Drop the cache — call after dictionaries change if immediacy matters. */
export function clearReferenceCache(): void {
  cache = null;
}

function safeAliases(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Compact, token-cheap rendering of the dictionaries for the LLM prompt. */
export function renderReferenceForPrompt(ref: DaylogReference): string {
  const line = (items: Array<{ id: string; name: string; unit_type?: string | null; aliases?: string[] }>) =>
    items
      .map((i) => {
        const extra = i.aliases?.length ? ` (${i.aliases.slice(0, 4).join(', ')})` : '';
        return `${i.id} = ${i.name}${extra}`;
      })
      .join('\n');

  const parts = [
    'КАТЕГОРІЇ ДОХОДУ (category_id):',
    line(ref.incomeCategories),
    '',
    'КАТЕГОРІЇ ВИТРАТ (category_id):',
    line(ref.expenseCategories),
    '',
    'ПРОЄКТИ / напрямки (project_id):',
    line(ref.projects),
  ];
  if (ref.counterparties.length) {
    parts.push('', 'ВІДОМІ КОНТРАГЕНТИ (counterparty_id):', line(ref.counterparties));
  }
  return parts.join('\n');
}
