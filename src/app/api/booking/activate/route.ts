import { validatePromo, validatePromoOptions } from '@bookings';
// Alias for /api/booking/promo — ad-blocker-friendly endpoint name
export const GET = validatePromo;
export const OPTIONS = validatePromoOptions;
