/**
 * First-party stateless OAuth broker (D9).
 *
 * Holds GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in process env on
 * agentsean.dev — never in this repository (Google APIs ToS §4(b)).
 *
 * Flow: local connect page POSTs wrap_key + loopback redirect_uri here.
 * Broker runs Google OAuth as a confidential Web client, encrypts tokens
 * with wrap_key, 302s to http://127.0.0.1:<port>/oauth/callback?payload=...
 * The hosted origin never fetches the daemon (Chrome 142 Local Network Access).
 */

import { createHmac } from "node:crypto";
import { CONNECT_SCOPES, GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL } from "./scopes.js";
import { generatePkce } from "./pkce.js";
import { seal, unseal } from "./seal.js";

export type BrokerSecrets = {
  clientId: string;
  clientSecret: string;
  /** HMAC key for the broker's own Google `state` blob. */
  stateKey: Buffer;
};

type BrokerState = {
  redirectUri: string;
  wrapKeyB64: string;
  localState: string;
  verifier: string;
  exp: number;
};

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function fromB64urlJson<T>(raw: string): T {
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
}

function signState(stateKey: Buffer, payload: string): string {
  return createHmac("sha256", stateKey).update(payload).digest("base64url");
}

function encodeBrokerState(secrets: BrokerSecrets, inner: BrokerState): string {
  const payload = b64urlJson(inner);
  return `${payload}.${signState(secrets.stateKey, payload)}`;
}

function decodeBrokerState(secrets: BrokerSecrets, state: string): BrokerState {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) throw new Error("invalid broker state");
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (sig !== signState(secrets.stateKey, payload))
    throw new Error("bad broker state signature");
  const inner = fromB64urlJson<BrokerState>(payload);
  if (inner.exp < Date.now()) throw new Error("broker state expired");
  return inner;
}

export function brokerStartUrl(opts: {
  secrets: BrokerSecrets;
  redirectUri: string;
  wrapKeyB64: string;
  localState: string;
  scopes?: readonly string[] | undefined;
}): string {
  const hostedOrigin = process.env["SEAN_PUBLIC_ORIGIN"]?.replace(/\/$/, "");
  const hosted =
    process.env["SEAN_HOSTED"] === "1" &&
    hostedOrigin &&
    opts.redirectUri.startsWith(hostedOrigin);
  if (!opts.redirectUri.startsWith("http://127.0.0.1:") && !hosted) {
    throw new Error("Broker will only hand tokens to http://127.0.0.1 loopback.");
  }
  const pkce = generatePkce();
  const inner: BrokerState = {
    redirectUri: opts.redirectUri,
    wrapKeyB64: opts.wrapKeyB64,
    localState: opts.localState,
    verifier: pkce.verifier,
    exp: Date.now() + 10 * 60_000,
  };
  const state = encodeBrokerState(opts.secrets, inner);
  const params = new URLSearchParams({
    client_id: opts.secrets.clientId,
    redirect_uri: brokerCallbackPlaceholder(),
    response_type: "code",
    scope: (opts.scopes ?? CONNECT_SCOPES).join(" "),
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Web client redirect registered in Cloud Console, e.g. https://oauth.agentsean.dev/google/callback */
let registeredCallback = "https://oauth.agentsean.dev/google/callback";

export function setBrokerRegisteredCallback(url: string): void {
  registeredCallback = url;
}

export function brokerCallbackPlaceholder(): string {
  return registeredCallback;
}

export async function brokerHandleGoogleCallback(opts: {
  secrets: BrokerSecrets;
  code: string;
  state: string;
  fetch: typeof fetch;
}): Promise<{ location: string }> {
  const inner = decodeBrokerState(opts.secrets, opts.state);
  const body = new URLSearchParams({
    client_id: opts.secrets.clientId,
    client_secret: opts.secrets.clientSecret,
    code: opts.code,
    code_verifier: inner.verifier,
    grant_type: "authorization_code",
    redirect_uri: registeredCallback,
  });
  const response = await opts.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `token exchange failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const json = (await response.json()) as Record<string, unknown>;
  const wrapKey = Buffer.from(inner.wrapKeyB64, "base64url");
  const payload = seal(wrapKey, JSON.stringify(json));
  const loc = new URL(inner.redirectUri);
  loc.searchParams.set("state", inner.localState);
  loc.searchParams.set("payload", payload);
  return { location: loc.toString() };
}

export async function brokerHandleRefresh(opts: {
  secrets: BrokerSecrets;
  refreshToken: string;
  wrapKeyB64: string;
  fetch: typeof fetch;
}): Promise<{ payload: string }> {
  const body = new URLSearchParams({
    client_id: opts.secrets.clientId,
    client_secret: opts.secrets.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await opts.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`broker refresh failed (${response.status})`);
  }
  const json = await response.json();
  const wrapKey = Buffer.from(opts.wrapKeyB64, "base64url");
  return { payload: seal(wrapKey, JSON.stringify(json)) };
}

export function loadBrokerSecrets(
  env: NodeJS.ProcessEnv = process.env,
): BrokerSecrets | null {
  const clientId = env["GOOGLE_CLIENT_ID"]?.trim();
  const clientSecret = env["GOOGLE_CLIENT_SECRET"]?.trim();
  const stateSecret = env["SEAN_BROKER_STATE_KEY"]?.trim();
  if (!clientId || !clientSecret || !stateSecret) return null;
  return {
    clientId,
    clientSecret,
    stateKey: Buffer.from(stateSecret.padEnd(32, "0")).subarray(0, 32),
  };
}

/** Used only by tests that round-trip a sealed payload without HTTP. */
export function sealWithWrapKey(wrapKeyB64: string, value: unknown): string {
  return seal(Buffer.from(wrapKeyB64, "base64url"), JSON.stringify(value));
}

export function peekUnseal(wrapKeyB64: string, payload: string): unknown {
  return JSON.parse(unseal(Buffer.from(wrapKeyB64, "base64url"), payload));
}
