import type { DecayingPage, PageDaily } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function decayingPages(
  rows: PageDaily[],
  now: Date,
  opts?: { minPrevious?: number | undefined; minDropPct?: number | undefined; windowDays?: number | undefined },
): DecayingPage[] {
  const windowDays = opts?.windowDays ?? 28;
  const minPrevious = opts?.minPrevious ?? 10;
  const minDropPct = opts?.minDropPct ?? 0.2;
  const today = now.toISOString().slice(0, 10);
  const currentStart = new Date(now.getTime() - windowDays * DAY_MS).toISOString().slice(0, 10);
  const previousStart = new Date(now.getTime() - 2 * windowDays * DAY_MS).toISOString().slice(0, 10);

  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  for (const row of rows) {
    if (row.date > today) continue;
    if (row.date > currentStart && row.date <= today) {
      current.set(row.page, (current.get(row.page) ?? 0) + row.clicks);
    } else if (row.date > previousStart && row.date <= currentStart) {
      previous.set(row.page, (previous.get(row.page) ?? 0) + row.clicks);
    }
  }

  const out: DecayingPage[] = [];
  for (const [url, prev] of previous) {
    if (prev < minPrevious) continue;
    const cur = current.get(url) ?? 0;
    const delta = cur - prev;
    const deltaPct = prev > 0 ? delta / prev : null;
    if (deltaPct !== null && deltaPct <= -minDropPct) {
      out.push({ url, previousClicks: prev, currentClicks: cur, delta, deltaPct });
    }
  }
  return out.toSorted((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
}
