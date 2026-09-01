import { DEFAULT_BROKER_URL } from "./scopes.js";
import type { ByoClient } from "./tokens.js";

export type GoogleOAuthConfig = {
  mode: "broker" | "byo";
  brokerUrl: string;
  byo: ByoClient | null;
  apiKey: string | null;
};

export function resolveOAuthConfig(env: NodeJS.ProcessEnv = process.env): {
  byo: ByoClient | null;
  brokerUrl: string;
  apiKey: string | null;
} {
  const clientId =
    env["GOOGLE_CLIENT_ID"]?.trim() || env["SEAN_GOOGLE_CLIENT_ID"]?.trim();
  const clientSecret =
    env["GOOGLE_CLIENT_SECRET"]?.trim() || env["SEAN_GOOGLE_CLIENT_SECRET"]?.trim();
  const byo =
    clientId && clientSecret ? { clientId, clientSecret } : null;
  const brokerUrl = (
    env["SEAN_OAUTH_BROKER_URL"]?.trim() || DEFAULT_BROKER_URL
  ).replace(/\/$/, "");
  const apiKey =
    env["GOOGLE_API_KEY"]?.trim() || env["SEAN_GOOGLE_API_KEY"]?.trim() || null;
  return { byo, brokerUrl, apiKey };
}

export function parseDesktopClientJson(raw: string): ByoClient {
  const parsed = JSON.parse(raw) as {
    installed?: { client_id?: string; client_secret?: string };
    web?: { client_id?: string; client_secret?: string };
    client_id?: string;
    client_secret?: string;
  };
  const installed = parsed.installed ?? parsed.web;
  const clientId = parsed.client_id ?? installed?.client_id;
  const clientSecret = parsed.client_secret ?? installed?.client_secret;
  if (!clientId || !clientSecret) {
    throw new Error(
      "client_secret.json is missing client_id/client_secret. Create a Desktop app OAuth client.",
    );
  }
  return { clientId, clientSecret };
}

/** RFC 8252: IP literal, not localhost. Desktop clients accept any port. */
export function loopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}/oauth/callback`;
}
