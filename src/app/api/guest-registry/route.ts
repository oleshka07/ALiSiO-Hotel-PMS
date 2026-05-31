import { getRegistry, exportRegistry } from '@/modules/guests/api/registry.handlers';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format');
  if (format === 'csv') return exportRegistry(request);
  return getRegistry(request);
}
