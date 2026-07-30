/**
 * Security Public API
 *
 * Exposes core security utilities:
 * - 256-bit AES-256-GCM encryption for data at rest (API keys, secrets)
 * - PII masking for outbound channels
 * - Route guarding & permission checks
 */

export { encrypt256, decrypt256, isEncrypted256 } from './crypto';
export {
  maskLastName,
  maskFullName,
  maskDob,
  maskDobForSheets,
  maskDocNumber,
  maskDocNumberForSheets,
  maskEmail,
  maskPhone,
} from './pii-mask';
export { requireOwner, requirePermission } from './route-guard';
