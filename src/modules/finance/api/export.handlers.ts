/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  buildXlsx, buildPdf, exportFilename, attachmentResponse, fmtMoney,
  type XlsxColumn, type XlsxSheet, type PdfTable,
} from '../data/export-utils';
import { getCashflowMatrix, getPnlMatrix, getAccountStatement } from './reports.handlers';
import { listOperations } from './operations.handlers';

function getFormat(req: NextRequest): 'xlsx' | 'pdf' {
  const f = req.nextUrl.searchParams.get('format');
  return f === 'pdf' ? 'pdf' : 'xlsx';
}

async function callJson<T>(handler: (req: NextRequest) => Promise<NextResponse>, originalReq: NextRequest): Promise<T> {
  const fakeUrl = new URL(originalReq.nextUrl.toString());
  // Strip 'format' so downstream handlers don't choke on it
  fakeUrl.searchParams.delete('format');
  const fakeReq = new NextRequest(fakeUrl.toString());
  const res = await handler(fakeReq);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as any).error || `Upstream handler failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function errorResponse(error: any): Response {
  return NextResponse.json({ error: error?.message || 'Export failed' }, { status: 500 });
}

// ────────────────────────────────────────────────────────────
// Operations export
// ────────────────────────────────────────────────────────────

export async function exportOperations(request: NextRequest): Promise<Response> {
  try {
    const format = getFormat(request);

    // Force pageSize=10000 for export (max allowed by listOperations)
    const fakeUrl = new URL(request.nextUrl.toString());
    fakeUrl.searchParams.delete('format');
    fakeUrl.searchParams.set('pageSize', '10000');
    fakeUrl.searchParams.set('page', '1');
    const fakeReq = new NextRequest(fakeUrl.toString());

    const res = await listOperations(fakeReq);
    if (!res.ok) throw new Error(`listOperations failed (${res.status})`);
    const body = await res.json();
    const items: any[] = body.items || [];

    const from = request.nextUrl.searchParams.get('from') || '';
    const to = request.nextUrl.searchParams.get('to') || '';
    const range = from && to ? `${from}_${to}` : '';

    const totalIncome = items.filter((o) => o.op_type === 'income').reduce((s, o) => s + o.amount, 0);
    const totalExpense = items.filter((o) => o.op_type === 'expense').reduce((s, o) => s + o.amount, 0);

    if (format === 'xlsx') {
      const columns: XlsxColumn[] = [
        { header: 'Дата', key: 'date', width: 12 },
        { header: 'Тип', key: 'type', width: 10 },
        { header: 'Сума', key: 'amount', width: 14, numFmt: '#,##0.00', align: 'right' },
        { header: 'Валюта', key: 'currency', width: 8 },
        { header: 'З рахунку', key: 'from_account', width: 22 },
        { header: 'На рахунок', key: 'to_account', width: 22 },
        { header: 'Категорія', key: 'category', width: 22 },
        { header: 'Проєкт', key: 'project', width: 18 },
        { header: 'Контрагент', key: 'counterparty', width: 22 },
        { header: 'Коментар', key: 'comment', width: 38 },
        { header: 'Теги', key: 'tags', width: 20 },
        { header: 'Статус', key: 'status', width: 10 },
        { header: 'Джерело', key: 'source', width: 12 },
      ];
      const rows = items.map((o) => ({
        date: o.paid_at?.substring(0, 10),
        type: o.op_type === 'income' ? 'Дохід' : o.op_type === 'expense' ? 'Витрата' : 'Переказ',
        amount: o.op_type === 'expense' ? -o.amount : o.amount,
        currency: o.currency,
        from_account: o.account_from_name || '',
        to_account: o.account_to_name || '',
        category: o.category_name || '',
        project: o.project_name || '',
        counterparty: o.counterparty_name || '',
        comment: o.comment || '',
        tags: (o.tags || []).join(', '),
        status: o.status,
        source: o.source,
      }));
      const totalsRow = {
        date: 'РАЗОМ',
        amount: totalIncome - totalExpense,
        currency: 'CZK',
      };
      const xlsx = await buildXlsx(
        [{ name: 'Операції', columns, rows, totalsRow }],
        { title: 'Фінансові операції', subtitle: range ? `Період: ${from} — ${to} | Записів: ${items.length}` : `Записів: ${items.length}` },
      );
      return attachmentResponse(xlsx, exportFilename('operations', 'xlsx', range), 'xlsx');
    }

    // PDF
    const pdfTable: PdfTable = {
      title: 'Фінансові операції',
      subtitle: range ? `Період: ${from} — ${to}` : undefined,
      headers: ['Дата', 'Тип', 'Сума', 'Рахунок', 'Категорія', 'Контрагент', 'Коментар'],
      colWidths: [60, 50, 70, 110, 110, 110, 270],
      rows: items.map((o) => [
        o.paid_at?.substring(0, 10) || '',
        o.op_type === 'income' ? 'Дохід' : o.op_type === 'expense' ? 'Витрата' : 'Переказ',
        (o.op_type === 'expense' ? -o.amount : o.amount),
        o.op_type === 'transfer' ? `${o.account_from_name || '?'} → ${o.account_to_name || '?'}` : (o.account_from_name || o.account_to_name || ''),
        o.category_name || '',
        o.counterparty_name || '',
        o.comment || '',
      ]),
      totalsRow: ['', 'РАЗОМ', totalIncome - totalExpense, '', '', '', `Операцій: ${items.length}`],
    };
    const pdf = await buildPdf([pdfTable]);
    return attachmentResponse(pdf, exportFilename('operations', 'pdf', range), 'pdf');
  } catch (error: any) {
    return errorResponse(error);
  }
}

// ────────────────────────────────────────────────────────────
// Cashflow matrix export
// ────────────────────────────────────────────────────────────

interface CashflowData {
  months: string[];
  basis: string;
  income: { roots: any[]; byMonth: Record<string, number>; total: number };
  expense: { roots: any[]; byMonth: Record<string, number>; total: number };
  netByMonth: Record<string, number>;
  netTotal: number;
  monthBalances: Record<string, { opening: number; ending: number }>;
}

function flattenRoots(roots: any[]): { name: string; months: Record<string, number>; total: number; isChild: boolean }[] {
  const out: { name: string; months: Record<string, number>; total: number; isChild: boolean }[] = [];
  for (const r of roots) {
    const icon = r.category_icon ? `${r.category_icon} ` : '';
    out.push({ name: `${icon}${r.category_name}`, months: r.months || {}, total: r.total, isChild: false });
    for (const c of (r.children || [])) {
      const cicon = c.category_icon ? `${c.category_icon} ` : '';
      out.push({ name: `   └ ${cicon}${c.category_name}`, months: c.months || {}, total: c.total, isChild: true });
    }
  }
  return out;
}

export async function exportCashflow(request: NextRequest): Promise<Response> {
  try {
    const format = getFormat(request);
    const data = await callJson<CashflowData>(getCashflowMatrix, request);
    const months = data.months;
    const from = months[0] || '';
    const to = months[months.length - 1] || '';
    const range = `${from}_${to}`;

    if (format === 'xlsx') {
      const monthCols: XlsxColumn[] = months.map((m) => ({ header: m, key: m, width: 14, numFmt: '#,##0', align: 'right' }));
      const columns: XlsxColumn[] = [
        { header: 'Категорія', key: 'name', width: 36 },
        ...monthCols,
        { header: 'Разом', key: 'total', width: 16, numFmt: '#,##0', align: 'right' },
      ];

      function sectionRows(title: string, items: ReturnType<typeof flattenRoots>, byMonth: Record<string, number>, total: number) {
        const rows: Record<string, any>[] = [];
        const headerRow: Record<string, any> = { name: title };
        for (const m of months) headerRow[m] = byMonth[m] || 0;
        headerRow.total = total;
        rows.push(headerRow);
        for (const it of items) {
          const r: Record<string, any> = { name: it.name };
          for (const m of months) r[m] = it.months[m] || 0;
          r.total = it.total;
          rows.push(r);
        }
        return rows;
      }

      const incomeRows = sectionRows('▼ ДОХОДИ', flattenRoots(data.income.roots), data.income.byMonth, data.income.total);
      const expenseRows = sectionRows('▼ ВИТРАТИ', flattenRoots(data.expense.roots), data.expense.byMonth, data.expense.total);

      const netRow: Record<string, any> = { name: 'ЧИСТИЙ ПОТІК' };
      for (const m of months) netRow[m] = data.netByMonth[m] || 0;
      netRow.total = data.netTotal;

      const openRow: Record<string, any> = { name: 'Залишок на початок' };
      const endRow: Record<string, any> = { name: 'Залишок на кінець' };
      for (const m of months) {
        openRow[m] = data.monthBalances[m]?.opening || 0;
        endRow[m] = data.monthBalances[m]?.ending || 0;
      }

      const xlsx = await buildXlsx(
        [{
          name: 'Cashflow',
          columns,
          rows: [...incomeRows, ...expenseRows, netRow, openRow, endRow],
          freezeHeader: true,
        }],
        { title: 'Звіт грошового потоку', subtitle: `Період: ${from} — ${to} | Базис: ${data.basis}` },
      );
      return attachmentResponse(xlsx, exportFilename('cashflow', 'xlsx', range), 'xlsx');
    }

    const headers = ['Категорія', ...months, 'Разом'];
    const buildPdfRows = (items: ReturnType<typeof flattenRoots>, byMonth: Record<string, number>, total: number, title: string): (string | number)[][] => {
      const rows: (string | number)[][] = [];
      rows.push([title, ...months.map((m) => byMonth[m] || 0), total]);
      for (const it of items) rows.push([it.name, ...months.map((m) => it.months[m] || 0), it.total]);
      return rows;
    };
    const allRows: (string | number)[][] = [
      ...buildPdfRows(flattenRoots(data.income.roots), data.income.byMonth, data.income.total, '▼ ДОХОДИ'),
      ...buildPdfRows(flattenRoots(data.expense.roots), data.expense.byMonth, data.expense.total, '▼ ВИТРАТИ'),
      ['ЧИСТИЙ ПОТІК', ...months.map((m) => data.netByMonth[m] || 0), data.netTotal],
      ['Залишок на початок', ...months.map((m) => data.monthBalances[m]?.opening || 0), ''],
      ['Залишок на кінець', ...months.map((m) => data.monthBalances[m]?.ending || 0), ''],
    ];
    const pdf = await buildPdf([{
      title: 'Звіт грошового потоку',
      subtitle: `Період: ${from} — ${to} | Базис: ${data.basis}`,
      headers,
      rows: allRows,
    }]);
    return attachmentResponse(pdf, exportFilename('cashflow', 'pdf', range), 'pdf');
  } catch (error: any) {
    return errorResponse(error);
  }
}

// ────────────────────────────────────────────────────────────
// P&L matrix export
// ────────────────────────────────────────────────────────────

interface PnlData {
  months: string[];
  basis: string;
  sections: Array<{
    key: string;
    name: string;
    rows?: any[];
    byMonth: Record<string, number>;
    total: number;
    margin_pct?: number | null;
    isDerived?: boolean;
    highlight?: boolean;
  }>;
}

export async function exportPnl(request: NextRequest): Promise<Response> {
  try {
    const format = getFormat(request);
    const data = await callJson<PnlData>(getPnlMatrix, request);
    const months = data.months;
    const from = months[0] || '';
    const to = months[months.length - 1] || '';
    const range = `${from}_${to}`;

    if (format === 'xlsx') {
      const monthCols: XlsxColumn[] = months.map((m) => ({ header: m, key: m, width: 14, numFmt: '#,##0', align: 'right' }));
      const columns: XlsxColumn[] = [
        { header: 'Стаття', key: 'name', width: 36 },
        ...monthCols,
        { header: 'Разом', key: 'total', width: 16, numFmt: '#,##0', align: 'right' },
        { header: 'Маржа %', key: 'margin', width: 12, numFmt: '0.0', align: 'right' },
      ];

      const rows: Record<string, any>[] = [];
      for (const sec of data.sections) {
        const secRow: Record<string, any> = { name: sec.isDerived ? `▶ ${sec.name}` : `▼ ${sec.name}` };
        for (const m of months) secRow[m] = sec.byMonth[m] || 0;
        secRow.total = sec.total;
        if (sec.margin_pct !== undefined && sec.margin_pct !== null) secRow.margin = sec.margin_pct;
        rows.push(secRow);
        for (const r of (sec.rows || [])) {
          const icon = r.category_icon ? `${r.category_icon} ` : '';
          const childRow: Record<string, any> = { name: `   ${icon}${r.category_name}` };
          for (const m of months) childRow[m] = r.months?.[m] || 0;
          childRow.total = r.total;
          rows.push(childRow);
          for (const c of (r.children || [])) {
            const cicon = c.category_icon ? `${c.category_icon} ` : '';
            const ccRow: Record<string, any> = { name: `      └ ${cicon}${c.category_name}` };
            for (const m of months) ccRow[m] = c.months?.[m] || 0;
            ccRow.total = c.total;
            rows.push(ccRow);
          }
        }
      }

      const xlsx = await buildXlsx(
        [{ name: 'P&L', columns, rows, freezeHeader: true }],
        { title: 'Звіт прибутків та збитків (P&L)', subtitle: `Період: ${from} — ${to} | Базис: ${data.basis}` },
      );
      return attachmentResponse(xlsx, exportFilename('pnl', 'xlsx', range), 'xlsx');
    }

    const headers = ['Стаття', ...months, 'Разом', 'Маржа %'];
    const allRows: (string | number)[][] = [];
    for (const sec of data.sections) {
      const secRow: (string | number)[] = [
        sec.isDerived ? `▶ ${sec.name}` : `▼ ${sec.name}`,
        ...months.map((m) => sec.byMonth[m] || 0),
        sec.total,
        sec.margin_pct !== undefined && sec.margin_pct !== null ? sec.margin_pct : '',
      ];
      allRows.push(secRow);
      for (const r of (sec.rows || [])) {
        const icon = r.category_icon ? `${r.category_icon} ` : '';
        allRows.push([`   ${icon}${r.category_name}`, ...months.map((m) => r.months?.[m] || 0), r.total, '']);
        for (const c of (r.children || [])) {
          const cicon = c.category_icon ? `${c.category_icon} ` : '';
          allRows.push([`      └ ${cicon}${c.category_name}`, ...months.map((m) => c.months?.[m] || 0), c.total, '']);
        }
      }
    }
    const pdf = await buildPdf([{
      title: 'P&L звіт',
      subtitle: `Період: ${from} — ${to} | Базис: ${data.basis}`,
      headers,
      rows: allRows,
    }]);
    return attachmentResponse(pdf, exportFilename('pnl', 'pdf', range), 'pdf');
  } catch (error: any) {
    return errorResponse(error);
  }
}

// ────────────────────────────────────────────────────────────
// Account statement export
// ────────────────────────────────────────────────────────────

interface StatementData {
  account: { id: string; name: string; currency: string };
  from: string;
  to: string;
  opening: number;
  closing: number;
  totalIn: number;
  totalOut: number;
  items: any[];
}

export async function exportStatement(request: NextRequest): Promise<Response> {
  try {
    const format = getFormat(request);
    const data = await callJson<StatementData>(getAccountStatement, request);
    const range = `${data.from}_${data.to}`;
    const cur = data.account.currency;

    if (format === 'xlsx') {
      const columns: XlsxColumn[] = [
        { header: 'Дата', key: 'date', width: 12 },
        { header: 'Опис', key: 'desc', width: 40 },
        { header: 'Категорія', key: 'category', width: 24 },
        { header: 'Контрагент', key: 'counterparty', width: 22 },
        { header: 'Сума', key: 'amount', width: 14, numFmt: '#,##0.00', align: 'right' },
        { header: 'Залишок', key: 'balance', width: 16, numFmt: '#,##0.00', align: 'right' },
      ];
      const rows: Record<string, any>[] = [];
      rows.push({ date: data.from, desc: 'Залишок на початок', balance: data.opening });
      for (const o of data.items) {
        const icon = o.category_icon ? `${o.category_icon} ` : '';
        rows.push({
          date: o.paid_at?.substring(0, 10),
          desc: o.comment || '—',
          category: `${icon}${o.category_name || ''}`,
          counterparty: o.counterparty_name || '',
          amount: o.signed_amount,
          balance: o.running_balance,
        });
      }
      const totalsRow = {
        date: data.to,
        desc: `Підсумок: + ${fmtMoney(data.totalIn)} ${cur}, − ${fmtMoney(data.totalOut)} ${cur}`,
        amount: data.totalIn - data.totalOut,
        balance: data.closing,
      };

      const xlsx = await buildXlsx(
        [{ name: 'Виписка', columns, rows, totalsRow }],
        { title: `Виписка: ${data.account.name} (${cur})`, subtitle: `Період: ${data.from} — ${data.to}` },
      );
      return attachmentResponse(xlsx, exportFilename(`statement_${data.account.name}`, 'xlsx', range), 'xlsx');
    }

    const headers = ['Дата', 'Опис', 'Категорія', 'Контрагент', 'Сума', 'Залишок'];
    const pdfRows: (string | number)[][] = [];
    pdfRows.push([data.from, 'Залишок на початок', '', '', '', data.opening]);
    for (const o of data.items) {
      pdfRows.push([
        o.paid_at?.substring(0, 10) || '',
        o.comment || '—',
        o.category_name || '',
        o.counterparty_name || '',
        o.signed_amount,
        o.running_balance,
      ]);
    }
    const pdf = await buildPdf([{
      title: `Виписка: ${data.account.name} (${cur})`,
      subtitle: `Період: ${data.from} — ${data.to}`,
      headers,
      colWidths: [60, 240, 130, 110, 80, 80],
      rows: pdfRows,
      totalsRow: ['', `+${fmtMoney(data.totalIn)} / −${fmtMoney(data.totalOut)}`, '', '', data.totalIn - data.totalOut, data.closing],
    }]);
    return attachmentResponse(pdf, exportFilename(`statement_${data.account.name}`, 'pdf', range), 'pdf');
  } catch (error: any) {
    return errorResponse(error);
  }
}
