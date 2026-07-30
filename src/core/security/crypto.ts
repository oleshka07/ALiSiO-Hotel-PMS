import crypto from 'node:crypto';

/**
 * 256-bit AES-GCM Encryption Utility
 *
 * Provides authenticated symmetric encryption (AES-256-GCM) for sensitive
 * data at rest (API keys, bank tokens, credentials, financial secrets).
 *
 * Format: "enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96 bits for GCM
const PREFIX = 'enc:v1:';

/**
 * Derives a 256-bit (32-byte) key from environment secret.
 */
function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
    || process.env.NEXTAUTH_SECRET
    || 'alisio-pms-256bit-master-security-key-v1';

  // Always produces a 32-byte (256-bit) key
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns formatted string: "enc:v1:<iv>:<authTag>:<ciphertext>"
 */
export function encrypt256(text: string | null | undefined): string {
  if (!text) return '';
  if (text.startsWith(PREFIX)) {
    // Already encrypted
    return text;
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');

  return `${PREFIX}${ivHex}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM formatted string.
 * If text is not encrypted (does not start with "enc:v1:"), returns as-is for backward compatibility.
 */
export function decrypt256(encryptedText: string | null | undefined): string {
  if (!encryptedText) return '';
  if (!encryptedText.startsWith(PREFIX)) {
    // Plaintext fallback (unencrypted legacy data)
    return encryptedText;
  }

  try {
    const raw = encryptedText.substring(PREFIX.length);
    const parts = raw.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err: any) {
    console.error('[Security] AES-256 Decryption error:', err.message);
    return '';
  }
}

/**
 * Helper to check if a value is encrypted
 */
export function isEncrypted256(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.startsWith(PREFIX);
}
