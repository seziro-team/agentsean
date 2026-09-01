/**
 * GA4 ↔ GSC discrepancy causes. PLAN Phase 7: 17 named codes, waterfall
 * closes to an explicit residual. Magnitudes from research/gap-08.
 */

export const GSC_ANONYMIZED_SHARE = 0.468;
export const EU_GA4_INVISIBLE_LOW = 0.4;
export const EU_GA4_INVISIBLE_HIGH = 0.65;

export type CauseGroup =
  "definitional" | "gsc" | "ga4_collection" | "ga4_config" | "ga4_reporting";

export type DiscrepancyCause = {
  code: string;
  group: CauseGroup;
  name: string;
  direction: "gsc_gt_ga4" | "ga4_gt_gsc" | "either" | "n/a";
  typicalMagnitude: string;
  alwaysPresent: boolean;
  notes: string;
};

export const DISCREPANCY_CAUSES = [
  {
    code: "DEF_CLICK_VS_SESSION",
    group: "definitional",
    name: "Click vs session",
    direction: "gsc_gt_ga4",
    typicalMagnitude: "2–8% (pogo-sticking)",
    alwaysPresent: true,
    notes:
      "Two SERP clicks inside a 30-minute window are 2 GSC clicks and 1 GA4 session.",
  },
  {
    code: "DEF_TIMEZONE",
    group: "definitional",
    name: "Timezone bucket",
    direction: "either",
    typicalMagnitude: "up to ~37% of one day (EU vs Pacific); ~0 over 28 days",
    alwaysPresent: true,
    notes:
      "GSC days are US/Pacific. GA4 days are the property timezone. Never compare single days.",
  },
  {
    code: "DEF_CANONICAL_VS_LANDING",
    group: "definitional",
    name: "Canonical vs landing URL",
    direction: "either",
    typicalMagnitude:
      "20–60% at page level on parameterised sites; ~0 at property level",
    alwaysPresent: true,
    notes: "GSC assigns to Google-selected canonical. GA4 records the URL that loaded.",
  },
  {
    code: "DEF_AGGREGATION",
    group: "definitional",
    name: "Chart vs table aggregation",
    direction: "either",
    typicalMagnitude: "property totals vs page-table totals",
    alwaysPresent: true,
    notes: "GSC chart totals aggregate by property; the table aggregates by page.",
  },
  {
    code: "DEF_REDIRECT_CHAIN",
    group: "definitional",
    name: "Redirect chain",
    direction: "gsc_gt_ga4",
    typicalMagnitude: "100% of affected URLs; property-level = abandon rate",
    alwaysPresent: false,
    notes:
      "GSC click lands on A, 301 to B, GA4 fires on B. Slow hops abandon mid-chain.",
  },
  {
    code: "GSC_ANONYMIZED_QUERY",
    group: "gsc",
    name: "Anonymized queries",
    direction: "n/a",
    typicalMagnitude:
      "46.8% of GSC clicks have no query (Ahrefs, 22B clicks / 887,534 properties)",
    alwaysPresent: true,
    notes:
      "Query-dimensioned totals omit rare queries. Page-level clicks stay complete. Never compute site traffic from a query pull.",
  },
  {
    code: "GSC_ROW_LIMIT",
    group: "gsc",
    name: "API row limit",
    direction: "n/a",
    typicalMagnitude: "API does not guarantee completeness past top rows",
    alwaysPresent: true,
    notes:
      "searchanalytics.query rowLimit 1–25,000; paging to exhaustion is still a sample. Only BigQuery bulk export is complete.",
  },
  {
    code: "GSC_16_MONTH_WINDOW",
    group: "gsc",
    name: "16-month retention",
    direction: "n/a",
    typicalMagnitude: "exactly one rolling YoY pair",
    alwaysPresent: true,
    notes: "Archive locally from day one. The API window cannot be backfilled.",
  },
  {
    code: "GSC_DISCOVER_NEWS_SPLIT",
    group: "gsc",
    name: "Discover / News split",
    direction: "ga4_gt_gsc",
    typicalMagnitude: "publishers 30–70% of 'organic'; B2B SaaS ~0",
    alwaysPresent: false,
    notes:
      "Discover and Google News are not in type=web. GA4 still counts them as google / organic.",
  },
  {
    code: "GSC_GENAI_SURFACES",
    group: "gsc",
    name: "Generative AI surfaces",
    direction: "either",
    typicalMagnitude: "impressions definitional change from mid-2026",
    alwaysPresent: false,
    notes:
      "AI Overviews / AI Mode sit in overall totals. Dedicated report is impressions-only and not in the Search Analytics API.",
  },
  {
    code: "GA4_CONSENT_DENIED",
    group: "ga4_collection",
    name: "Consent Mode denied",
    direction: "gsc_gt_ga4",
    typicalMagnitude:
      "EU/UK compliant reject-all: 40–65% of organic permanently invisible in GA4",
    alwaysPresent: false,
    notes:
      "A compliant EU property has 40–65% of organic traffic missing from GA4. GSC is unaffected.",
  },
  {
    code: "GA4_ADBLOCK",
    group: "ga4_collection",
    name: "Ad blockers",
    direction: "gsc_gt_ga4",
    typicalMagnitude: "vertical-dependent; often 10–30%",
    alwaysPresent: false,
    notes: "Requests to google-analytics.com / googletagmanager.com never fire.",
  },
  {
    code: "GA4_JS_FAIL",
    group: "ga4_collection",
    name: "Tag never fired",
    direction: "gsc_gt_ga4",
    typicalMagnitude: "template / CSP / bounce-before-tag",
    alwaysPresent: false,
    notes:
      "JS error before gtag(), missing tag, CSP, or bounce before the library loads.",
  },
  {
    code: "GA4_CHANNEL_MISCLASS",
    group: "ga4_config",
    name: "Default channel group",
    direction: "gsc_gt_ga4",
    typicalMagnitude: "campaigns named *shop* silently leave Organic Search",
    alwaysPresent: false,
    notes:
      "Reconcile against sessionSourceMedium == 'google / organic', never the channel group.",
  },
  {
    code: "GA4_ATTRIBUTION_MODEL",
    group: "ga4_config",
    name: "Data-driven attribution",
    direction: "either",
    typicalMagnitude: "key-event counts will not equal organic-started sessions",
    alwaysPresent: true,
    notes:
      "Sessions are not attribution-modelled. Key events are. Mixing them in one table is a bug.",
  },
  {
    code: "GA4_SAMPLING",
    group: "ga4_reporting",
    name: "Sampled API response",
    direction: "n/a",
    typicalMagnitude: "standard properties sample above 10M events / query",
    alwaysPresent: false,
    notes:
      "Refuse to report a sampled number without a warning. Read ResponseMetaData.samplingMetadatas.",
  },
  {
    code: "GA4_THRESHOLDING",
    group: "ga4_reporting",
    name: "Thresholded rows",
    direction: "n/a",
    typicalMagnitude: "undisclosed; triggered by Google Signals",
    alwaysPresent: false,
    notes:
      "Refuse thresholded numbers. subjectToThresholding on the Data API is a hard gate.",
  },
] as const satisfies readonly DiscrepancyCause[];

export type DiscrepancyCauseCode = (typeof DISCREPANCY_CAUSES)[number]["code"];

export function isEuTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  const tz = timeZone.toLowerCase();
  return (
    tz.startsWith("europe/") ||
    tz === "gmt" ||
    tz.includes("london") ||
    tz.includes("dublin") ||
    tz.includes("amsterdam") ||
    tz.includes("berlin") ||
    tz.includes("paris")
  );
}
