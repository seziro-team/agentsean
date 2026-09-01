/**
 * Adapted from OpenSEO `src/server/lib/ga4Client.ts` and `ga4Errors.ts` (MIT).
 * Copyright (c) 2026 Ben Senescu and contributors.
 *
 * Sparse-response handling kept: ProtoJSON omits default scalars. Workers
 * bindings and Better Auth token minting stripped.
 */

import {
  Ga4AdminApiError,
  Ga4DataApiError,
  ga4AdminMessageForStatus,
  ga4DataMessageForStatus,
} from "./errors.js";
import { bearer, googleFetch, type GoogleHttp } from "./http.js";

const GA4_ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const GA4_DATA = "https://analyticsdata.googleapis.com/v1beta";

export type Ga4PropertySummary = {
  propertyId: string;
  displayName: string;
  accountId: string;
  accountDisplayName: string;
};

export type Ga4Property = {
  name: string;
  displayName: string;
  timeZone: string;
  currencyCode: string;
};

export type Ga4ReportRow = {
  dimensionValues: string[];
  metricValues: number[];
};

export type Ga4Client = {
  listProperties: () => Promise<Ga4PropertySummary[]>;
  getProperty: (propertyId: string) => Promise<Ga4Property>;
  runReport: (opts: {
    propertyId: string;
    startDate: string;
    endDate: string;
    dimensions: string[];
    metrics: string[];
    dimensionFilter?: unknown;
    limit?: number | undefined;
  }) => Promise<{ rows: Ga4ReportRow[]; tokensConsumed: number }>;
};

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "value" in value) {
    return Number((value as { value: unknown }).value) || 0;
  }
  return 0;
}

export function createGa4Client(opts: {
  http: GoogleHttp;
  getToken: () => Promise<string>;
}): Ga4Client {
  const adminGet = async <T>(path: string): Promise<T> => {
    const token = await opts.getToken();
    const res = await googleFetch(opts.http, "ga4.data", "admin", `${GA4_ADMIN}/${path}`, {
      headers: bearer(token),
    });
    if (!res.ok) {
      throw new Ga4AdminApiError(res.status, ga4AdminMessageForStatus(res.status));
    }
    return (await res.json()) as T;
  };

  return {
    async listProperties() {
      const out: Ga4PropertySummary[] = [];
      let pageToken: string | undefined;
      for (let i = 0; i < 100; i++) {
        const q = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
        const data = await adminGet<{
          accountSummaries?: Array<{
            account?: string;
            displayName?: string;
            propertySummaries?: Array<{ property?: string; displayName?: string }>;
          }>;
          nextPageToken?: string;
        }>(`accountSummaries${q}`);
        for (const acc of data.accountSummaries ?? []) {
          for (const p of acc.propertySummaries ?? []) {
            if (!p.property) continue;
            out.push({
              propertyId: p.property,
              displayName: p.displayName ?? p.property,
              accountId: acc.account ?? "",
              accountDisplayName: acc.displayName ?? "",
            });
          }
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
      return out;
    },

    async getProperty(propertyId) {
      const id = propertyId.startsWith("properties/")
        ? propertyId
        : `properties/${propertyId}`;
      const data = await adminGet<{
        name?: string;
        displayName?: string;
        timeZone?: string;
        currencyCode?: string;
      }>(id);
      return {
        name: data.name ?? id,
        displayName: data.displayName ?? id,
        timeZone: data.timeZone ?? "UTC",
        currencyCode: data.currencyCode ?? "USD",
      };
    },

    async runReport(input) {
      const token = await opts.getToken();
      const id = input.propertyId.startsWith("properties/")
        ? input.propertyId
        : `properties/${input.propertyId}`;
      const body = {
        dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
        dimensions: input.dimensions.map((name) => ({ name })),
        metrics: input.metrics.map((name) => ({ name })),
        limit: String(input.limit ?? 10000),
        ...(input.dimensionFilter ? { dimensionFilter: input.dimensionFilter } : {}),
      };
      const res = await googleFetch(
        opts.http,
        "ga4.data",
        id,
        `${GA4_DATA}/${id}:runReport`,
        {
          method: "POST",
          headers: bearer(token, { "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let retryAfter: number | null = null;
        const ra = res.headers.get("retry-after");
        if (ra) retryAfter = Number(ra) || null;
        throw new Ga4DataApiError(
          res.status,
          ga4DataMessageForStatus(res.status),
          retryAfter,
          text.slice(0, 300),
        );
      }
      const data = (await res.json()) as {
        rows?: Array<{
          dimensionValues?: Array<{ value?: string }>;
          metricValues?: Array<{ value?: string }>;
        }>;
        metadata?: { dataLossFromOtherRow?: boolean };
        propertyQuota?: {
          tokensPerHour?: { consumed?: number };
          tokensPerDay?: { consumed?: number };
        };
      };
      // Sparse: omitted rows mean zero. Empty array is a valid sparse response.
      const rows: Ga4ReportRow[] = (data.rows ?? []).map((r) => ({
        dimensionValues: (r.dimensionValues ?? []).map((d) => d.value ?? ""),
        metricValues: (r.metricValues ?? []).map((m) => num(m.value)),
      }));
      const tokensConsumed = data.propertyQuota?.tokensPerHour?.consumed ?? 1;
      return { rows, tokensConsumed };
    },
  };
}

export function googleOrganicFilter(): unknown {
  return {
    andGroup: {
      expressions: [
        {
          filter: {
            fieldName: "sessionSource",
            stringFilter: { matchType: "EXACT", value: "google" },
          },
        },
        {
          filter: {
            fieldName: "sessionMedium",
            stringFilter: { matchType: "EXACT", value: "organic" },
          },
        },
      ],
    },
  };
}
