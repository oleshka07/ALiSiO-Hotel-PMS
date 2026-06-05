import { NextRequest } from 'next/server';
import { previewOtaImport } from '@/modules/finance/api/ota-import.handlers';

export async function POST(request: NextRequest) {
  return previewOtaImport(request);
}
