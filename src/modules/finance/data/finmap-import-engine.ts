/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Finmap historical data importer.
//
// Reads the Finmap-exported XLSX (16 columns: payment date, accrued date,
// period from/to, amount in account currency, amount in company currency,
// account from, account to, category, subcategory, counterparty,
// subcounterparty, project, subproject, tags, comment) and creates
// fin_operations rows with source='finmap_import'.
//
// Idempotency:
// - source_ref = sha256(date | amount | account_from | account_to |
//   category | comment) — re-running the same file is a no-op
// - Existing operations from other sources (manual, teia, hostex, etc.)
// are NOT touched even if their content matches
//
// Auto-creation of missing entities:
// - Accounts that don't exist by exact name → created (default cash CZK)
// - Categories that don't exist by exact name → created with op_type
//   inferred from the row direction (income/expense)
// - Projects (business_units) → auto-create
// - Counterparties → auto-create
//
// Returns detailed result so the UI can display dry-run preview before
// committing.
//

import * as crypto from 'crypto';
import ExcelJS from 'exceljs';
import { createOperationInTx } from '../api/operations.handlers';

export interface FinmapRow {
  rowIndex: number;          // Excel row number (for error reporting)
  paid_at: string;           // YYYY-MM-DD
  accrued_at: string;        // YYYY-MM-DD
  period_from: string | null;
  period_to: string | null;
  amount_account: number;    // amount in account currency
  amount_company: number;    // amount in company currency (CZK)
  account_from: string;
  account_to: string;
  category: string;
  subcategory: string;
  counterparty: string;
  subcounterparty: string;
  project: string;
  subproject: string;
  tags: string;
  comment: string;
}

export interface ImportResult {
  parsed: number;
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  entities_created: {
    accounts: string[];
    categories: string[];
    projects: string[];
    counterparties: string[];
  };
  per_month: Record<string, number>;
}

/**
 * Excel returns dates as JS Date objects, but only when the cell is
 * formatted as date — otherwise it might be a string. Normalise to
 * 'YYYY-MM-DD'.
 */
function toDateString(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  const s = String(v);
  // Format like "Wed Apr 22 2026 13:23:17 GMT+0..." — let Date.parse handle
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return s.substring(0, 10);
}

function num(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function str(v: any): string {
  return v == null ? '' : String(v).trim();
}

export async function parseFinmapXlsx(buffer: Buffer): Promise<FinmapRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: FinmapRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const paid = toDateString(row.getCell(1).value);
    if (!paid) continue;
    rows.push({
      rowIndex: r,
      paid_at: paid,
      accrued_at: toDateString(row.getCell(2).value) || paid,
      period_from: toDateString(row.getCell(3).value) || null,
      period_to: toDateString(row.getCell(4).value) || null,
      amount_account: num(row.getCell(5).value),
      amount_company: num(row.getCell(6).value),
      account_from: str(row.getCell(7).value),
      account_to: str(row.getCell(8).value),
      category: str(row.getCell(9).value),
      subcategory: str(row.getCell(10).value),
      counterparty: str(row.getCell(11).value),
      subcounterparty: str(row.getCell(12).value),
      project: str(row.getCell(13).value),
      subproject: str(row.getCell(14).value),
      tags: str(row.getCell(15).value),
      comment: str(row.getCell(16).value),
    });
  }
  return rows;
}

function dedupKey(r: FinmapRow): string {
  const parts = [
    r.paid_at,
    r.amount_account.toFixed(2),
    r.account_from || '_',
    r.account_to || '_',
    r.category || '_',
    (r.comment || '').substring(0, 80),
  ];
  return crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').substring(0, 32);
}

function inferOpType(r: FinmapRow): 'income' | 'expense' | 'transfer' {
  const hasFrom = !!r.account_from;
  const hasTo = !!r.account_to;
  if (hasFrom && hasTo) return 'transfer';
  if (hasTo && !hasFrom) return 'income';
  return 'expense';
}

function inferAccountTypeFromName(name: string): 'cash' | 'bank' | 'investment' | 'other' {
  const l = name.toLowerCase();
  if (l.includes('налич') || l.includes('готів') || l.includes('cash')) return 'cash';
  if (l.includes('инвест') || l.includes('інвест') || l.includes('invest')) return 'investment';
  if (l.includes('kb') || l.includes('bank') || l.includes('банк')) return 'bank';
  return 'other';
}

