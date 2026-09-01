import { Secret, type CredentialStore } from "@agentsean/credentials";
import {
  GOOGLE_API_KEY_ACCOUNT,
  GOOGLE_BYO_CLIENT_ACCOUNT,
  GOOGLE_OAUTH_ACCOUNT,
  GOOGLE_TOKEN_URL,
} from "./scopes.js";
import { GscTokenError } from "./errors.js";

export type OAuthMode = "broker" | "byo";

export type StoredGoogleGrant = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string;
  tokenType: string;
  issuedAt: string;
  refreshTokenExpiresAt: string | null;
  email: string | null;
  googleSub: string | null;
  mode: OAuthMode;
  testingModeSuspected: boolean;
};

export type ByoClient = {
  clientId: string;
  clientSecret: string;
};

export function parseGrant(raw: string): StoredGoogleGrant {
  const parsed = JSON.parse(raw) as StoredGoogleGrant;
  if (!parsed.accessToken || !parsed.refreshToken) {
    throw new GscTokenError("Stored Google grant is incomplete.");
  }
  return parsed;
}

export async function loadGrant(
  store: CredentialStore,
): Promise<StoredGoogleGrant | null> {
  const secret = await store.get(GOOGLE_OAUTH_ACCOUNT);
  if (!secret) return null;
  return parseGrant(secret.unwrap());
}

export async function saveGrant(
  store: CredentialStore,
  grant: StoredGoogleGrant,
): Promise<void> {
  await store.set(GOOGLE_OAUTH_ACCOUNT, new Secret(JSON.stringify(grant)));
}

export async function loadByoClient(store: CredentialStore): Promise<ByoClient | null> {
  const secret = await store.get(GOOGLE_BYO_CLIENT_ACCOUNT);
  if (!secret) return null;
  const parsed = JSON.parse(secret.unwrap()) as ByoClient;
  if (!parsed.clientId || !parsed.clientSecret) return null;
  return parsed;
}

export async function saveByoClient(
  store: CredentialStore,
  client: ByoClient,
): Promise<void> {
  await store.set(GOOGLE_BYO_CLIENT_ACCOUNT, new Secret(JSON.stringify(client)));
}

export async function loadApiKey(store: CredentialStore): Promise<string | null> {
  const secret = await store.get(GOOGLE_API_KEY_ACCOUNT);
  return secret?.unwrap() ?? null;
}

export async function saveApiKey(store: CredentialStore, key: string): Promise<void> {
  await store.set(GOOGLE_API_KEY_ACCOUNT, new Secret(key));
}

export function testingModeFromTokenResponse(res: {
  refresh_token_expires_in?: number | undefined;
}): boolean {
  const exp = res.refresh_token_expires_in;
  if (typeof exp !== "number") return false;
  return exp > 0 && exp <= 7 * 24 * 3600 + 60;
}

export function grantFromTokenResponse(
  res: {
    access_token: string;
    refresh_token?: string | undefined;
    expires_in?: number | undefined;
    scope?: string | undefined;
    token_type?: string | undefined;
    refresh_token_expires_in?: number | undefined;
  },
  prev: StoredGoogleGrant | null,
  extras: {
    mode: OAuthMode;
    email: string | null;
    googleSub: string | null;
    now?: Date | undefined;
  },
): StoredGoogleGrant {
  const now = extras.now ?? new Date();
  const refresh = res.refresh_token ?? prev?.refreshToken;
  if (!refresh) {
    throw new GscTokenError(
      "Google did not return a refresh token. Reconnect with prompt=consent.",
    );
  }
  const expiresIn = res.expires_in ?? 3600;
  const testing =
    testingModeFromTokenResponse(res) || (prev?.testingModeSuspected ?? false);
  const refreshExp =
    typeof res.refresh_token_expires_in === "number"
      ? new Date(now.getTime() + res.refresh_token_expires_in * 1000).toISOString()
      : (prev?.refreshTokenExpiresAt ?? null);
  return {
    accessToken: res.access_token,
    refreshToken: refresh,
    expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    scopes: res.scope ?? prev?.scopes ?? "",
    tokenType: res.token_type ?? "Bearer",
    issuedAt: prev?.issuedAt ?? now.toISOString(),
    refreshTokenExpiresAt: refreshExp,
    email: extras.email ?? prev?.email ?? null,
    googleSub: extras.googleSub ?? prev?.googleSub ?? null,
    mode: extras.mode,
    testingModeSuspected: testing,
  };
}

export async function refreshAccessToken(
  grant: StoredGoogleGrant,
  opts: {
    fetch: typeof fetch;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    brokerRefresh?:
      | ((refreshToken: string) => Promise<{
          access_token: string;
          expires_in?: number | undefined;
          refresh_token?: string | undefined;
          refresh_token_expires_in?: number | undefined;
          scope?: string | undefined;
        }>)
      | undefined;
  },
): Promise<StoredGoogleGrant> {
  if (grant.mode === "broker") {
    if (!opts.brokerRefresh) {
      throw new GscTokenError("Broker refresh is not configured.");
    }
    const res = await opts.brokerRefresh(grant.refreshToken);
    return grantFromTokenResponse(res, grant, {
      mode: "broker",
      email: grant.email,
      googleSub: grant.googleSub,
    });
  }
  if (!opts.clientId || !opts.clientSecret) {
    throw new GscTokenError("BYO client_id and client_secret are required to refresh.");
  }
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: grant.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await opts.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GscTokenError(
      `Google token refresh failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
  };
  if (!json.access_token)
    throw new GscTokenError("Refresh response missing access_token.");
  return grantFromTokenResponse({ ...json, access_token: json.access_token }, grant, {
    mode: "byo",
    email: grant.email,
    googleSub: grant.googleSub,
  });
}

export function accessTokenValid(grant: StoredGoogleGrant, now = new Date()): boolean {
  return Date.parse(grant.expiresAt) - now.getTime() > 60_000;
}

export async function validAccessToken(
  store: CredentialStore,
  refreshOpts: Parameters<typeof refreshAccessToken>[1],
): Promise<string> {
  const grant = await loadGrant(store);
  if (!grant) throw new GscTokenError("Google is not connected.");
  if (accessTokenValid(grant)) return grant.accessToken;
  const next = await refreshAccessToken(grant, refreshOpts);
  await saveGrant(store, next);
  return next.accessToken;
}
