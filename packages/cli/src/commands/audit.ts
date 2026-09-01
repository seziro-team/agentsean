import { openSqlite } from "@agentsean/db";
import { crawlSite, persistCrawl, persistFindings } from "@agentsean/crawler";
import { buildReport, flattenForDb } from "@agentsean/analyzers";
import { loadAuditExtras } from "@agentsean/google";
import { defaultSeanHome, dbPath, ensureSeanHome } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function auditCommand(opts: {
  json: boolean;
  target: string | undefined;
  home: string | undefined;
  maxPages: number | undefined;
  concurrency: number | undefined;
  render: boolean;
}): Promise<number> {
  if (!opts.target) {
    emitError(
      opts.json,
      { command: "audit", error: "missing_url" },
      "Missing URL. Try `sean audit https://example.com --json`.",
    );
    return 2;
  }
  let startUrl: string;
  try {
    const u = new URL(opts.target);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol");
    startUrl = u.href;
  } catch {
    emitError(
      opts.json,
      { command: "audit", error: "invalid_url", target: opts.target },
      `Invalid URL: ${opts.target}`,
    );
    return 2;
  }

  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const { db, sqlite } = openSqlite(dbPath(home));
  const t0 = Date.now();
  try {
    const crawl = await crawlSite({
      startUrl,
      maxPages: opts.maxPages ?? 5000,
      concurrency: opts.concurrency,
      render: opts.render,
    });
    const elapsedMs = Date.now() - t0;
    const { siteId } = await persistCrawl(db, crawl);
    const extras = loadAuditExtras(db, siteId);
    const report = buildReport(crawl, elapsedMs, extras);
    persistFindings(db, siteId, flattenForDb(siteId, report.findings));

    const top = report.findings.slice(0, 25).map((f) => ({
      id: f.ruleId,
      severity: f.severity,
      priority: Number(f.priority.toFixed(2)),
      affected: f.urls.length,
      title: f.title,
      autonomyTier: f.autonomyTier,
      urls: f.urls.slice(0, 10),
    }));

    const payload = {
      ok: true,
      command: "audit",
      url: report.url,
      origin: report.origin,
      pages: report.pages,
      elapsedMs: report.elapsedMs,
      score: report.score,
      formula: report.formula,
      findings: top,
      findingCount: report.findings.length,
      credentialsRequired: false,
    };

    const human = formatHuman(payload);
    emit(opts.json, payload, human);
    return 0;
  } catch (e) {
    emitError(
      opts.json,
      {
        command: "audit",
        error: "audit_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      e instanceof Error ? e.message : String(e),
    );
    return 1;
  } finally {
    sqlite.close();
  }
}

function formatHuman(p: {
  url: string;
  origin: string;
  pages: number;
  elapsedMs: number;
  score: { value: number; band: string; version: string; notes: string[] };
  findingCount: number;
  findings: {
    id: string;
    severity: string;
    priority: number;
    affected: number;
    title: string;
  }[];
}): string {
  const lines = [
    `Sean audit  ${p.url}`,
    `Site score  ${p.score.value}  ${p.score.band}  (${p.score.version})`,
    `Crawled     ${p.pages} URLs in ${(p.elapsedMs / 1000).toFixed(1)}s`,
    `Findings    ${p.findingCount}  (showing top ${p.findings.length})`,
    "",
  ];
  for (const f of p.findings.slice(0, 15)) {
    lines.push(
      `  ${f.severity.padEnd(8)}  p=${String(f.priority).padStart(6)}  n=${String(f.affected).padStart(4)}  ${f.id}  ${f.title}`,
    );
  }
  if (p.score.notes.length) {
    lines.push("", ...p.score.notes.map((n) => `  note: ${n}`));
  }
  return lines.join("\n");
}
