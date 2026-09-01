/** CalVer YYYY.M.PATCH. Dist-tags: latest / beta / extended-stable. */
export const VERSION = "2026.9.0";

export const CHANNELS = ["stable", "extended-stable", "dev"] as const;
export type Channel = (typeof CHANNELS)[number];

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export const MIN_NODE = "22.19.0";

export function nodeMeetsMin(version = process.versions.node): boolean {
  const [a, b] = version.split(".").map((n) => Number(n));
  const [ma, mb] = MIN_NODE.split(".").map((n) => Number(n));
  if ((a ?? 0) !== (ma ?? 0)) return (a ?? 0) > (ma ?? 0);
  return (b ?? 0) >= (mb ?? 0);
}
