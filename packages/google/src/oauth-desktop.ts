import { CONNECT_SCOPES, GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL } from "./scopes.js";
import { generatePkce, randomState, randomWrapKey } from "./pkce.js";
import type { PendingOauth, PendingStore } from "./pending.js";
import type { ByoClient, StoredGoogleGrant } from "./tokens.js";
import { grantFromTokenResponse } from "./tokens.js";
import { GscTokenError } from "./errors.js";

export function buildGoogleAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  scopes?: readonly string[] | undefined;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: (opts.scopes ?? CONNECT_SCOPES).join(" "),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function startByoAuthorization(opts: {
  client: ByoClient;
  redirectUri: string;
  pending: PendingStore;
  siteId?: string | null | undefined;
  scopes?: readonly string[] | undefined;
}): { authorizationUrl: string; state: string } {
  const pkce = generatePkce();
  const state = randomState();
  const wrap = randomWrapKey();
  const row: PendingOauth = {
    state,
    verifier: pkce.verifier,
    wrapKeyB64: wrap.toString("base64url"),
    mode: "byo",
    createdAt: Date.now(),
    siteId: opts.siteId ?? null,
    redirectUri: opts.redirectUri,
    clientId: opts.client.clientId,
  };
  opts.pending.set(row);
  return {
    state,
    authorizationUrl: buildGoogleAuthUrl({
      clientId: opts.client.clientId,
      redirectUri: opts.redirectUri,
      state,
      challenge: pkce.challenge,
      scopes: opts.scopes,
    }),
  };
}

export async function exchangeByoCode(opts: {
  client: ByoClient;
  pending: PendingOauth;
  code: string;
  fetch: typeof fetch;
  email?: string | null | undefined;
  googleSub?: string | null | undefined;
  prev?: StoredGoogleGrant | null | undefined;
}): Promise<StoredGoogleGrant> {
  if (!opts.pending.verifier) {
    throw new GscTokenError("Missing PKCE verifier for BYO exchange.");
  }
  const body = new URLSearchParams({
    client_id: opts.client.clientId,
    client_secret: opts.client.clientSecret,
    code: opts.code,
    code_verifier: opts.pending.verifier,
    grant_type: "authorization_code",
    redirect_uri: opts.pending.redirectUri,
  });
  const response = await opts.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GscTokenError(
      `Google code exchange failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    refresh_token_expires_in?: number;
    id_token?: string;
  };
  if (!json.access_token)
    throw new GscTokenError("Token response missing access_token.");
  return grantFromTokenResponse(
    { ...json, access_token: json.access_token },
    opts.prev ?? null,
    {
      mode: "byo",
      email: opts.email ?? null,
      googleSub: opts.googleSub ?? null,
    },
  );
}
