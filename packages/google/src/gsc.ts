/**
 * Adapted from OpenSEO `src/server/lib/gscClient.ts` and
 * `src/server/features/gsc/searchAnalytics.ts` (MIT).
 * Copyright (c) 2026 Ben Senescu and contributors.
 *
 * Workers/Better-Auth bindings stripped. Pagination uses the real 25,000
 * rowLimit (OpenSEO capped MCP at 1,000). siteUrl is used verbatim.
 */

import { encodeSiteUrl } from "./scopes.js";
import { GscApiError, gscMessageForStatus } from "./errors.js";
import { bearer, googleFetch, type GoogleHttp } from "./http.js";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const INSPECT_URL =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

export const GSC_ROW_LIMIT_MAX = 25_000;
export const GSC_ROWS_PER_DAY_PER_TYPE = 50_000;
export const GSC_SEARCH_TYPES = [
  "web",
  "image",
  "video",
  "news",
  "discover",
  "googleNews",
] as const;

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscSearchAnalyticsRow = {
  keys?: string[] | undefined;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSearchAnalyticsRequest = {
  startDate: string;
  endDate: string;
  dimensions?: string[] | undefined;
  dimensionFilterGroups?:
    | Array<{
        groupType: "and" | "or";
        filters: Array<{ dimension: string; operator: string; expression: string }>;
      }>
    | undefined;
  rowLimit?: number | undefined;
  startRow?: number | undefined;
  type?: string | undefined;
  dataState?: string | undefined;
  aggregationType?: string | undefined;
};

export type UrlInspectionResult = {
  indexStatusResult?: {
    verdict?: string;
    coverageState?: string;
    robotsTxtState?: string;
    indexingState?: string;
    lastCrawlTime?: string;
    pageFetchState?: string;
    googleCanonical?: string;
    userCanonical?: string;
    crawledAs?: string;
    sitemap?: string[];
    referringUrls?: string[];
  };
  mobileUsabilityResult?: { verdict?: string };
  richResultsResult?: { verdict?: string };
  inspectionResultLink?: string;
};

export type GscClient = {
  listSites: () => Promise<GscSite[]>;
  addSite: (siteUrl: string) => Promise<void>;
  listSitemaps: (siteUrl: string) => Promise<unknown>;
  submitSitemap: (siteUrl: string, feedpath: string) => Promise<void>;
  deleteSitemap: (siteUrl: string, feedpath: string) => Promise<void>;
  querySearchAnalytics: (
    siteUrl: string,
    body: GscSearchAnalyticsRequest,
  ) => Promise<{
    rows: GscSearchAnalyticsRow[];
    firstIncompleteDate: string | null;
  }>;
  querySearchAnalyticsAllPages: (
    siteUrl: string,
    body: Omit<GscSearchAnalyticsRequest, "startRow" | "rowLimit"> & {
      rowLimit?: number | undefined;
    },
  ) => Promise<{
    rows: GscSearchAnalyticsRow[];
    firstIncompleteDate: string | null;
  }>;
  inspectUrl: (
    siteUrl: string,
    inspectionUrl: string,
    languageCode?: string | undefined,
  ) => Promise<UrlInspectionResult | null>;
};

export function createGscClient(opts: {
  http: GoogleHttp;
  getToken: () => Promise<string>;
}): GscClient {
  const request = async <T>(
    api: "gsc.searchAnalytics" | "gsc.urlInspection" | "gsc.other",
    scopeKey: string,
    url: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> => {
    const token = await opts.getToken();
    const hasBody = init?.body !== undefined;
    const res = await googleFetch(opts.http, api, scopeKey, url, {
      method: init?.method ?? "GET",
      headers: bearer(
        token,
        hasBody ? { "Content-Type": "application/json" } : undefined,
      ),
      ...(hasBody ? { body: JSON.stringify(init?.body) } : {}),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GscApiError(res.status, gscMessageForStatus(res.status, body), body);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  };

  return {
    async listSites() {
      const data = await request<{ siteEntry?: GscSite[] }>(
        "gsc.other",
        "sites",
        `${GSC_API_BASE}/sites`,
      );
      return data.siteEntry ?? [];
    },

    async addSite(siteUrl) {
      await request(
        "gsc.other",
        siteUrl,
        `${GSC_API_BASE}/sites/${encodeSiteUrl(siteUrl)}`,
        { method: "PUT", body: {} },
      );
    },

    async listSitemaps(siteUrl) {
      return request(
        "gsc.other",
        siteUrl,
        `${GSC_API_BASE}/sites/${encodeSiteUrl(siteUrl)}/sitemaps`,
      );
    },

    async submitSitemap(siteUrl, feedpath) {
      await request(
        "gsc.other",
        siteUrl,
        `${GSC_API_BASE}/sites/${encodeSiteUrl(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
        { method: "PUT", body: {} },
      );
    },

    async deleteSitemap(siteUrl, feedpath) {
      await request(
        "gsc.other",
        siteUrl,
        `${GSC_API_BASE}/sites/${encodeSiteUrl(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
        { method: "DELETE" },
      );
    },

    async querySearchAnalytics(siteUrl, body) {
      const data = await request<{
        rows?: GscSearchAnalyticsRow[];
        responseAggregationType?: string;
        metadata?: { firstIncompleteDate?: string };
      }>(
        "gsc.searchAnalytics",
        siteUrl,
        `${GSC_API_BASE}/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          body: {
            ...body,
            rowLimit: Math.min(body.rowLimit ?? GSC_ROW_LIMIT_MAX, GSC_ROW_LIMIT_MAX),
          },
        },
      );
      return {
        rows: data.rows ?? [],
        firstIncompleteDate: data.metadata?.firstIncompleteDate ?? null,
      };
    },

    async querySearchAnalyticsAllPages(siteUrl, body) {
      const rowLimit = Math.min(body.rowLimit ?? GSC_ROW_LIMIT_MAX, GSC_ROW_LIMIT_MAX);
      const rows: GscSearchAnalyticsRow[] = [];
      let startRow = 0;
      let firstIncompleteDate: string | null = null;
      for (;;) {
        const page = await this.querySearchAnalytics(siteUrl, {
          ...body,
          rowLimit,
          startRow,
        });
        if (page.firstIncompleteDate) firstIncompleteDate = page.firstIncompleteDate;
        rows.push(...page.rows);
        if (page.rows.length < rowLimit) break;
        startRow += page.rows.length;
        if (startRow >= GSC_ROWS_PER_DAY_PER_TYPE) break;
      }
      return { rows, firstIncompleteDate };
    },

    async inspectUrl(siteUrl, inspectionUrl, languageCode) {
      const data = await request<{ inspectionResult?: UrlInspectionResult }>(
        "gsc.urlInspection",
        siteUrl,
        INSPECT_URL,
        {
          method: "POST",
          body: {
            siteUrl,
            inspectionUrl,
            ...(languageCode ? { languageCode } : {}),
          },
        },
      );
      return data.inspectionResult ?? null;
    },
  };
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function subtractUtcDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() - days);
  return n;
}

export function subtractUtcMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const daysInTarget = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, daysInTarget));
  return d;
}

/** final data trails ~2–3 days. Never hardcode lag when metadata is present. */
export function defaultGscWindow(today = new Date()): {
  startDate: string;
  endDate: string;
} {
  const end = subtractUtcDays(today, 3);
  const start = subtractUtcMonths(end, 16);
  return { startDate: ymd(start), endDate: ymd(end) };
}

export function monthChunks(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string }[] {
  const chunks: { startDate: string; endDate: string }[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    const monthEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
    );
    const sliceEnd = monthEnd < end ? monthEnd : end;
    chunks.push({ startDate: ymd(cursor), endDate: ymd(sliceEnd) });
    cursor = new Date(
      Date.UTC(
        sliceEnd.getUTCFullYear(),
        sliceEnd.getUTCMonth(),
        sliceEnd.getUTCDate() + 1,
      ),
    );
  }
  return chunks;
}
