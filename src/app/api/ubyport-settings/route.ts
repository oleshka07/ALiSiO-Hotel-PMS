import { getUbyportSettings, saveUbyportSettings } from '@/modules/guests/api/registry.handlers';
import { NextRequest } from 'next/server';

export async function GET() {
  return getUbyportSettings();
}

export async function PUT(request: NextRequest) {
  return saveUbyportSettings(request);
}
