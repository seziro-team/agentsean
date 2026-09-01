import { QuotaExceededError } from "./errors.js";
import type { QuotaApi, QuotaManager } from "./quota.js";

export type FetchFn = typeof fetch;

export type GoogleHttp = {
  fetch: FetchFn;
  quota: QuotaManager;
  maxRetries: number;
  sleep: (ms: number) => Promise<void>;
  /** Cap for tests. GSC load-quota advice is wait 15 minutes. */
  maxBackoffMs: number;
};

const LOAD_QUOTA_WAIT_MS = 15 * 60_000;

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res: Response, attempt: number, maxBackoffMs: number): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const sec = Number(header);
    if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, maxBackoffMs);
  }
  const exp = Math.min(1000 * 2 ** attempt, maxBackoffMs);
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}

export async function googleFetch(
  http: GoogleHttp,
  api: QuotaApi,
  scopeKey: string,
  url: string,
  init: RequestInit,
  cost = 1,
): Promise<Response> {
  await http.quota.acquire(api, scopeKey, cost);
  let last: Response | undefined;
  for (let n = 0; n <= http.maxRetries; n++) {
    const res = await http.fetch(url, init);
    last = res;
    if (res.status === 429 || res.status >= 500) {
      if (n === http.maxRetries) break;
      let wait = retryAfterMs(res, n, http.maxBackoffMs);
      if (api === "gsc.searchAnalytics" && res.status === 429) {
        wait = Math.min(LOAD_QUOTA_WAIT_MS, Math.max(wait, http.maxBackoffMs));
      }
      await http.sleep(wait);
      continue;
    }
    http.quota.record(api, scopeKey, cost);
    return res;
  }
  if (!last) throw new Error("googleFetch: no response");
  if (last.status === 429) {
    throw new QuotaExceededError(
      api,
      `${api} returned 429 after retries`,
      http.maxBackoffMs,
    );
  }
  http.quota.record(api, scopeKey, cost);
  return last;
}

export function bearer(
  token: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}
