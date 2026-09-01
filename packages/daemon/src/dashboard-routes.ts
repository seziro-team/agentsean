import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  actions,
  changes,
  costLedger,
  crawls,
  findings,
  gscDaily,
  gscPageDaily,
  gscQueryDaily,
  pages,
  pageSnapshots,
  reports,
  searchFindingsFts,
  sites,
  type SqliteDatabase,
} from "@agentsean/db";
import { ACTION_KINDS, KIND_TIER, signApproval, addTwoKey, actionFromRow } from "@agentsean/actions";
import { crawlSite, persistCrawl, persistFindings } from "@agentsean/crawler";
import { buildReport, flattenForDb, SITE_SCORE_FORMULA, SITE_SCORE_VERSION } from "@agentsean/analyzers";
import {
  brandTermsFromOrigin,
  computeGscInsights,
  createSqliteQueue,
  ensureCadences,
  type JobQueue,
} from "@agentsean/scheduler";
import { isHalted, setHalted } from "./paths.js";
import { textToPdf } from "./pdf.js";
import { getSetting, getSettingNumber, setSetting } from "./settings.js";
import type { EventBus } from "./events.js";

export type DashboardRouteOptions = {
  db: SqliteDatabase;
  sqlite: Parameters<typeof searchFindingsFts>[0];
  seanHome: string;
  token: string;
  bus: EventBus;
  queue?: JobQueue | undefined;
};

function approvalKey(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function parseScore(raw: string | null): {
  score: number;
  version: string;
  formula: string;
  band: string;
} | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { value?: number; version?: string; band?: string };
    if (typeof v.value !== "number") return null;
    return {
      score: v.value,
      version: v.version ?? SITE_SCORE_VERSION,
      formula: SITE_SCORE_FORMULA,
      band: v.band ?? "Needs work",
    };
  } catch {
    return null;
  }
}

