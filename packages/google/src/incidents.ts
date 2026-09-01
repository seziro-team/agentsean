import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { SqliteDatabase } from "@agentsean/db";
import { googleChangepoints, googleIncidents } from "@agentsean/db";

export const INCIDENTS_JSON = "https://status.search.google.com/incidents.json";
export const INCIDENTS_ATOM = "https://status.search.google.com/en/feed.atom";
export const PRODUCTS_JSON = "https://status.search.google.com/products.json";

export const SERVICE_RANKING = "rGHU1u87FJnkP6W2GwMi";
export const SERVICE_CRAWLING = "QAVfsAEBQ159b2mEWBYF";
export const SERVICE_INDEXING = "DRyTdKyPd41QXD2hnncp";
export const SERVICE_SERVING = "pKUD9XkLn3TBLquSpQMD";

export type GoogleIncident = {
  id: string;
  number?: string;
  begin: string;
  end?: string | null;
  created?: string;
  modified?: string;
  external_desc: string;
  status_impact?: string;
  severity?: string;
  service_key: string;
  service_name: string;
  uri?: string;
};

export function parseIncidentsJson(raw: unknown): GoogleIncident[] {
  if (!Array.isArray(raw)) return [];
  const out: GoogleIncident[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.begin !== "string") continue;
    if (typeof r.external_desc !== "string" || typeof r.service_key !== "string") continue;
    const incident: GoogleIncident = {
      id: r.id,
      begin: r.begin,
      end: typeof r.end === "string" ? r.end : null,
      external_desc: r.external_desc,
      service_key: r.service_key,
      service_name: typeof r.service_name === "string" ? r.service_name : "unknown",
    };
    if (typeof r.number === "string") incident.number = r.number;
    if (typeof r.created === "string") incident.created = r.created;
    if (typeof r.modified === "string") incident.modified = r.modified;
    if (typeof r.status_impact === "string") incident.status_impact = r.status_impact;
    if (typeof r.severity === "string") incident.severity = r.severity;
    if (typeof r.uri === "string") incident.uri = r.uri;
    out.push(incident);
  }
  return out;
}

/** Minimal Atom fallback if incidents.json is down. */
export function parseIncidentsAtom(xml: string): GoogleIncident[] {
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  const out: GoogleIncident[] = [];
  for (const e of entries) {
    const title = inner(e, "title") ?? "Google Search incident";
    const updated = inner(e, "updated") ?? inner(e, "published") ?? new Date().toISOString();
    const id = inner(e, "id") ?? title;
    out.push({
      id: id.slice(0, 64),
      begin: updated,
      end: null,
      external_desc: title,
      service_key: SERVICE_RANKING,
      service_name: "Ranking",
    });
  }
  return out;
}

function inner(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? null;
}

export async function fetchIncidents(fetchFn: typeof fetch): Promise<GoogleIncident[]> {
  try {
    const res = await fetchFn(INCIDENTS_JSON, {
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      return parseIncidentsJson(await res.json());
    }
  } catch {
    // fall through to Atom
  }
  const atom = await fetchFn(INCIDENTS_ATOM, {
    headers: { accept: "application/atom+xml, application/xml, text/xml" },
  });
  if (!atom.ok) return [];
  return parseIncidentsAtom(await atom.text());
}

type CuratedRow = {
  id: string;
  kind: string;
  begin: string;
  end: string | null;
  title: string;
  metricImpact: string[];
  clicksAffected: boolean;
  impressionsAffected: boolean;
  positionAffected: boolean;
  source: string;
  notes?: string;
};

function curatedPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "data", "changepoints.json");
}

export function loadCuratedChangepoints(): CuratedRow[] {
  const raw = JSON.parse(readFileSync(curatedPath(), "utf8")) as CuratedRow[];
  return raw;
}

export function upsertIncidents(db: SqliteDatabase, incidents: GoogleIncident[]): number {
  const now = new Date().toISOString();
  let n = 0;
  for (const inc of incidents) {
    const existing = db
      .select()
      .from(googleIncidents)
      .where(eq(googleIncidents.id, inc.id))
      .get();
    const values = {
      id: inc.id,
      number: inc.number ?? null,
      begin: inc.begin,
      end: inc.end ?? null,
      created: inc.created ?? null,
      modified: inc.modified ?? null,
      externalDesc: inc.external_desc,
      statusImpact: inc.status_impact ?? null,
      severity: inc.severity ?? null,
      serviceKey: inc.service_key,
      serviceName: inc.service_name,
      uri: inc.uri ?? null,
      raw: JSON.stringify(inc),
      ingestedAt: now,
    };
    if (existing) {
      db.update(googleIncidents).set(values).where(eq(googleIncidents.id, inc.id)).run();
    } else {
      db.insert(googleIncidents).values(values).run();
    }
    n += 1;

    if (inc.service_key === SERVICE_RANKING) {
      upsertChangepoint(db, {
        kind: "GOOGLE_RANKING_UPDATE",
        begin: inc.begin.slice(0, 10),
        end: inc.end ? inc.end.slice(0, 10) : null,
        title: inc.external_desc,
        metricImpact: ["clicks", "impressions", "position"],
        clicksAffected: 1,
        impressionsAffected: 1,
        positionAffected: 1,
        source: "incidents",
        incidentId: inc.id,
        notes: null,
      });
    }
  }
  return n;
}

export function seedCuratedChangepoints(db: SqliteDatabase): number {
  let n = 0;
  for (const row of loadCuratedChangepoints()) {
    upsertChangepoint(db, {
      kind: row.kind,
      begin: row.begin,
      end: row.end,
      title: row.title,
      metricImpact: row.metricImpact,
      clicksAffected: row.clicksAffected ? 1 : 0,
      impressionsAffected: row.impressionsAffected ? 1 : 0,
      positionAffected: row.positionAffected ? 1 : 0,
      source: row.source,
      incidentId: null,
      notes: row.notes ?? null,
    });
    n += 1;
  }
  return n;
}

function upsertChangepoint(
  db: SqliteDatabase,
  row: {
    kind: string;
    begin: string;
    end: string | null;
    title: string;
    metricImpact: string[];
    clicksAffected: number;
    impressionsAffected: number;
    positionAffected: number;
    source: string;
    incidentId: string | null;
    notes: string | null;
  },
): void {
  const existing = db.select().from(googleChangepoints).all().find(
    (r) => r.kind === row.kind && r.begin === row.begin && r.title === row.title,
  );
  const values = {
    kind: row.kind,
    begin: row.begin,
    end: row.end,
    title: row.title,
    metricImpact: JSON.stringify(row.metricImpact),
    clicksAffected: row.clicksAffected,
    impressionsAffected: row.impressionsAffected,
    positionAffected: row.positionAffected,
    source: row.source,
    incidentId: row.incidentId,
    notes: row.notes,
  };
  if (existing) {
    db.update(googleChangepoints).set(values).where(eq(googleChangepoints.id, existing.id)).run();
    return;
  }
  db.insert(googleChangepoints)
    .values({ id: randomUUID(), ...values })
    .run();
}

export function changepointsOverlapping(
  db: SqliteDatabase,
  startDate: string,
  endDate: string,
): { id: string; title: string; kind: string; begin: string; end: string | null }[] {
  return db
    .select()
    .from(googleChangepoints)
    .all()
    .filter((r) => {
      const b = r.begin;
      const e = r.end ?? r.begin;
      return b <= endDate && e >= startDate;
    })
    .map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      begin: r.begin,
      end: r.end,
    }));
}
