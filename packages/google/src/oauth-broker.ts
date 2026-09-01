import { CONNECT_SCOPES } from "./scopes.js";
import { randomState, randomWrapKey } from "./pkce.js";
import { unseal } from "./seal.js";
import type { PendingOauth, PendingStore } from "./pending.js";
import { grantFromTokenResponse, type StoredGoogleGrant } from "./tokens.js";
import { GscTokenError } from "./errors.js";

/**
 * Local origin POSTs (or navigates) to the hosted broker. The hosted page never
 * talks to the daemon — Chrome 142+ Local Network Access would prompt and break.
 * Tokens come back on a 302 to http://127.0.0.1:<port>/oauth/callback.
 */
export function startBrokerAuthorization(opts: {
  brokerUrl: string;
  redirectUri: string;
  pending: PendingStore;
  siteId?: string | null | undefined;
  scopes?: readonly string[] | undefined;
}): { authorizationUrl: string; state: string; wrapKeyB64: string } {
  const state = randomState();
  const wrap = randomWrapKey();
  const wrapKeyB64 = wrap.toString("base64url");
  const row: PendingOauth = {
    state,
    verifier: null,
    wrapKeyB64,
    mode: "broker",
    createdAt: Date.now(),
    siteId: opts.siteId ?? null,
    redirectUri: opts.redirectUri,
    clientId: null,
  };
  opts.pending.set(row);
  const params = new URLSearchParams({
    redirect_uri: opts.redirectUri,
    state,
    wrap_key: wrapKeyB64,
    scope: (opts.scopes ?? CONNECT_SCOPES).join(" "),
  });
  const base = opts.brokerUrl.replace(/\/$/, "");
  return {
    state,
    wrapKeyB64,
    authorizationUrl: `${base}/google/start?${params.toString()}`,
  };
}

export type BrokerHandoff = {
  access_token: string;
  refresh_token?: string | undefined;
  expires_in?: number | undefined;
  scope?: string | undefined;
  token_type?: string | undefined;
  refresh_token_expires_in?: number | undefined;
  email?: string | undefined;
  sub?: string | undefined;
};

export function openBrokerHandoff(
  pending: PendingOauth,
  payload: string,
): BrokerHandoff {
  const key = Buffer.from(pending.wrapKeyB64, "base64url");
  let parsed: BrokerHandoff;
  try {
    parsed = JSON.parse(unseal(key, payload)) as BrokerHandoff;
  } catch (err) {
    throw new GscTokenError("Could not unseal broker handoff.", err);
  }
  if (!parsed.access_token) {
    throw new GscTokenError("Broker handoff missing access_token.");
  }
  return parsed;
}

export function grantFromBrokerHandoff(
  pending: PendingOauth,
  payload: string,
  prev: StoredGoogleGrant | null,
): StoredGoogleGrant {
  const handoff = openBrokerHandoff(pending, payload);
  return grantFromTokenResponse(handoff, prev, {
    mode: "broker",
    email: handoff.email ?? null,
    googleSub: handoff.sub ?? null,
  });
}

export async function brokerRefreshAccessToken(
  brokerUrl: string,
  refreshToken: string,
  wrapKey: Buffer,
  fetchFn: typeof fetch,
): Promise<{
  access_token: string;
  expires_in?: number | undefined;
  refresh_token?: string | undefined;
  refresh_token_expires_in?: number | undefined;
  scope?: string | undefined;
}> {
  const res = await fetchFn(`${brokerUrl.replace(/\/$/, "")}/google/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      wrap_key: wrapKey.toString("base64url"),
    }),
  });
  if (!res.ok) {
    throw new GscTokenError(`Broker refresh failed (${res.status}).`);
  }
  const json = (await res.json()) as { payload?: string };
  if (!json.payload) throw new GscTokenError("Broker refresh missing payload.");
  const opened = JSON.parse(unseal(wrapKey, json.payload)) as BrokerHandoff;
  if (!opened.access_token) throw new GscTokenError("Broker refresh missing access_token.");
  return opened;
}
