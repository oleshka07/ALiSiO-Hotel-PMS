/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════
// Finance step-up passphrase — data layer (synchronous better-sqlite3)
//
// Opt-in "second password" for the finance module:
//   - hasFinancePassphrase(userId) === false  → finance is NOT locked
//     (owner-only access still applies). The owner can enable it.
//   - once set, the owner must unlock per session before reaching finance.
//
// The kdf_salt column is reserved for at-rest encryption (future phase): the
// passphrase will derive an encryption key; the verification hash here is
// independent of that key.
// ════════════════════════════════════════════════════════════
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const UNLOCK_MINUTES = (() => {
  const n = Number(process.env.FINANCE_UNLOCK_MINUTES ?? '60');
  return Number.isFinite(n) && n > 0 ? n : 60;
})();

export function hasFinancePassphrase(userId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT user_id FROM finance_security WHERE user_id = ?').get(userId);
  return !!row;
}

export function setFinancePassphrase(userId: string, passphrase: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(passphrase, 12);
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO finance_security (user_id, passphrase_hash, kdf_salt)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      passphrase_hash = excluded.passphrase_hash,
      updated_at = datetime('now')
  `).run(userId, hash, salt);
}

export function verifyFinancePassphrase(userId: string, passphrase: string): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT passphrase_hash FROM finance_security WHERE user_id = ?',
  ).get(userId) as { passphrase_hash: string } | undefined;
  if (!row) return false;
  return bcrypt.compareSync(passphrase, row.passphrase_hash);
}

export function unlockFinance(sessionId: string): void {
  const db = getDb();
  const until = new Date(Date.now() + UNLOCK_MINUTES * 60 * 1000).toISOString();
  db.prepare('UPDATE sessions SET finance_unlocked_until = ? WHERE id = ?').run(until, sessionId);
}

export function lockFinance(sessionId: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET finance_unlocked_until = NULL WHERE id = ?').run(sessionId);
}

export function isFinanceUnlocked(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const db = getDb();
  const row = db.prepare(
    "SELECT 1 FROM sessions WHERE id = ? AND finance_unlocked_until IS NOT NULL AND finance_unlocked_until > datetime('now')",
  ).get(sessionId);
  return !!row;
}

// ─── Brute-force throttle for unlock attempts (in-memory, per user) ──────────
const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();

/** Returns true if another attempt is allowed; records the attempt. */
export function checkUnlockRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = unlockAttempts.get(userId);
  if (!entry || now > entry.resetAt) {
    unlockAttempts.set(userId, { count: 1, resetAt: now + UNLOCK_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_UNLOCK_ATTEMPTS;
}

export function clearUnlockRateLimit(userId: string): void {
  unlockAttempts.delete(userId);
}
