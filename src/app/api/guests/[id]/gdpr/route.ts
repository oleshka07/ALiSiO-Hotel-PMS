import { exportGuestData, eraseGuestData } from '@/modules/guests/api/gdpr.handlers';

export const GET = exportGuestData;
export const DELETE = eraseGuestData;
