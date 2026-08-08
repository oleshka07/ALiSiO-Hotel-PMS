/**
 * What an error is allowed to say to the caller.
 *
 * Handlers across the codebase answered with `{ error: e.message }`. For a
 * deliberate message that is exactly right — "No EUR→CZK exchange rate
 * configured. Add one at /finance/settings" tells the operator what to do. For
 * anything the database or the runtime raised it is a leak: the sweep of all
 * routes read table names, column names and constraint names straight out of
 * production responses, and so could anyone else.
 *
 * So this does not blanket-replace messages. It passes an app-level message
 * through and replaces a driver-level one, keeping the detail for the log.
 *
 *   } catch (e) {
 *     console.error('[Invoices] export failed:', e);
 *     return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
 *   }
 */

// Anything raised by better-sqlite3, the filesystem or the JS runtime. Matching
// on the shape of the message rather than the error class, because the drivers
// throw plain Errors and the message is all that survives a rethrow.
const INTERNAL_SIGNATURES: RegExp[] = [
  /\bno such (column|table|view|index|function)\b/i,
  /\bambiguous column\b/i,
  /\b(FOREIGN KEY|UNIQUE|NOT NULL|CHECK|PRIMARY KEY) constraint\b/i,
  /\bSQLITE_[A-Z]+\b/,
  /\bSqliteError\b/i,
  /\bdatabase is locked\b/i,
  /\bdatatype mismatch\b/i,
  /\b(too few|too many) parameter values\b/i,
  /\bsyntax error\b/i,
  /\bincomplete input\b/i,
  /\bnear ".*": syntax\b/i,
  /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b.*\b(FROM|SET|VALUES|WHERE)\b/i,
  /\b(ENOENT|EACCES|EPERM|EEXIST|EISDIR|ENOTDIR|ECONNREFUSED|ETIMEDOUT)\b/,
  /\b(is not a function|is not defined|undefined is not|null is not)\b/i,
  /\bCannot (read|set) propert/i,
  /\bof (undefined|null)\b/i,
  /\bat\s+\S+\s+\(.*:\d+:\d+\)/, // a stack frame made it into the message
  /\/(root|home|usr|var|etc)\//, // absolute server paths
];

const DEFAULT_FALLBACK = 'Внутрішня помилка. Спробуйте ще раз або зверніться до адміністратора.';

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

/** True when the message describes how the machine broke rather than what the user did. */
export function isInternalError(err: unknown): boolean {
  const msg = messageOf(err);
  if (!msg) return true; // nothing to say safely
  return INTERNAL_SIGNATURES.some((re) => re.test(msg));
}

/**
 * Whatever is withheld from the response is written to the log instead.
 *
 * This matters more than it looks. Most handlers answered with `e.message` and
 * never logged anything, so the response WAS the diagnosis — every broken route
 * in this codebase was found by reading it: `no such column: org_id`,
 * `no such table: bookings`, `expected_gross`, `Too few parameter values`.
 * Sanitising the response without logging would have made the next such bug
 * invisible. Some handlers log as well; a duplicate line is cheap, a lost
 * failure is not.
 */
function logWithheld(err: unknown): void {
  const detail = err instanceof Error ? (err.stack || err.message) : String(err);
  console.error('[withheld from response]', detail);
}

/**
 * The message that may leave the server. Deliberate application messages pass
 * through; database and runtime failures collapse to `fallback` and land in the
 * log with their stack.
 */
export function publicMessage(err: unknown, fallback: string = DEFAULT_FALLBACK): string {
  const msg = messageOf(err).trim();
  if (!msg) { logWithheld(err); return fallback; }
  if (isInternalError(err)) { logWithheld(err); return fallback; }
  // A long message is either a stack or a dump; neither belongs in a response.
  if (msg.length > 300 || msg.includes('\n')) { logWithheld(err); return fallback; }
  return msg;
}
