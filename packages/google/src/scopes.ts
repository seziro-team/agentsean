/** Scopes declared on the verification submission (docs/oauth-verification.md).
 *  Requested incrementally at runtime. business.manage waits for Phase 9. */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const SCOPE = {
  openid: "openid",
  email: "https://www.googleapis.com/auth/userinfo.email",
  profile: "https://www.googleapis.com/auth/userinfo.profile",
  webmastersReadonly: "https://www.googleapis.com/auth/webmasters.readonly",
  webmasters: "https://www.googleapis.com/auth/webmasters",
  analyticsReadonly: "https://www.googleapis.com/auth/analytics.readonly",
  siteVerification: "https://www.googleapis.com/auth/siteverification",
  businessManage: "https://www.googleapis.com/auth/business.manage",
} as const;

/** First-connect set: GSC read+write (property add + sitemap submit), GA4, Site Verification. */
export const CONNECT_SCOPES: readonly string[] = [
  SCOPE.openid,
  SCOPE.email,
  SCOPE.profile,
  SCOPE.webmasters,
  SCOPE.analyticsReadonly,
  SCOPE.siteVerification,
];

export const DEFAULT_BROKER_URL = "https://oauth.agentsean.com";

export const GOOGLE_OAUTH_ACCOUNT = "google-oauth";
export const GOOGLE_API_KEY_ACCOUNT = "google-api-key";
export const GOOGLE_BYO_CLIENT_ACCOUNT = "google-byo-client";

export function encodeSiteUrl(siteUrl: string): string {
  return encodeURIComponent(siteUrl);
}

/** URL-prefix properties must keep the trailing slash. Domain properties are sc-domain:. */
export function normalizeGscSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("sc-domain:")) return trimmed;
  try {
    const u = new URL(trimmed);
    if (!u.pathname || u.pathname === "") u.pathname = "/";
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    return u.origin + u.pathname;
  } catch {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
}