export function registerDashboardRoutes(app: FastifyInstance, opts: DashboardRouteOptions): void {
  const queue = opts.queue ?? createSqliteQueue(opts.db);

  app.get("/api/events", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`data: ${JSON.stringify({ keys: ["overview"] })}\n\n`);
    const unsub = opts.bus.subscribe((key) => {
      reply.raw.write(`data: ${JSON.stringify({ keys: [key] })}\n\n`);
    });
    const ping = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsub();
    });
  });

  app.get("/api/sites", () => {
    const rows = opts.db.select().from(sites).all();
    return {
      sites: rows.map((s) => ({
        id: s.id,
        origin: s.origin,
        name: s.name,
        observeUntil: s.observeUntil,
        autonomyMode: s.autonomyMode,
        killswitch: s.killswitch,
      })),
    };
  });

  app.get("/api/overview", (req) => {
    const q = req.query as { siteId?: string };
    const site = q.siteId
      ? opts.db.select().from(sites).where(eq(sites.id, q.siteId)).get()
      : opts.db.select().from(sites).all()[0];
    if (!site) return { origin: null, score: null, findings: {}, thisWeek: { applied: 0, queued: 0, reverted: 0 }, costUsd: 0 };
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const findingRows = opts.db.select().from(findings).where(eq(findings.siteId, site.id)).all();
    const bySev: Record<string, number> = {};
    for (const row of findingRows) {
      if (row.status !== "open") continue;
      bySev[row.severity] = (bySev[row.severity] ?? 0) + 1;
    }
    const changeRows = opts.db.select().from(changes).where(eq(changes.siteId, site.id)).all();
    const thisWeek = {
      applied: changeRows.filter((c) => c.appliedAt >= weekAgo).length,
      queued: opts.db
        .select()
        .from(actions)
        .where(eq(actions.siteId, site.id))
        .all()
        .filter((a) => a.state === "queued").length,
      reverted: changeRows.filter((c) => c.revertedAt && c.revertedAt >= weekAgo).length,
    };
    const costUsd = opts.db
      .select()
      .from(costLedger)
      .where(eq(costLedger.siteId, site.id))
      .all()
      .filter((r) => r.ts >= weekAgo)
      .reduce((s, r) => s + r.costUsd, 0);
    return {
      origin: site.origin,
      siteId: site.id,
      score: parseScore(getSetting(opts.db, `score:${site.id}`)),
      findings: bySev,
      thisWeek,
      costUsd,
      observeUntil: site.observeUntil,
    };
  });

  app.post("/api/onboard", async (req, reply) => {
    const body = (req.body ?? {}) as { url?: string; maxPages?: number; render?: boolean };
    let startUrl: string;
    try {
      const u = new URL(body.url ?? "");
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol");
      startUrl = u.href;
    } catch {
      return reply.code(400).send({ error: "invalid_url" });
    }
    const t0 = Date.now();
    const crawl = await crawlSite({
      startUrl,
      maxPages: body.maxPages ?? 80,
      render: body.render ?? false,
      rps: 8,
    });
    const { siteId, crawlId } = await persistCrawl(opts.db, crawl);
    const report = buildReport(crawl, Date.now() - t0);
    persistFindings(opts.db, siteId, flattenForDb(siteId, report.findings));
    setSetting(
      opts.db,
      `score:${siteId}`,
      JSON.stringify({
        value: report.score.value,
        version: report.score.version,
        band: report.score.band,
      }),
    );
    await ensureCadences(queue, opts.db, new Date());
    opts.bus.emit("sites");
    opts.bus.emit("findings");
    opts.bus.emit("overview");
    return {
      ok: true,
      siteId,
      crawlId,
      origin: report.origin,
      pages: report.pages,
      findingCount: report.findings.length,
      score: report.score,
      elapsedMs: report.elapsedMs,
    };
  });

  app.get("/api/findings", (req) => {
    const q = req.query as {
      siteId?: string;
      q?: string;
      severity?: string;
      tier?: string;
      cursor?: string;
      limit?: string;
    };
    const limit = Math.min(Number(q.limit) || 50, 200);
    let cursor: { detectedAt: string; id: string } | undefined;
    if (q.cursor) {
      const [detectedAt, id] = q.cursor.split(",");
      if (detectedAt && id) cursor = { detectedAt, id };
    }
    const hits = searchFindingsFts(opts.sqlite, {
      q: q.q ?? "",
      ...(q.siteId ? { siteId: q.siteId } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.tier ? { autonomyTier: q.tier } : {}),
      status: "open",
      limit: limit + 1,
      ...(cursor ? { cursor } : {}),
    });
    const page = hits.slice(0, limit);
    const extra = hits[limit];
    const nextCursor = extra ? `${page[page.length - 1]?.firstDetectedAt},${page[page.length - 1]?.id}` : null;
    return { findings: page, nextCursor };
  });

  app.get("/api/crawls", (req) => {
    const q = req.query as { siteId?: string };
    const rows = q.siteId
      ? opts.db.select().from(crawls).where(eq(crawls.siteId, q.siteId)).all()
      : opts.db.select().from(crawls).all();
    const ordered = rows.toSorted((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return {
      crawls: ordered.map((c) => ({
        id: c.id,
        siteId: c.siteId,
        startedAt: c.startedAt,
        finishedAt: c.finishedAt,
        status: c.status,
        pagesSeen: c.pagesSeen,
      })),
    };
  });

  app.get("/api/crawls/:id/diff", (req, reply) => {
    const id = (req.params as { id: string }).id;
    const q = req.query as { otherId?: string; filter?: string };
    const current = opts.db.select().from(crawls).where(eq(crawls.id, id)).get();
    if (!current) return reply.code(404).send({ error: "unknown_crawl" });
    const otherId = q.otherId;
    const other = otherId
      ? opts.db.select().from(crawls).where(eq(crawls.id, otherId)).get()
      : opts.db
          .select()
          .from(crawls)
          .where(eq(crawls.siteId, current.siteId))
          .all()
          .filter((c) => c.id !== id)
          .toSorted((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    const curSnaps = opts.db.select().from(pageSnapshots).where(eq(pageSnapshots.crawlId, id)).all();
    const othSnaps = other
      ? opts.db.select().from(pageSnapshots).where(eq(pageSnapshots.crawlId, other.id)).all()
      : [];
    const pageRows = opts.db.select().from(pages).where(eq(pages.siteId, current.siteId)).all();
    const urlOf = new Map(pageRows.map((p) => [p.id, p]));
    const cur = new Map<string, { hash: string | null; status: number | null; firstSeenAt: string }>();
    for (const s of curSnaps) {
      const p = urlOf.get(s.pageId);
      if (!p) continue;
      cur.set(p.url, { hash: s.contentHash, status: s.statusCode, firstSeenAt: p.firstSeenAt });
    }
    const prev = new Map<string, { hash: string | null; status: number | null }>();
    for (const s of othSnaps) {
      const p = urlOf.get(s.pageId);
      if (!p) continue;
      prev.set(p.url, { hash: s.contentHash, status: s.statusCode });
    }
    const urls = new Set([...cur.keys(), ...prev.keys()]);
    const rows: Array<{ url: string; mode: string; statusCode: number | null }> = [];
    for (const url of urls) {
      const a = cur.get(url);
      const b = prev.get(url);
      let mode = "no_change";
      if (a && !b) mode = a.firstSeenAt >= current.startedAt ? "new" : "added";
      else if (!a && b) mode = "removed";
      else if (a && b && a.hash !== b.hash) mode = "changed";
      else if (a && b) mode = "no_change";
      if (mode === "removed") {
        /* missing is the sitemap-expected case; without a stored sitemap it aliases removed */
      }
      rows.push({ url, mode, statusCode: a?.status ?? b?.status ?? null });
    }
    const filter = q.filter ?? "all";
    const filtered =
      filter === "all"
        ? rows
        : filter === "missing"
          ? rows.filter((r) => r.mode === "removed")
          : rows.filter((r) => r.mode === filter);
    return {
      rows: filtered.toSorted((x, y) => x.url.localeCompare(y.url)),
      filter,
      currentId: id,
      otherId: other?.id ?? null,
    };
  });

  app.get("/api/approvals", (req) => {
    const q = req.query as { siteId?: string };
    const rows = opts.db.select().from(actions).all().filter((a) => {
      if (q.siteId && a.siteId !== q.siteId) return false;
      return (a.tier === "T3" || a.tier === "3") && (a.state === "queued" || a.state === "proposed");
    });
    const out = rows.map((row) => {
      const action = actionFromRow(row);
      const payload = action?.payload ?? {};
      const title = "title" in payload ? String(payload.title) : "";
      const meta = "metaDescription" in payload ? String(payload.metaDescription) : "";
      const json =
        "json" in payload ? JSON.stringify((payload as { json: unknown }).json, null, 2) : "";
      const before = row.targetRef;
      return {
        id: row.id,
        kind: row.actionType,
        targetRef: row.targetRef,
        rationale: action?.rationale ?? [],
        blast: "T3 — human click required, not overridable",
        expires: null,
        diffs: {
          source: { before, after: JSON.stringify(payload, null, 2) },
          rendered: { before, after: title || meta || json || before },
          serp: {
            before: before,
            after: `${title || "(title)"}\n${meta || "(meta description)"}`,
          },
          jsonld: { before: "", after: json || "(no structured data in this action)" },
        },
      };
    });
    return { actions: out };
  });

  app.post("/api/approvals/:id/approve", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { actor?: string };
    const actor = (body.actor ?? "").trim();
    if (!actor) return reply.code(400).send({ error: "missing_actor" });
    const row = opts.db.select().from(actions).where(eq(actions.id, id)).get();
    if (!row) return reply.code(404).send({ error: "unknown_action" });
    const action = actionFromRow(row);
    if (!action) return reply.code(400).send({ error: "malformed_action" });
    const hmac = signApproval(approvalKey(opts.token), action, actor);
    addTwoKey(opts.db, id, actor, hmac);
    opts.bus.emit("actions");
    return { ok: true, actor, remaining: Math.max(0, 2 - 1) };
  });

  app.get("/api/automations", (req) => {
    const q = req.query as { siteId?: string };
    const disabled = new Set(
      (getSetting(opts.db, `automations:${q.siteId ?? "global"}`) ?? "")
        .split(",")
        .filter(Boolean),
    );
    const matrix = ACTION_KINDS.map((kind) => {
      const tier = KIND_TIER[kind];
      const locked = tier >= 3;
      return {
        kind,
        tier,
        auto: !locked && !disabled.has(kind),
        locked,
        note:
          tier === 4
            ? "Refused. No setting exists."
            : tier === 3
              ? "Always requires a human click."
              : tier === 2
                ? "Auto with budget / rate cap."
                : tier === 1
                  ? "Auto, logged, revertible."
                  : "Observe only.",
      };
    });
    return { matrix, t1: true, t2: true };
  });

  app.get("/api/content", (req) => {
    const q = req.query as { siteId?: string };
    const rows = opts.db
      .select()
      .from(actions)
      .all()
      .filter((a) => {
        if (q.siteId && a.siteId !== q.siteId) return false;
        return a.actionType === "create_page" || a.actionType === "refresh_content";
      });
    return {
      cap: { newPagesPerDay: 2 },
      items: rows.map((r) => ({
        id: r.id,
        kind: r.actionType,
        state: r.state,
        createdAt: r.createdAt,
        targetRef: r.targetRef,
      })),
    };
  });

  app.get("/api/search", (req, reply) => {
    const q = req.query as { siteId?: string };
    const site = q.siteId
      ? opts.db.select().from(sites).where(eq(sites.id, q.siteId)).get()
      : opts.db.select().from(sites).all()[0];
    if (!site) return reply.code(400).send({ error: "unknown_site" });
    const pagesDaily = opts.db.select().from(gscPageDaily).where(eq(gscPageDaily.siteId, site.id)).all();
    const queries = opts.db.select().from(gscQueryDaily).where(eq(gscQueryDaily.siteId, site.id)).all();
    const days = opts.db.select().from(gscDaily).where(eq(gscDaily.siteId, site.id)).all();
    return computeGscInsights({
      pages: pagesDaily.map((p) => ({
        date: p.date,
        page: p.page,
        clicks: p.clicks,
        impressions: p.impressions,
        position: p.position,
      })),
      queries: queries.map((r) => ({
        date: r.date,
        query: r.query,
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      })),
      days: days.map((d) => ({ date: d.date, clicks: d.clicks, impressions: d.impressions })),
      brandTerms: brandTermsFromOrigin(site.origin),
    });
  });

  app.get("/api/ai", () => ({
    engines: [],
    note: "Citation share lands with the provider/MCP layer (Phase 6 / 9).",
  }));

  app.get("/api/reports", (req) => {
    const q = req.query as { siteId?: string };
    const rows = q.siteId
      ? opts.db.select().from(reports).where(eq(reports.siteId, q.siteId)).all()
      : opts.db.select().from(reports).all();
    const ordered = rows.toSorted((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return {
      reports: ordered.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
        hash: r.hash,
        whiteLabel: Boolean(r.whiteLabel),
      })),
    };
  });

  app.post("/api/reports", async (req, reply) => {
    const body = (req.body ?? {}) as { siteId?: string };
    const site = body.siteId
      ? opts.db.select().from(sites).where(eq(sites.id, body.siteId)).get()
      : opts.db.select().from(sites).all()[0];
    if (!site) return reply.code(400).send({ error: "unknown_site" });
    const overview = opts.db.select().from(findings).where(eq(findings.siteId, site.id)).all();
    const score = parseScore(getSetting(opts.db, `score:${site.id}`));
    const payload = {
      origin: site.origin,
      capturedAt: new Date().toISOString(),
      score,
      openFindings: overview.filter((f) => f.status === "open").length,
      bySeverity: overview.reduce<Record<string, number>>((acc, f) => {
        if (f.status === "open") acc[f.severity] = (acc[f.severity] ?? 0) + 1;
        return acc;
      }, {}),
    };
    const payloadJson = JSON.stringify(payload);
    const hash = createHash("sha256").update(payloadJson).digest("hex");
    const white = getSetting(opts.db, "whiteLabel") === "1";
    const title = white ? `${site.origin} SEO snapshot` : `Agent Sean snapshot — ${site.origin}`;
    const bodyHtml = `<html><body><h1>${title}</h1><pre>${payloadJson}</pre></body></html>`;
    const id = randomUUID();
    opts.db
      .insert(reports)
      .values({
        id,
        siteId: site.id,
        createdAt: payload.capturedAt,
        title,
        bodyHtml,
        payloadJson,
        hash,
        whiteLabel: white ? 1 : 0,
      })
      .run();
    opts.bus.emit("reports");
    return { ok: true, id, hash };
  });

  app.get("/api/reports/:id.pdf", (req, reply) => {
    const id = (req.params as { id: string }).id.replace(/\.pdf$/, "");
    const row = opts.db.select().from(reports).where(eq(reports.id, id)).get();
    if (!row) return reply.code(404).send({ error: "unknown_report" });
    const pdf = textToPdf(row.title, row.payloadJson);
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `attachment; filename="sean-${id.slice(0, 8)}.pdf"`);
    return reply.send(pdf);
  });

  app.get("/api/settings", () => ({
    halted: isHalted(opts.seanHome),
    budgetUsdDaily: getSettingNumber(opts.db, "budgetUsdDaily", 8),
    observeDays: getSettingNumber(opts.db, "observeDays", 7),
    whiteLabel: getSetting(opts.db, "whiteLabel") === "1",
    rankCadence: getSetting(opts.db, "rankCadence") ?? "weekly",
    notifications: getSetting(opts.db, "notifications") ?? "off",
  }));

  app.post("/api/settings", (req) => {
    const body = (req.body ?? {}) as {
      budgetUsdDaily?: number;
      observeDays?: number;
      whiteLabel?: boolean;
      rankCadence?: string;
      notifications?: string;
    };
    if (typeof body.budgetUsdDaily === "number") {
      setSetting(opts.db, "budgetUsdDaily", String(body.budgetUsdDaily));
    }
    if (typeof body.observeDays === "number") {
      const days = Math.max(1, Math.min(7, Math.round(body.observeDays)));
      setSetting(opts.db, "observeDays", String(days));
    }
    if (typeof body.whiteLabel === "boolean") {
      setSetting(opts.db, "whiteLabel", body.whiteLabel ? "1" : "0");
    }
    if (typeof body.rankCadence === "string") setSetting(opts.db, "rankCadence", body.rankCadence);
    if (typeof body.notifications === "string") setSetting(opts.db, "notifications", body.notifications);
    opts.bus.emit("settings");
    return { ok: true };
  });

  app.post("/api/freeze", (req) => {
    const body = (req.body ?? {}) as { halted?: boolean };
    const halted = Boolean(body.halted);
    setHalted(opts.seanHome, halted);
    opts.bus.emit("settings");
    opts.bus.emit("overview");
    return { ok: true, halted: isHalted(opts.seanHome) };
  });

  app.get("/api/jobs", (req) => {
    const q = req.query as { siteId?: string };
    return queue.list(q.siteId ? { siteId: q.siteId } : undefined).then((jobs) => ({ jobs }));
  });
}
