const URL_RE = /https?:\/\/[^\s"'<>\\]+/gi;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;

function walk(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walk(v, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) walk(v, into);
  }
}

/**
 * Strip trailing `)`, `,`, `.`, `;` — punctuation that follows a URL in prose
 * rather than belonging to it.
 *
 * Done with a scan instead of `/[),.;]+$/`. An anchored `+` over a repeated
 * class is quadratic: on a string of many such characters that never satisfies
 * the anchor, the engine retries the run from each successive start position
 * (CodeQL js/polynomial-redos). This walks backwards once, so it is linear no
 * matter what the crawled page contains.
 */
function trimTrailingPunctuation(s: string): string {
  let end = s.length;
  while (end > 0) {
    const c = s.charCodeAt(end - 1);
    // ')' 41, ',' 44, '.' 46, ';' 59
    if (c === 41 || c === 44 || c === 46 || c === 59) end--;
    else break;
  }
  return s.slice(0, end);
}

export function extractUrls(value: unknown): string[] {
  const strings: string[] = [];
  walk(value, strings);
  const out = new Set<string>();
  for (const s of strings) {
    for (const m of s.match(URL_RE) ?? []) {
      try {
        const u = new URL(trimTrailingPunctuation(m));
        if (u.protocol === "http:" || u.protocol === "https:") out.add(u.href);
      } catch {
        /* ignore */
      }
    }
  }
  return [...out];
}

export function extractDomains(value: unknown): string[] {
  const strings: string[] = [];
  walk(value, strings);
  const out = new Set<string>();
  for (const s of strings) {
    for (const m of s.match(DOMAIN_RE) ?? []) {
      out.add(m.toLowerCase());
    }
    try {
      if (/^https?:\/\//i.test(s)) out.add(new URL(s).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

export function registrableHint(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export function sameSite(url: string, origin: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(origin);
    return registrableHint(a.hostname) === registrableHint(b.hostname);
  } catch {
    return false;
  }
}

export function matchGlob(url: string, glob: string): boolean {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(url);
}
