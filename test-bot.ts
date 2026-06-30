import { NextResponse, NextRequest } from 'next/server';
import { recordTelegramOperation } from './src/modules/finance/api/telegram-bridge.handlers';

export async function test() {
  const req = new NextRequest('http://localhost:3000/api/finance/telegram-bridge/operation', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + (process.env.TELEGRAM_BRIDGE_TOKEN || '') },
    body: JSON.stringify({
      type: 'income',
      amount: 700,
      currency: 'CZK',
      chat_id: 123,
      message_id: 456,
      category: 'ec_something',
      project: 'bu_something',
      description: 'Zviřeci',
      created_by_name: 'Андрій',
      paid_at: '2026-06-25'
    })
  });
  
  const res = await recordTelegramOperation(req);
  console.log(res.status, await res.text());
}
test();
