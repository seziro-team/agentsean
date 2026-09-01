/**
 * Adapted from OpenSEO `src/server/lib/gscErrors.ts` and `ga4Errors.ts` (MIT).
 * Copyright (c) 2026 Ben Senescu and contributors.
 *
 * Workers/Better-Auth bindings stripped. Status-driven user-facing messages kept.
 */

export class GscApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "GscApiError";
  }
}

export class GscTokenError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GscTokenError";
  }
}

export class GscNotConnectedError extends Error {
  constructor(public readonly siteId: string) {
    super("Search Console is not connected for this site");
    this.name = "GscNotConnectedError";
  }
}

export class Ga4AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "Ga4AdminApiError";
  }
}

export class Ga4TokenError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "Ga4TokenError";
  }
}

export class Ga4DataApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
    public readonly upstreamReason: string | null = null,
  ) {
    super(message);
    this.name = "Ga4DataApiError";
  }
}

export class Ga4NotConnectedError extends Error {
  constructor(public readonly siteId: string) {
    super("Google Analytics is not connected for this site");
    this.name = "Ga4NotConnectedError";
  }
}

export class QuotaExceededError extends Error {
  constructor(
    public readonly api: string,
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export function gscMessageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Search Console denied access to this property (no verified permission, or the connection was revoked).";
  }
  if (status === 429) {
    return "Search Console rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Search Console property not found. It may have been removed in Search Console.";
  }
  return `Search Console API error (${status}): ${body.slice(0, 300)}`;
}

export function ga4AdminMessageForStatus(status: number): string {
  if (status === 401) return "Google Analytics connection expired.";
  if (status === 403) {
    return "Google Analytics denied access. Check the account's property access and enabled APIs.";
  }
  if (status === 429) return "Google Analytics rate limit reached.";
  return `Google Analytics Admin API error (${status}).`;
}

export function ga4DataMessageForStatus(status: number): string {
  if (status === 401) return "Google Analytics connection expired.";
  if (status === 403) return "Google Analytics Data API denied access.";
  if (status === 429) return "Google Analytics Data API quota exhausted.";
  return `Google Analytics Data API error (${status}).`;
}
