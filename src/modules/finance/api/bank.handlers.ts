/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createOperationInTx, recalcReservationPaymentStatus } from './operations.handlers';
import { loadActiveRules, applyRulesToOperation } from '../data/auto-rules-engine';

export async function listBankStatements(): Promise<NextResponse> {
  try {
    const db = getDb();
    return NextResponse.json(db.prepare(`SELECT * FROM bank_statements ORDER BY uploaded_at DESC`).all());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function listBankTransactions(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const statement_id = searchParams.get('statement_id');
    const match_status = searchParams.get('match_status');

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (statement_id) { where += ' AND bt.statement_id = ?'; params.push(statement_id); }
    if (match_status) { where += ' AND bt.match_status = ?'; params.push(match_status); }

    const transactions = db.prepare(`
      SELECT bt.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color,
             bu.name as bu_name,
             fo.op_type as matched_op_type, fo.amount as matched_op_amount
      FROM bank_transactions bt
      LEFT JOIN expense_categories ec ON bt.matched_category_id = ec.id
      LEFT JOIN business_units bu ON bt.matched_business_unit_id = bu.id
      LEFT JOIN fin_operations fo ON bt.matched_operation_id = fo.id
      ${where} ORDER BY bt.transaction_date DESC
    `).all(...params);

    return NextResponse.json(transactions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateBankTransaction(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { id, matched_category_id, matched_business_unit_id, match_status, create_expense } = body;

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const tx = db.prepare("SELECT * FROM bank_transactions WHERE id = ?").get(id) as any;
    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.prepare(`
      UPDATE bank_transactions SET
        matched_category_id = COALESCE(?, matched_category_id),
        matched_business_unit_id = ?, match_status = COALESCE(?, match_status)
      WHERE id = ?
    `).run(matched_category_id, matched_business_unit_id ?? null, match_status, id);

    if (create_expense && matched_category_id && (match_status === 'confirmed' || match_status === 'manual')) {
      const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
      // Negative amount → expense (money out), positive → income
      const opType: 'expense' | 'income' = tx.amount < 0 ? 'expense' : 'income';

      // Resolve the bank account: statement account_number ↔ finance_accounts.iban,
      // else first active bank account (flagged for review).
      const stmtRow = db.prepare(
        "SELECT account_number FROM bank_statements WHERE id = ?"
      ).get(tx.statement_id) as { account_number: string | null } | undefined;
      const acctNum = (stmtRow?.account_number || '').replace(/[\s\-/]/g, '').toUpperCase();
      let accountId: string | null = null;
      if (acctNum) {
        const byIban = db.prepare(`
          SELECT id FROM finance_accounts
          WHERE organization_id = ? AND is_active = 1 AND iban IS NOT NULL
            AND REPLACE(REPLACE(REPLACE(UPPER(iban), ' ', ''), '-', ''), '/', '') LIKE '%' || ? || '%'
        `).get(orgRow.id, acctNum) as { id: string } | undefined;
        accountId = byIban?.id || null;
      }
      const usedFallback = !accountId;
      if (!accountId) {
        const fallback = db.prepare(`
          SELECT id FROM finance_accounts
          WHERE organization_id = ? AND is_active = 1 AND type = 'bank' AND currency = 'CZK'
          ORDER BY sort_order LIMIT 1
        `).get(orgRow.id) as { id: string } | undefined;
        accountId = fallback?.id || null;
      }
      if (!accountId) {
        return NextResponse.json(
          { error: 'Не знайдено банківського рахунку для операції. Створіть рахунок типу «банк».' },
          { status: 400 },
        );
      }

      const operationId = createOperationInTx(db, orgRow.id, {
        op_type: opType,
        account_from_id: opType === 'expense' ? accountId : null,
        account_to_id: opType === 'income' ? accountId : null,
        amount: Math.abs(tx.amount),
        currency: 'CZK',
        paid_at: tx.transaction_date,
        category_id: matched_category_id,
        project_id: matched_business_unit_id || null,
        comment: `${tx.description || 'Bank import'}${tx.reference ? ' — ref ' + tx.reference : ''}`,
        method: 'bank_transfer',
        source: 'bank_import',
        source_ref: tx.id,
        needs_review: usedFallback ? 1 : 0,
      });

      db.prepare("UPDATE bank_transactions SET matched_operation_id = ? WHERE id = ?").run(operationId, id);
      db.prepare(`
        UPDATE bank_statements SET matched_transactions = (
          SELECT COUNT(*) FROM bank_transactions WHERE statement_id = ? AND match_status IN ('confirmed', 'manual', 'auto_matched')
        ) WHERE id = ?
      `).run(tx.statement_id, tx.statement_id);

      // Apply auto-rules to the newly-created operation (auto-categorize, auto-match counterparty)
      const activeRules = loadActiveRules(db, orgRow.id);
      if (activeRules.length > 0) {
        const newOp = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(operationId) as any;
        if (newOp) applyRulesToOperation(db, newOp, activeRules, orgRow.id);
      }
    }

    const updated = db.prepare(`
      SELECT bt.*, ec.name as category_name, ec.icon as category_icon, bu.name as bu_name
      FROM bank_transactions bt
      LEFT JOIN expense_categories ec ON bt.matched_category_id = ec.id
      LEFT JOIN business_units bu ON bt.matched_business_unit_id = bu.id
      WHERE bt.id = ?
    `).get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function importBankStatement(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { file_name, bank_name, account_number, rows } = body;

    if (!file_name || !rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Missing file_name or rows array' }, { status: 400 });
    }

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const stmtId = `stmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dates = rows.map((r: any) => r.date).filter(Boolean).sort();

    db.prepare(`
      INSERT INTO bank_statements (id, organization_id, file_name, bank_name, account_number, period_from, period_to, total_transactions, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing')
    `).run(stmtId, orgRow.id, file_name, bank_name || null, account_number || null, dates[0] || '', dates[dates.length - 1] || '', rows.length);

    const insTx = db.prepare(`
      INSERT INTO bank_transactions (id, statement_id, organization_id, transaction_date, amount, counterparty, description, reference, matched_category_id, matched_operation_id, match_status, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const patterns: [string[], string][] = [
      [['оренд', 'rent', 'najem'], 'ec_rent'],
      [['комунал', 'utilit', 'elektr', 'voda', 'plyn', 'газ', 'вода', 'електр'], 'ec_utilities'],
      [['зарплат', 'payroll', 'mzda', 'plat'], 'ec_payroll'],
      [['маркет', 'reklam', 'google', 'facebook', 'instagram'], 'ec_marketing'],
      [['харч', 'food', 'restaur', 'ресторан', 'jidlo'], 'ec_food'],
      [['продукт', 'potraviny', 'makro', 'tesco'], 'ec_products'],
      [['подат', 'dan', 'tax'], 'ec_taxes'],
      [['строй', 'stavba', 'construc', 'будів'], 'ec_capex'],
      [['інвест', 'invest'], 'ec_investors'],
      [['переказ', 'prevod', 'transfer'], 'ec_transfer'],
    ];

    let matched = 0;

    const insertMany = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const txId = `btx_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 4)}`;

        let matchedCategoryId: string | null = null;
        let matchStatus = 'unmatched';
        let confidence = 0;
        const desc = ((row.description || '') + ' ' + (row.counterparty || '')).toLowerCase();

        for (const [keywords, catId] of patterns) {
          if (keywords.some(kw => desc.includes(kw))) {
            matchedCategoryId = catId; matchStatus = 'auto_matched'; confidence = 0.7; matched++; break;
          }
        }

        // Try to match against pending income operations (replaces old pending payments matching)
        let matchedOperationId: string | null = null;
        if (row.amount > 0) {
          if (row.reference) {
            const ref = row.reference.trim();
            const opByRef = db.prepare(`
              SELECT o.id FROM fin_operations o
              WHERE o.op_type = 'income' AND o.status = 'pending'
                AND (o.source_ref LIKE ? OR o.id LIKE ?) LIMIT 1
            `).get(`%${ref}%`, `%${ref}%`) as any;
            if (opByRef) { matchedOperationId = opByRef.id; matchStatus = 'matched_payment'; confidence = 0.9; matched++; }
          }
          if (!matchedOperationId) {
            const opByAmount = db.prepare(`
              SELECT o.id, o.reservation_id FROM fin_operations o
              WHERE o.op_type = 'income' AND o.status = 'pending' AND ABS(o.amount - ?) < 0.01
                AND o.id NOT IN (SELECT COALESCE(matched_operation_id, '') FROM bank_transactions WHERE matched_operation_id IS NOT NULL)
              ORDER BY ABS(julianday(COALESCE(o.paid_at, datetime('now'))) - julianday(?)) LIMIT 1
            `).get(row.amount, row.date) as any;
            if (opByAmount) { matchedOperationId = opByAmount.id; matchStatus = 'matched_payment'; confidence = 0.6; matched++; }
          }
          if (matchedOperationId) {
            db.prepare("UPDATE fin_operations SET status = 'completed', paid_at = COALESCE(paid_at, ?) WHERE id = ?").run(row.date, matchedOperationId);
            const op = db.prepare("SELECT reservation_id FROM fin_operations WHERE id = ?").get(matchedOperationId) as any;
            if (op?.reservation_id) recalcReservationPaymentStatus(db, op.reservation_id);
          }
        }

        insTx.run(txId, stmtId, orgRow.id, row.date, row.amount, row.counterparty || null, row.description || null, row.reference || null, matchedCategoryId, matchedOperationId, matchStatus, confidence);
      }
    });

    insertMany();
    db.prepare("UPDATE bank_statements SET matched_transactions = ?, status = 'done' WHERE id = ?").run(matched, stmtId);

    return NextResponse.json({
      statement: db.prepare("SELECT * FROM bank_statements WHERE id = ?").get(stmtId),
      totalRows: rows.length, autoMatched: matched, unmatched: rows.length - matched,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
