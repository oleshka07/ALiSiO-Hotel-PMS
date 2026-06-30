import { getWidgetPriceList, updateWidgetPriceItem } from '@properties/widget-prices.handlers';
import { NextResponse } from 'next/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });

export const GET = async (req: Request) => {
  const res = await getWidgetPriceList(req);
  Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
};

export const PUT = async (req: Request) => {
  const res = await updateWidgetPriceItem(req);
  Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
};

