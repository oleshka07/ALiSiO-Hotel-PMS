import { NextRequest } from 'next/server';
import { confirmOtaImport } from '@/modules/finance/api/ota-import.handlers';

export async function POST(request: NextRequest) {
  return confirmOtaImport(request);
}
