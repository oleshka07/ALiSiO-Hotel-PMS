/**
 * PII Masking Utilities
 *
 * Centralized module for masking Personally Identifiable Information
 * before sending to external channels (Telegram, Google Sheets, logs).
 *
 * Full data always stays in the PMS database — masking only affects
 * outbound notifications and third-party integrations.
 */

/** Mask last name: "Novák" → "N." */
export function maskLastName(lastName: string | null | undefined): string {
  if (!lastName) return '';
  return `${lastName.charAt(0)}.`;
}

/** Mask full name: "Jan Novák" → "Jan N." */
export function maskFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = firstName || '';
  const last = maskLastName(lastName);
  return `${first} ${last}`.trim() || '—';
}

/** Mask date of birth: "1990-05-15" → "1990 р.н." */
export function maskDob(dob: string | null | undefined): string {
  if (!dob) return '';
  const year = dob.substring(0, 4);
  return `${year} р.н.`;
}

/** Mask date of birth for Sheets: "1990-05-15" → "1990-••-••" */
export function maskDobForSheets(dob: string | null | undefined): string {
  if (!dob) return '';
  const year = dob.substring(0, 4);
  return `${year}-••-••`;
}

/** Mask document number: "AB1234567" → "••••4567" (last 4 visible) */
export function maskDocNumber(docNum: string | null | undefined): string {
  if (!docNum) return '';
  if (docNum.length <= 4) return docNum;
  return `••••${docNum.slice(-4)}`;
}

/** Mask document number for Sheets: "AB1234567" → "AB•••••67" (first 2 + last 2 visible) */
export function maskDocNumberForSheets(docNum: string | null | undefined): string {
  if (!docNum) return '';
  if (docNum.length <= 4) return docNum;
  const prefix = docNum.substring(0, 2);
  const suffix = docNum.slice(-2);
  return `${prefix}${'•'.repeat(docNum.length - 4)}${suffix}`;
}

/** Mask email: "jan.novak@email.cz" → "j***k@email.cz" */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/** Mask phone: "+420 777 123 456" → "+420•••••456" */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 6) return phone;
  return `${phone.substring(0, 4)}•••••${digits.slice(-3)}`;
}
