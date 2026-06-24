/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import ExcelJS from 'exceljs';

/**
 * GET /api/bookings/export-csv?from=YYYY-MM-DD&to=YYYY-MM-DD&category=&format=xlsx|csv
 *
 * Exports bookings in the selected date range as XLSX (default) or CSV.
 * Filters by check-in OR check-out overlap with the range.
 * Excludes cancelled, no_show, child sub-bookings.
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const category = searchParams.get('category') || '';
    const format = searchParams.get('format') || 'xlsx';

    if (!from || !to) {
      return NextResponse.json({ error: 'Параметри from і to обовʼязкові' }, { status: 400 });
    }

    let query = `
      SELECT
        g.first_name || ' ' || g.last_name AS guest_name,
        g.nationality,
        g.email AS guest_email,
        g.phone AS guest_phone,
        u.name AS unit_name,
        u.code AS unit_code,
        c.name AS category_name,
        c.type AS category_type,
        r.check_in,
        r.check_out,
        r.nights,
        r.adults,
        r.children,
        r.source,
        r.hostex_channel_type,
        r.status,
        r.total_price,
        r.currency,
        r.payment_status,
        r.commission_amount,
        r.bcom_reservation_id,
        r.external_uid,
        r.notes,
        r.meal_plan,
        r.deposit_amount,
        r.deposit_status,
        r.created_at,
        r.id AS reservation_id
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE r.parent_id IS NULL
        AND r.status NOT IN ('cancelled', 'no_show')
        AND (
          (r.check_in >= ? AND r.check_in <= ?)
          OR (r.check_out > ? AND r.check_out <= ?)
          OR (r.check_in <= ? AND r.check_out >= ?)
        )
    `;
    const params: string[] = [from, to, from, to, from, to];

    if (category) {
      query += ' AND c.type = ?';
      params.push(category);
    }

    query += ' ORDER BY r.check_in ASC, g.last_name ASC';

    const rows = db.prepare(query).all(...params) as any[];

    // Payment info: fetch sum per reservation
    const paymentSums: Record<string, { total: number; methods: string[] }> = {};
    try {
      const pRows = db.prepare(`
        SELECT reservation_id, SUM(amount) as total,
               GROUP_CONCAT(DISTINCT method) as methods
        FROM booking_payments
        WHERE reservation_id IN (${rows.map(() => '?').join(',')})
        GROUP BY reservation_id
      `).all(...rows.map(r => r.reservation_id)) as any[];
      for (const p of pRows) {
        paymentSums[p.reservation_id] = { total: p.total, methods: (p.methods || '').split(',') };
      }
    } catch { /* table may not exist */ }

    // Source labels
    const SOURCE_LABELS: Record<string, string> = {
      manual: 'Вручну', direct: 'Прямий', phone: 'Телефон',
      whatsapp: 'WhatsApp', booking_com: 'Booking.com',
      airbnb: 'Airbnb', vrbo: 'VRBO', hostex: 'Hostex',
      widget: 'Віджет', other_ota: 'Інше OTA',
    };
    const STATUS_LABELS: Record<string, string> = {
      draft: 'Чернетка', tentative: 'Очікується', confirmed: 'Підтверджено',
      checked_in: 'Заселено', checked_out: 'Виселено',
    };
    const PAYMENT_LABELS: Record<string, string> = {
      unpaid: 'Не оплачено', payment_requested: 'Запит на оплату',
      prepaid: 'Передплата', paid: 'Оплачено',
    };
    const METHOD_LABELS: Record<string, string> = {
      cash: 'Готівка', card: 'Картка', bank_transfer: 'Банк',
      invoice: 'Фактура', online: 'Онлайн', booking_platform: 'Платформа',
    };

    function getSource(row: any): string {
      if (row.hostex_channel_type) {
        const ch = row.hostex_channel_type.toLowerCase();
        if (ch.includes('booking')) return 'Booking.com';
        if (ch.includes('airbnb')) return 'Airbnb';
        if (ch.includes('vrbo') || ch.includes('homeaway')) return 'VRBO';
        if (ch.includes('expedia')) return 'Expedia';
        return row.hostex_channel_type;
      }
      return SOURCE_LABELS[row.source] || row.source || '';
    }

    function getPaymentMethods(resId: string): string {
      const p = paymentSums[resId];
      if (!p || p.methods.length === 0) return '';
      return p.methods.map(m => METHOD_LABELS[m] || m).join(', ');
    }

    // Build XLSX
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ALiSiO PMS';
    wb.created = new Date();
    const ws = wb.addWorksheet('Бронювання');

    // Columns
    ws.columns = [
      { header: "Ім'я гостя", key: 'guest_name', width: 25 },
      { header: 'Юніт', key: 'unit', width: 12 },
      { header: 'Категорія', key: 'category', width: 12 },
      { header: 'Заїзд', key: 'check_in', width: 12 },
      { header: 'Виїзд', key: 'check_out', width: 12 },
      { header: 'Ночей', key: 'nights', width: 8 },
      { header: 'Дорослих', key: 'adults', width: 10 },
      { header: 'Дітей', key: 'children', width: 8 },
      { header: 'Канал', key: 'source', width: 15 },
      { header: 'Статус', key: 'status', width: 14 },
      { header: 'Вартість', key: 'total_price', width: 12 },
      { header: 'Валюта', key: 'currency', width: 8 },
      { header: 'Оплата', key: 'payment_status', width: 15 },
      { header: 'Спосіб оплати', key: 'payment_method', width: 15 },
      { header: 'Оплачено', key: 'paid_amount', width: 12 },
      { header: 'Комісія', key: 'commission', width: 10 },
      { header: 'Депозит', key: 'deposit', width: 10 },
      { header: 'Харчування', key: 'meal', width: 12 },
      { header: 'Країна', key: 'nationality', width: 10 },
      { header: 'Email', key: 'email', width: 22 },
      { header: 'Телефон', key: 'phone', width: 15 },
      { header: 'Примітки', key: 'notes', width: 30 },
      { header: 'Створено', key: 'created_at', width: 18 },
      { header: 'Booking ID', key: 'bcom_id', width: 14 },
      { header: 'External ID', key: 'ext_id', width: 14 },
    ];

    // Header style
    ws.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Data rows
    for (const row of rows) {
      const pay = paymentSums[row.reservation_id];
      ws.addRow({
        guest_name: row.guest_name?.trim() || '',
        unit: row.unit_code || row.unit_name || '',
        category: row.category_name || '',
        check_in: row.check_in || '',
        check_out: row.check_out || '',
        nights: row.nights || 0,
        adults: row.adults || 0,
        children: row.children || 0,
        source: getSource(row),
        status: STATUS_LABELS[row.status] || row.status || '',
        total_price: row.total_price || 0,
        currency: row.currency || 'CZK',
        payment_status: PAYMENT_LABELS[row.payment_status] || row.payment_status || '',
        payment_method: getPaymentMethods(row.reservation_id),
        paid_amount: pay?.total || 0,
        commission: row.commission_amount || 0,
        deposit: row.deposit_amount || 0,
        meal: row.meal_plan || '',
        nationality: row.nationality || '',
        email: row.guest_email || '',
        phone: row.guest_phone || '',
        notes: (row.notes || '').replace(/\n/g, ' ').substring(0, 200),
        created_at: row.created_at || '',
        bcom_id: row.bcom_reservation_id || '',
        ext_id: row.external_uid || '',
      });
    }

    // Summary row
    const totalPrice = rows.reduce((s, r) => s + (r.total_price || 0), 0);
    const totalCommission = rows.reduce((s, r) => s + (r.commission_amount || 0), 0);
    const totalPaid = Object.values(paymentSums).reduce((s, p) => s + p.total, 0);
    const summaryRow = ws.addRow({
      guest_name: `РАЗОМ (${rows.length} бронювань)`,
      total_price: totalPrice,
      paid_amount: totalPaid,
      commission: totalCommission,
    });
    summaryRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    });

    // Auto-filter
    ws.autoFilter = { from: 'A1', to: `Y${rows.length + 1}` };

    // Freeze header
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    if (format === 'csv') {
      // CSV export with BOM
      const csvBuffer = await wb.csv.writeBuffer();
      const bom = Buffer.from('\uFEFF', 'utf-8');
      const body = Buffer.concat([bom, Buffer.from(csvBuffer)]);
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="bookings_${from}_${to}.csv"`,
        },
      });
    }

    // XLSX export (default)
    const xlsxBuffer = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(xlsxBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="bookings_${from}_${to}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('[export-csv] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
