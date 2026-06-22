import { registerFromPhotos, getTodayCheckIns } from '@/modules/guests/api/registration-bridge.handlers';
export const POST = registerFromPhotos;
export const GET = getTodayCheckIns;
export const runtime = 'nodejs';
