import { isHostedMode } from "./plans.js";

export function hostedPublicOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env["SEAN_PUBLIC_ORIGIN"]?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function hostedOauthRedirectUri(env: NodeJS.ProcessEnv = process.env, path = "/oauth/callback"): string | null {
  const origin = hostedPublicOrigin(env);
  if (!origin) return null;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Self-host broker stays loopback-only. Hosted OAuth is a web client on our origin. */
export function assertOauthRedirect(uri: string, env: NodeJS.ProcessEnv = process.env): void {
  if (isHostedMode(env)) {
    const origin = hostedPublicOrigin(env);
    if (!origin || !uri.startsWith(origin)) {
      throw new Error("Hosted OAuth redirect must match SEAN_PUBLIC_ORIGIN.");
    }
    return;
  }
  if (!uri.startsWith("http://127.0.0.1:")) {
    throw new Error("Broker will only hand tokens to http://127.0.0.1 loopback.");
  }
}
