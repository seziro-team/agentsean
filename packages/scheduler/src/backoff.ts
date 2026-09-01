/** Exponential backoff: 1m, 5m, 25m, 2h05m, … capped at 6h. */
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_FACTOR = 5;
export const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 8;
/** Crash recovery: a running job with a heartbeat older than this is requeued. */
export const STALE_HEARTBEAT_MS = 5 * 60 * 1000;

export function backoffMs(attempts: number): number {
  const exp = Math.max(0, attempts - 1);
  const raw = BACKOFF_BASE_MS * BACKOFF_FACTOR ** exp;
  return Math.min(BACKOFF_CAP_MS, raw);
}