function inferAccountCurrency(name: string): string {
  const l = name.toLowerCase();
  if (l.includes('eur') || l.includes('євро') || l.includes('евро')) return 'EUR';
  return 'CZK';
}

interface MapResult { id: string; created: boolean; }

function getOrCreateAccount(db: any, orgId: string, name: string, created: Set<string>): MapResult {
  const existing = db.prepare(
    "SELECT id FROM finance_accounts WHERE organization_id = ? AND name = ? LIMIT 1"
  ).get(orgId, name) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };

  const id = `acct_finmap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const type = inferAccountTypeFromName(name);
  const currency = inferAccountCurrency(name);
  db.prepare(`
    INSERT INTO finance_accounts (id, organization_id, name, type, currency, color, sort_order)
    VALUES (?, ?, ?, ?, ?, '#94a3b8', 500)
  `).run(id, orgId, name, type, currency);
  created.add(name);
  return { id, created: true };
}

function getOrCreateCategory(
  db: any, orgId: string, name: string, opType: 'income' | 'expense', created: Set<string>,
): MapResult | null {
  if (!name || name === 'Категорії доходу' || name === 'Категорії витрат' || name === 'Переказ') {
    // These are Finmap pseudo-categories — leave op uncategorised
    return null;
  }
  const existing = db.prepare(
    "SELECT id FROM expense_categories WHERE organization_id = ? AND name = ? LIMIT 1"
  ).get(orgId, name) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };

  const id = `ec_finmap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO expense_categories
      (id, organization_id, name, op_type, classifier, std_group, pnl_line, include_in_pnl, include_in_cash, alloc_method, is_capex, icon, color, sort_order, is_active)
    VALUES (?, ?, ?, ?, 'operational', 'OPEX', ?, 1, 1, 'NONE', 0, '📦', '#94a3b8', 500, 1)
  `).run(id, orgId, name, opType, name);
  created.add(name);
  return { id, created: true };
}

function getOrCreateProject(db: any, orgId: string, name: string, created: Set<string>): MapResult | null {
  if (!name || name === 'Списание') return null;
  const existing = db.prepare(
    "SELECT id FROM business_units WHERE organization_id = ? AND name = ? LIMIT 1"
  ).get(orgId, name) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };

  const id = `bu_finmap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO business_units (id, organization_id, name, sort_order, is_active, is_shared)
    VALUES (?, ?, ?, 500, 1, 0)
  `).run(id, orgId, name);
  created.add(name);
  return { id, created: true };
}

function getOrCreateCounterparty(db: any, orgId: string, name: string, created: Set<string>): MapResult | null {
  if (!name) return null;
  const existing = db.prepare(
    "SELECT id FROM finance_counterparties WHERE organization_id = ? AND name = ? LIMIT 1"
  ).get(orgId, name) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };

  const id = `cp_finmap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO finance_counterparties (id, organization_id, name, kind, sort_order, is_active)
    VALUES (?, ?, ?, 'other', 500, 1)
  `).run(id, orgId, name);
  created.add(name);
  return { id, created: true };
}

export function importFinmapRows(
  db: any,
  orgId: string,
  rows: FinmapRow[],
  options: { dryRun?: boolean } = {},
): ImportResult {
  const result: ImportResult = {
    parsed: rows.length,
    created: 0,
    skipped: 0,
    errors: [],
    entities_created: { accounts: [], categories: [], projects: [], counterparties: [] },
    per_month: {},
  };
  const accountsCreated = new Set<string>();
  const categoriesCreated = new Set<string>();
  const projectsCreated = new Set<string>();
  const counterpartiesCreated = new Set<string>();

  const checkExisting = db.prepare(
    "SELECT id FROM fin_operations WHERE organization_id = ? AND source = 'finmap_import' AND source_ref = ? LIMIT 1"
  );

  // Pre-load existing entity names for dry-run preview (no writes)
  const existingAccountNames = new Set<string>(
    (db.prepare("SELECT name FROM finance_accounts WHERE organization_id = ?").all(orgId) as { name: string }[]).map((r) => r.name)
  );
  const existingCategoryNames = new Set<string>(
    (db.prepare("SELECT name FROM expense_categories WHERE organization_id = ?").all(orgId) as { name: string }[]).map((r) => r.name)
  );
  const existingProjectNames = new Set<string>(
    (db.prepare("SELECT name FROM business_units WHERE organization_id = ?").all(orgId) as { name: string }[]).map((r) => r.name)
  );
  const existingCounterpartyNames = new Set<string>(
    (db.prepare("SELECT name FROM finance_counterparties WHERE organization_id = ?").all(orgId) as { name: string }[]).map((r) => r.name)
  );

  // Dry-run path: count what WOULD be created without touching the DB
  if (options.dryRun) {
    for (const r of rows) {
      const key = dedupKey(r);
      if (checkExisting.get(orgId, key)) { result.skipped++; continue; }
      result.created++;
      const m = r.paid_at.substring(0, 7);
      result.per_month[m] = (result.per_month[m] || 0) + 1;

      if (r.account_from && !existingAccountNames.has(r.account_from)) accountsCreated.add(r.account_from);
      if (r.account_to && !existingAccountNames.has(r.account_to)) accountsCreated.add(r.account_to);
      if (r.category && !['Категорії доходу', 'Категорії витрат', 'Переказ'].includes(r.category) && !existingCategoryNames.has(r.category)) categoriesCreated.add(r.category);
      if (r.project && r.project !== 'Списание' && !existingProjectNames.has(r.project)) projectsCreated.add(r.project);
      if (r.counterparty && !existingCounterpartyNames.has(r.counterparty)) counterpartiesCreated.add(r.counterparty);
    }
    result.entities_created.accounts = [...accountsCreated];
    result.entities_created.categories = [...categoriesCreated];
    result.entities_created.projects = [...projectsCreated];
    result.entities_created.counterparties = [...counterpartiesCreated];
    return result;
  }

  // Real import: wrap in a single transaction
  const tx = db.transaction(() => {
    for (const r of rows) {
      try {
        const key = dedupKey(r);
        if (checkExisting.get(orgId, key)) { result.skipped++; continue; }

        const opType = inferOpType(r);

        const accountFromId = r.account_from
          ? getOrCreateAccount(db, orgId, r.account_from, accountsCreated).id
          : null;
        const accountToId = r.account_to
          ? getOrCreateAccount(db, orgId, r.account_to, accountsCreated).id
          : null;
        const category = getOrCreateCategory(db, orgId, r.category, opType === 'income' ? 'income' : 'expense', categoriesCreated);
        const project = getOrCreateProject(db, orgId, r.project, projectsCreated);
        const counterparty = getOrCreateCounterparty(db, orgId, r.counterparty, counterpartiesCreated);

        let currency = 'CZK';
        if (accountToId) {
          const a = db.prepare("SELECT currency FROM finance_accounts WHERE id = ?").get(accountToId) as { currency: string };
          currency = a.currency;
        } else if (accountFromId) {
          const a = db.prepare("SELECT currency FROM finance_accounts WHERE id = ?").get(accountFromId) as { currency: string };
          currency = a.currency;
        }

        const commentParts: string[] = [];
        if (r.comment) commentParts.push(r.comment);
        if (r.subcategory) commentParts.push(`[${r.subcategory}]`);
        if (r.tags) commentParts.push(`#${r.tags}`);
        if (r.subcounterparty) commentParts.push(`(${r.subcounterparty})`);

        createOperationInTx(db, orgId, {
          op_type: opType,
          account_from_id: accountFromId,
          account_to_id: accountToId,
          amount: Math.abs(r.amount_account),
          currency,
          paid_at: r.paid_at,
          accrued_at: r.accrued_at,
          category_id: category?.id || null,
          project_id: project?.id || null,
          counterparty_id: counterparty?.id || null,
          comment: commentParts.join(' ') || null,
          source: 'finmap_import',
          source_ref: key,
          status: 'completed',
        });
        result.created++;

        const m = r.paid_at.substring(0, 7);
        result.per_month[m] = (result.per_month[m] || 0) + 1;
      } catch (e: any) {
        result.errors.push({ row: r.rowIndex, message: e.message });
      }
    }
  });
  tx();

  result.entities_created.accounts = [...accountsCreated];
  result.entities_created.categories = [...categoriesCreated];
  result.entities_created.projects = [...projectsCreated];
  result.entities_created.counterparties = [...counterpartiesCreated];
  return result;
}
