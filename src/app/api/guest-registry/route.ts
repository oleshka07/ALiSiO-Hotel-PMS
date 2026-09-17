import { getRegistry, exportRegistry, exportRegistryUnl, bulkUpdateRegistry } from '@/modules/guests/api/registry.handlers';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format');
  if (format === 'csv') return exportRegistry(request);
  if (format === 'unl') return exportRegistryUnl(request);
  return getRegistry(request);
}

export async function PATCH(request: NextRequest) {
  return bulkUpdateRegistry(request);
}
