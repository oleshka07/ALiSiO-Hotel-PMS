// Guests module public API
export { listGuests, createGuest } from './guests.handlers';
export { getGuest, updateGuest, deleteGuest } from './guest.handlers';
export { getGuestPortal } from './portal.handlers';
export { registerGuests } from './register.handlers';
export { submitFeedback } from './feedback.handlers';
export { orderServices } from './services.handlers';
export { payForService } from './pay.handlers';
export { payForBooking } from './pay-booking.handlers';
export { getChatMessages, sendChatMessage } from './chat.handlers';
export { translateTexts } from './translate.handlers';
export { handleCartEvent } from './cart.handlers';
export { getRegistry, updateRegistryEntry, exportRegistry } from './registry.handlers';
export { getRegistrationStatus, saveDraftRegistration, handleOptions as handleRegistrationStatusOptions } from './registration-status.handlers';
export { uploadGuestDoc, handleOptions as handleDocUploadOptions } from './doc-upload.handlers';


// Domain types
export type { GuestWithStats, CreateGuestInput, RegisteredGuest } from '../domain/types';

// Unified dedup helper — call from any handler that creates/finds a guest
// (manual booking, group booking, channel sync, Excel import, email parser).
// Strategy: email → phone → first+last name (case-insensitive), all scoped
// to organization_id. Soft-merges new fields without overwriting existing ones.
export { findOrCreateGuest } from '../data/guest-dedup.repo';
export type { GuestDedupArgs, GuestDedupResult } from '../data/guest-dedup.repo';
