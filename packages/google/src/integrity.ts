/** Data-integrity landmines that must be encoded now (PLAN.md Phase 2). */

export const IMPRESSIONS_BUG_BEGIN = "2025-05-13";
export const IMPRESSIONS_BUG_END = "2026-04-27";
export const NUM100_BEGIN = "2025-09-10";
export const NUM100_END = "2025-09-14";
export const NUM100_STRADDLE = "2025-09-12";

export type GscMetric = "clicks" | "impressions" | "ctr" | "position";

export const DEFAULT_METRIC: GscMetric = "clicks";

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function impressionsContaminated(startDate: string, endDate: string): boolean {
  return rangesOverlap(startDate, endDate, IMPRESSIONS_BUG_BEGIN, IMPRESSIONS_BUG_END);
}

export function num100Straddle(startDate: string, endDate: string): boolean {
  return startDate <= NUM100_STRADDLE && endDate >= NUM100_STRADDLE;
}

export type MetricDecision = {
  metric: GscMetric;
  allowed: boolean;
  reasons: string[];
};

/**
 * Default every metric to clicks. Impressions/CTR/position are blocked across
 * the logging-error window and across the &num=100 removal.
 */
export function decideMetric(
  requested: GscMetric,
  startDate: string,
  endDate: string,
): MetricDecision {
  const reasons: string[] = [];
  if (requested === "clicks") {
    return { metric: "clicks", allowed: true, reasons };
  }
  if (impressionsContaminated(startDate, endDate)) {
    reasons.push(
      `Impressions logging error ${IMPRESSIONS_BUG_BEGIN} → ${IMPRESSIONS_BUG_END} overlaps this window. Clicks are unaffected; impressions, CTR and average position are not.`,
    );
  }
  if (
    (requested === "impressions" || requested === "position") &&
    num100Straddle(startDate, endDate)
  ) {
    reasons.push(
      `&num=100 removal ${NUM100_BEGIN} → ${NUM100_END} straddles this window. Naive year-over-year impression comparison is a false decay alert.`,
    );
  }
  if (reasons.length > 0) {
    return { metric: "clicks", allowed: false, reasons };
  }
  return { metric: requested, allowed: true, reasons };
}

export function preferredMetric(
  requested: GscMetric | undefined,
  startDate: string,
  endDate: string,
): MetricDecision {
  return decideMetric(requested ?? DEFAULT_METRIC, startDate, endDate);
}

export function annotateSeries<T extends { date: string }>(
  rows: T[],
  overlapping: { begin: string; end: string | null; title: string }[],
): (T & { annotations: string[] })[] {
  return rows.map((row) => {
    const annotations = overlapping
      .filter((c) => {
        const e = c.end ?? c.begin;
        return c.begin <= row.date && row.date <= e;
      })
      .map((c) => c.title);
    return { ...row, annotations };
  });
}
