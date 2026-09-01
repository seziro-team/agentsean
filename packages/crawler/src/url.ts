const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "twclid",
  "li_fat_id",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "yclid",
  "ref",
  "referrer",
]);

export function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

export function registrableHost(hostname: string): string {
  const parts = hostname.replace(/\.$/, "").toLowerCase().split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function absolutize(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  if (u.pathname === "") u.pathname = "/";
  return u.href;
}

export function stripTrackingParams(url: string): string {
  const u = new URL(url);
  const keys = Array.from(u.searchParams.keys());
  for (const key of keys) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  return u.href;
}

export function hasTrackingParams(url: string): boolean {
  try {
    const u = new URL(url);
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function isInternalUrl(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    const o = new URL(origin);
    return (
      u.hostname === o.hostname ||
      u.hostname === `www.${o.hostname}` ||
      o.hostname === `www.${u.hostname}`
    );
  } catch {
    return false;
  }
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function templateKey(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname
      .split("/")
      .filter(Boolean)
      .map((s) => (/^\d+$/.test(s) || /^[0-9a-f-]{8,}$/i.test(s) ? ":id" : s));
    return `${segs.length}:${segs.join("/")}`;
  } catch {
    return "0:";
  }
}
