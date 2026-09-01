import { googleFetch, type GoogleHttp } from "./http.js";

const CRUX = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const CRUX_HISTORY =
  "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";

export type CruxFormFactor = "PHONE" | "DESKTOP" | "TABLET" | "ALL";

export type CruxMetrics = {
  lcpP75: number | null;
  inpP75: number | null;
  clsP75: number | null;
  ttfbP75: number | null;
  fcpP75: number | null;
};

export type CruxRecord = CruxMetrics & {
  identifier: string;
  identifierKind: "url" | "origin";
  formFactor: CruxFormFactor;
  collectionDate: string;
  insufficientTraffic: boolean;
  sourceApi: "crux" | "crux_history";
  raw: unknown;
};

function p75(metrics: unknown, name: string): number | null {
  if (!metrics || typeof metrics !== "object") return null;
  const m = (metrics as Record<string, { percentiles?: { p75?: number } }>)[name];
  const v = m?.percentiles?.p75;
  return typeof v === "number" ? v : null;
}

function metricsOf(obj: unknown): CruxMetrics {
  return {
    lcpP75: p75(obj, "largest_contentful_paint"),
    inpP75: p75(obj, "interaction_to_next_paint"),
    clsP75: p75(obj, "cumulative_layout_shift"),
    ttfbP75: p75(obj, "experimental_time_to_first_byte"),
    fcpP75: p75(obj, "first_contentful_paint"),
  };
}

async function queryCrux(opts: {
  http: GoogleHttp;
  apiKey: string;
  body: Record<string, unknown>;
  history: boolean;
}): Promise<{ status: number; json: unknown }> {
  const endpoint = opts.history ? CRUX_HISTORY : CRUX;
  const res = await googleFetch(
    opts.http,
    "crux",
    "project",
    `${endpoint}?key=${encodeURIComponent(opts.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
    },
  );
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/**
 * URL-level 404 is normal (insufficient traffic), not an error.
 * Fall back to origin-level.
 */
export async function queryCruxWithFallback(opts: {
  http: GoogleHttp;
  apiKey: string;
  url: string;
  origin: string;
  formFactor?: CruxFormFactor | undefined;
}): Promise<CruxRecord> {
  const formFactor = opts.formFactor ?? "PHONE";
  const today = new Date().toISOString().slice(0, 10);
  const ff = formFactor === "ALL" ? undefined : formFactor;

  const urlBody: Record<string, unknown> = { url: opts.url };
  if (ff) urlBody.formFactor = ff;
  const urlHit = await queryCrux({
    http: opts.http,
    apiKey: opts.apiKey,
    body: urlBody,
    history: false,
  });
  if (urlHit.status === 200) {
    const rec = urlHit.json as { record?: { metrics?: unknown } };
    return {
      identifier: opts.url,
      identifierKind: "url",
      formFactor,
      collectionDate: today,
      insufficientTraffic: false,
      sourceApi: "crux",
      raw: urlHit.json,
      ...metricsOf(rec.record?.metrics),
    };
  }

  const originBody: Record<string, unknown> = { origin: opts.origin };
  if (ff) originBody.formFactor = ff;
  const originHit = await queryCrux({
    http: opts.http,
    apiKey: opts.apiKey,
    body: originBody,
    history: false,
  });
  if (originHit.status === 200) {
    const rec = originHit.json as { record?: { metrics?: unknown } };
    return {
      identifier: opts.origin,
      identifierKind: "origin",
      formFactor,
      collectionDate: today,
      insufficientTraffic: urlHit.status === 404,
      sourceApi: "crux",
      raw: originHit.json,
      ...metricsOf(rec.record?.metrics),
    };
  }

  return {
    identifier: opts.origin,
    identifierKind: "origin",
    formFactor,
    collectionDate: today,
    insufficientTraffic: true,
    sourceApi: "crux",
    raw: originHit.json,
    lcpP75: null,
    inpP75: null,
    clsP75: null,
    ttfbP75: null,
    fcpP75: null,
  };
}

export async function queryCruxHistory(opts: {
  http: GoogleHttp;
  apiKey: string;
  origin: string;
  formFactor?: CruxFormFactor | undefined;
  collectionPeriodCount?: number | undefined;
}): Promise<unknown> {
  const body: Record<string, unknown> = {
    origin: opts.origin,
    collectionPeriodCount: opts.collectionPeriodCount ?? 25,
  };
  if (opts.formFactor && opts.formFactor !== "ALL") body.formFactor = opts.formFactor;
  const hit = await queryCrux({
    http: opts.http,
    apiKey: opts.apiKey,
    body,
    history: true,
  });
  return hit.json;
}
