/** Small presentation helpers. No dependencies. */

export function money(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${n.toFixed(digits)}`;
}

/** Split a price into dollars and cents for display sizing. See <Money>. */
export function splitMoney(
  n: number | null | undefined,
): { dollars: string; cents: string } | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const [d = "0", c = "00"] = n.toFixed(2).split(".");
  return { dollars: `$${d}`, cents: `.${c}` };
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

/** ISO date → "Aug 31" style, local. Returns "—" for empties. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** ISO date → coarse relative time ("3d ago", "just now"). */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Days remaining until an ISO instant; negative clamps to 0. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
}

/** Strip the scheme for compact display of an origin/url. */
export function bareHost(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Path portion of a URL for compact tables; falls back to the whole string. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
