import { Agent, request } from "undici";
import { acceptEncodingHeader, decodeBody } from "./decode.js";
import { SEAN_UA } from "./ua.js";
import type { RedirectHop } from "./types.js";

export const MAX_BODY = 10 * 1024 * 1024;
export const HTML_GOOGLE_CAP = 2 * 1024 * 1024;
export const RESOURCE_GOOGLE_CAP = 15 * 1024 * 1024;
const PAGE_REDIRECT_HOPS = 5;
const GOOGLE_REDIRECT_HOPS = 10;
const ROBOTS_REDIRECT_HOPS = 5;

export type FetchResult = {
  url: string;
  finalUrl: string;
  statusCode: number | null;
  error: string | null;
  headers: Record<string, string>;
  body: Buffer;
  decoded: Buffer;
  contentType: string;
  ttfbMs: number;
  totalMs: number;
  wireBytes: number;
  decodedBytes: number;
  redirectChain: RedirectHop[];
  redirectLoop: boolean;
  exceedsGoogleRedirectLimit: boolean;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
};

export function createCrawlerAgent(connectionsPerOrigin = 2): Agent {
  return new Agent({
    connections: connectionsPerOrigin,
    pipelining: 1,
    keepAliveTimeout: 10_000,
    keepAliveMaxTimeout: 600_000,
    headersTimeout: 15_000,
    bodyTimeout: 30_000,
    allowH2: true,
    maxResponseSize: MAX_BODY,
    clientTtl: 60_000,
    connect: { rejectUnauthorized: true },
  });
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

export async function fetchUrl(
  url: string,
  opts: {
    agent: Agent;
    userAgent?: string | undefined;
    timeoutMs?: number | undefined;
    maxRedirects?: number | undefined;
    method?: "GET" | "HEAD" | undefined;
    etag?: string | undefined;
    lastModified?: string | undefined;
    accept?: string | undefined;
  },
): Promise<FetchResult> {
  const userAgent = opts.userAgent ?? SEAN_UA;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxRedirects = opts.maxRedirects ?? PAGE_REDIRECT_HOPS;
  const chain: RedirectHop[] = [];
  const seen = new Set<string>();
  let current = url;
  let loop = false;
  let exceeds = false;
  const t0 = performance.now();
  let ttfbMs = 0;

  for (let hop = 0; hop <= GOOGLE_REDIRECT_HOPS; hop++) {
    if (seen.has(current)) {
      loop = true;
      break;
    }
    seen.add(current);
    if (hop > maxRedirects) {
      exceeds = hop > GOOGLE_REDIRECT_HOPS;
      break;
    }

    const headers: Record<string, string> = {
      "user-agent": userAgent,
      accept:
        opts.accept ??
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-encoding": acceptEncodingHeader(),
    };
    if (opts.etag) headers["if-none-match"] = opts.etag;
    if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;

    const result = await attempt(current, {
      agent: opts.agent,
      method: opts.method ?? "GET",
      headers,
      timeoutMs,
    });
    if (ttfbMs === 0) ttfbMs = result.ttfbMs;

    const location = result.headers.location ?? null;
    chain.push({ url: current, status: result.statusCode ?? 0, location });

    if (
      result.statusCode !== null &&
      result.statusCode >= 300 &&
      result.statusCode < 400 &&
      location
    ) {
      current = new URL(location, current).href;
      if (hop + 1 > GOOGLE_REDIRECT_HOPS) {
        exceeds = true;
        break;
      }
      continue;
    }

    const totalMs = performance.now() - t0;
    return {
      url,
      finalUrl: current,
      statusCode: result.statusCode,
      error: result.error,
      headers: result.headers,
      body: result.wire,
      decoded: result.decoded,
      contentType: result.headers["content-type"] ?? "",
      ttfbMs,
      totalMs,
      wireBytes: result.wire.length,
      decodedBytes: result.decoded.length,
      redirectChain: chain,
      redirectLoop: loop,
      exceedsGoogleRedirectLimit: exceeds,
      etag: result.headers.etag ?? null,
      lastModified: result.headers["last-modified"] ?? null,
      notModified: result.statusCode === 304,
    };
  }

  return {
    url,
    finalUrl: current,
    statusCode: chain.at(-1)?.status ?? null,
    error: loop ? "redirect_loop" : exceeds ? "redirect_limit" : "redirect",
    headers: {},
    body: Buffer.alloc(0),
    decoded: Buffer.alloc(0),
    contentType: "",
    ttfbMs,
    totalMs: performance.now() - t0,
    wireBytes: 0,
    decodedBytes: 0,
    redirectChain: chain,
    redirectLoop: loop,
    exceedsGoogleRedirectLimit: exceeds,
    etag: null,
    lastModified: null,
    notModified: false,
  };
}

async function attempt(
  url: string,
  opts: {
    agent: Agent;
    method: "GET" | "HEAD";
    headers: Record<string, string>;
    timeoutMs: number;
  },
): Promise<{
  statusCode: number | null;
  headers: Record<string, string>;
  wire: Buffer;
  decoded: Buffer;
  error: string | null;
  ttfbMs: number;
}> {
  let lastError: string | null = null;
  for (let attemptNo = 1; attemptNo <= 3; attemptNo++) {
    const t0 = performance.now();
    try {
      const res = await request(url, {
        method: opts.method,
        dispatcher: opts.agent,
        headers: opts.headers,
        headersTimeout: opts.timeoutMs,
        bodyTimeout: opts.timeoutMs,
      });
      const ttfbMs = performance.now() - t0;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === "string") headers[k.toLowerCase()] = v;
        else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(", ");
      }
      const wire: Buffer = Buffer.from(
        new Uint8Array(await res.body.arrayBuffer()),
      ) as Buffer;
      let decoded = wire;
      try {
        decoded = await decodeBody(wire, headers["content-encoding"]);
      } catch {
        decoded = wire;
      }
      if (RETRYABLE_STATUS.has(res.statusCode) && attemptNo < 3) {
        lastError = `http_${res.statusCode}`;
        await backoff(attemptNo, headers["retry-after"]);
        continue;
      }
      return {
        statusCode: res.statusCode,
        headers,
        wire,
        decoded,
        error: null,
        ttfbMs,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attemptNo < 3) {
        await backoff(attemptNo, undefined);
        continue;
      }
      return {
        statusCode: null,
        headers: {},
        wire: Buffer.alloc(0),
        decoded: Buffer.alloc(0),
        error: lastError,
        ttfbMs: performance.now() - t0,
      };
    }
  }
  return {
    statusCode: null,
    headers: {},
    wire: Buffer.alloc(0),
    decoded: Buffer.alloc(0),
    error: lastError,
    ttfbMs: 0,
  };
}

async function backoff(n: number, retryAfter: string | undefined): Promise<void> {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      await sleep(Math.min(seconds * 1000, 300_000));
      return;
    }
    const when = Date.parse(retryAfter);
    if (!Number.isNaN(when)) {
      await sleep(Math.min(Math.max(0, when - Date.now()), 300_000));
      return;
    }
  }
  const cap = Math.min(1000 * 2 ** (n - 1), 60_000);
  await sleep(Math.random() * cap);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const ROBOTS_MAX_REDIRECTS = ROBOTS_REDIRECT_HOPS;
