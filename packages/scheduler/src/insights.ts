/** GSC insights for the Search performance screen. Default metric is clicks. */

export type PageDaily = {
  date: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number | null;
};

export type QueryDaily = {
  date: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
};

export type DayTotal = {
  date: string;
  clicks: number;
  impressions: number;
};

export type GscInsights = {
  metric: "clicks";
  impressionsContaminated: boolean;
  strikingDistance: Array<{ page: string; clicks: number; position: number }>;
  decay: {
    previousClicks: number;
    currentClicks: number;
    delta: number;
    deltaPct: number | null;
  };
  cannibalization: Array<{ query: string; pages: string[] }>;
  cannibalizationNote: string;
  ctrOutliers: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
  }>;
  brand: { brandClicks: number; nonBrandClicks: number; brandShare: number | null };
};

const IMPRESSIONS_BUG_BEGIN = "2025-05-13";
const IMPRESSIONS_BUG_END = "2026-04-27";

export function impressionsWindowContaminated(dates: string[]): boolean {
  return dates.some((d) => d >= IMPRESSIONS_BUG_BEGIN && d <= IMPRESSIONS_BUG_END);
}

export function computeGscInsights(opts: {
  pages: PageDaily[];
  queries: QueryDaily[];
  days: DayTotal[];
  brandTerms: string[];
  now?: Date | undefined;
}): GscInsights {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const twoWeeks = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);

  const pageAgg = new Map<string, { clicks: number; position: number; n: number }>();
  for (const row of opts.pages) {
    if (row.date < weekAgo || row.date > today) continue;
    const cur = pageAgg.get(row.page) ?? { clicks: 0, position: 0, n: 0 };
    cur.clicks += row.clicks;
    if (row.position !== null) {
      cur.position += row.position;
      cur.n++;
    }
    pageAgg.set(row.page, cur);
  }
  const strikingDistance = [...pageAgg.entries()]
    .map(([page, v]) => ({
      page,
      clicks: v.clicks,
      position: v.n ? v.position / v.n : 0,
    }))
    .filter((r) => r.position >= 8 && r.position <= 20)
    .toSorted((a, b) => b.clicks - a.clicks)
    .slice(0, 25);

  const currentClicks = opts.days
    .filter((d) => d.date > weekAgo && d.date <= today)
    .reduce((s, d) => s + d.clicks, 0);
  const previousClicks = opts.days
    .filter((d) => d.date > twoWeeks && d.date <= weekAgo)
    .reduce((s, d) => s + d.clicks, 0);
  const delta = currentClicks - previousClicks;
  const deltaPct = previousClicks > 0 ? delta / previousClicks : null;

  const queryAgg = new Map<string, { clicks: number; impressions: number }>();
  for (const row of opts.queries) {
    if (row.date < weekAgo) continue;
    const cur = queryAgg.get(row.query) ?? { clicks: 0, impressions: 0 };
    cur.clicks += row.clicks;
    cur.impressions += row.impressions;
    queryAgg.set(row.query, cur);
  }

  const ctrOutliers = [...queryAgg.entries()]
    .map(([query, v]) => ({
      query,
      clicks: v.clicks,
      impressions: v.impressions,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
    }))
    .filter((r) => r.impressions >= 100 && r.ctr < 0.02 && r.clicks < 5)
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, 25);

  const terms = opts.brandTerms.map((t) => t.toLowerCase()).filter(Boolean);
  let brandClicks = 0;
  let nonBrandClicks = 0;
  for (const [query, v] of queryAgg) {
    const q = query.toLowerCase();
    if (terms.some((t) => q.includes(t))) brandClicks += v.clicks;
    else nonBrandClicks += v.clicks;
  }
  const total = brandClicks + nonBrandClicks;

  const dates = [
    ...opts.days.map((d) => d.date),
    ...opts.pages.map((p) => p.date),
    ...opts.queries.map((q) => q.date),
  ];

  return {
    metric: "clicks",
    impressionsContaminated: impressionsWindowContaminated(dates),
    strikingDistance,
    decay: {
      previousClicks,
      currentClicks,
      delta,
      deltaPct,
    },
    cannibalization: [],
    cannibalizationNote:
      "Query×page GSC pull is required for cannibalization; weekly query and page totals are stored separately.",
    ctrOutliers,
    brand: {
      brandClicks,
      nonBrandClicks,
      brandShare: total > 0 ? brandClicks / total : null,
    },
  };
}

export function brandTermsFromOrigin(origin: string): string[] {
  try {
    const host = new URL(origin).hostname.replace(/^www\./, "");
    const head = host.split(".")[0] ?? host;
    return head.length >= 3 ? [head] : [];
  } catch {
    return [];
  }
}
