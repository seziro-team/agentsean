import { randomUUID } from "node:crypto";
import type { Cluster, Embeddings } from "./types.js";
import { COSINE_MERGE, cosine } from "./embeddings.js";
import type { SerpResult } from "@agentsean/providers";

export async function clusterQueries(
  queries: string[],
  embeddings: Embeddings,
  opts?: {
    threshold?: number;
    serp?: Map<string, string[]>;
  },
): Promise<Cluster[]> {
  const threshold = opts?.threshold ?? COSINE_MERGE;
  const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  const vectors = new Map<string, number[]>();
  for (const q of unique) {
    vectors.set(q, await Promise.resolve(embeddings.embed(q)));
  }
  const assigned = new Set<string>();
  const clusters: Cluster[] = [];
  for (const q of unique) {
    if (assigned.has(q)) continue;
    const seed = vectors.get(q);
    if (!seed) continue;
    const members = [q];
    assigned.add(q);
    for (const other of unique) {
      if (assigned.has(other)) continue;
      const v = vectors.get(other);
      if (!v) continue;
      if (cosine(seed, v) >= threshold) {
        members.push(other);
        assigned.add(other);
      }
    }
    clusters.push({
      id: randomUUID(),
      label: labelOf(members),
      members,
      serpConfirmed: false,
    });
  }
  if (!opts?.serp || opts.serp.size === 0) return clusters;
  return confirmSerpMerges(clusters, opts.serp);
}

/** Merge clusters that share ≥ 3 top-10 URLs. Cuts SERP cost 5–20× vs SERP-first. */
export function confirmSerpMerges(clusters: Cluster[], serp: Map<string, string[]>): Cluster[] {
  const urlSet = (members: string[]) => {
    const s = new Set<string>();
    for (const m of members) {
      for (const u of serp.get(m) ?? []) s.add(normalizeUrl(u));
    }
    return s;
  };
  const out = clusters.map((c) => ({ ...c, members: [...c.members] }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (!a || !b) continue;
        const shared = intersectionSize(urlSet(a.members), urlSet(b.members));
        if (shared >= 3) {
          a.members = [...new Set([...a.members, ...b.members])];
          a.label = labelOf(a.members);
          a.serpConfirmed = true;
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  for (const c of out) {
    if (c.members.length >= 2 && (urlSet(c.members).size >= 3 || c.serpConfirmed)) {
      const sharedInside = minShared(c.members, serp);
      if (sharedInside >= 3) c.serpConfirmed = true;
    }
  }
  return out;
}

export function urlsFromSerp(result: SerpResult): string[] {
  return result.items.slice(0, 10).map((i) => i.url);
}

function minShared(members: string[], serp: Map<string, string[]>): number {
  if (members.length < 2) return 0;
  let min = Infinity;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = new Set((serp.get(members[i] ?? "") ?? []).map(normalizeUrl));
      const b = new Set((serp.get(members[j] ?? "") ?? []).map(normalizeUrl));
      min = Math.min(min, intersectionSize(a, b));
    }
  }
  return Number.isFinite(min) ? min : 0;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url.replace(/\/$/, "");
  }
}

function labelOf(members: string[]): string {
  return members.toSorted((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? "cluster";
}
