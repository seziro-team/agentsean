import "server-only";

/**
 * Make an untrusted value safe to interpolate into a log line.
 *
 * Log files get parsed — by a human scrolling them, by grep, and by whatever
 * ships them to an aggregator. A value containing a newline forges an entire
 * additional entry, so an attacker who controls (say) the email on a payment
 * can write convincing fake lines into the operator's trail:
 *
 *   "a@b.test\n[billing] subscription activated for attacker@evil.test"
 *
 * ANSI escape sequences can also rewrite a terminal's display. So: strip
 * control characters and escapes, cap the length, and quote the result so its
 * boundaries are unambiguous.
 */
// Matching control characters is the entire point of this module: they are
// what makes log forgery possible, so the rule is suppressed deliberately.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*[A-Za-z]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

export function safeLog(value: unknown, maxLength = 120): string {
  if (value == null) return '"<none>"';
  const raw = typeof value === "string" ? value : String(value);
  const cleaned = raw.replace(ANSI, "").replace(CONTROL, " ").trim();
  const clipped =
    cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
  return JSON.stringify(clipped);
}
