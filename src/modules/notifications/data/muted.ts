/**
 * Telegram notifications that are switched off.
 *
 * The chat had become noisy enough that the messages worth reading were getting
 * lost among the ones that were not. Rather than deleting the code that builds
 * them — the data behind each is still computed and still returned by its
 * endpoint — the send is skipped from one list, so turning any of them back on
 * is deleting a line here.
 */
export type NotificationKey =
  | 'guest_registration'   // ✅ Реєстрація гостя — fires on every guest registered
  | 'pricelabs_sync'       // 📈 / ⚠️ PriceLabs sync — integration is not in use
  | 'daily_digest';        // 📊 Вечірнє зведення

const MUTED: ReadonlySet<NotificationKey> = new Set<NotificationKey>([
  'guest_registration',
  'pricelabs_sync',
  'daily_digest',
]);

export function isMuted(key: NotificationKey): boolean {
  return MUTED.has(key);
}
