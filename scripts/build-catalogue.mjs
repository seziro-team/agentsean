#!/usr/bin/env node
/**
 * Regenerate the check catalogue's human-readable text from the research doc.
 *
 * catalogue-data.ts says "Auto-generated from research/01-technical-seo.md",
 * but the generator was never in the repo, and whatever produced the current
 * file mangled the text in two ways:
 *
 *   1. It stripped inline code spans instead of unwrapping them, so
 *      "Missing `<meta charset>` (or not in first 1024 bytes)" became
 *      "Missing (or not in first 1024 bytes)", and names that were nothing
 *      but a tag — "`<title>` too short" — lost their subject entirely.
 *
 *   2. It read columns by fixed index. The doc has at least six table shapes
 *      (| ID | Check | Detection | Sev | Fix | Autonomy |, | ID | Check |
 *      Detection |, | ID | Pattern | Sev | …), so on the shorter tables the
 *      severity column slid into the name. That is why nine different checks
 *      were all called "Low" and six were called "Low–Medium".
 *
 * The result was a Findings table — the product's primary output — where
 * dozens of rows read "Missing", "Low", or "No on homepage".
 *
 * This reads columns by their header name and unwraps code spans, keeping the
 * text inside them. It only rewrites `name` and `explanation`; severity,
 * tier, scope and fix kind are left exactly as they are, because those were
 * checked against the source and found sound, and they feed scoring.
 *
 * Usage: node scripts/build-catalogue.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "research/01-technical-seo.md");
const TARGET = path.join(ROOT, "packages/analyzers/src/catalogue-data.ts");
const WRITE = process.argv.includes("--write");

/** Columns that carry the human description, best first. */
const NAME_HEADERS = ["check", "pattern", "signal", "issue", "problem"];
const ID_HEADERS = new Set(["id", "check id"]);

/**
 * Markdown inline → plain text, keeping what code spans contain.
 *
 * The names legitimately hold things like `<meta charset>` and
 * `X-Content-Type-Options: nosniff`; those are the subject of the sentence,
 * not decoration. Angle brackets are safe here — every consumer renders this
 * as a text node, never as HTML.
 */
function plain(cell) {
  return cell
    .replace(/\\\|/g, "|")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)([^*]*)\*(?!\*)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The same cell with code spans deleted — the old generator's output. */
function scarred(cell) {
  return cell
    .replace(/\\\|/g, "|")
    .replace(/`[^`]*`/g, "")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)([^*]*)\*(?!\*)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a table row into cells, honouring escaped pipes. */
function cells(line) {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\" && body[i + 1] === "|") {
      cur += "\\|";
      i++;
      continue;
    }
    if (ch === "|") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** "Low", "Medium", "Low–Medium" — a severity, not a description. */
const SEVERITY_ONLY =
  /^(critical|high|medium|low|insight)(\s*[–—-]\s*(critical|high|medium|low|insight))?$/i;

const isSeparator = (line) => /^\|[\s:|-]+\|$/.test(line.trim()) && line.includes("-");

/** Walk every markdown table, mapping each row's ID to its description. */
function parse(md) {
  const lines = md.split("\n");
  const found = new Map();
  /** The same cell with code spans DELETED — what the old generator produced. */
  const stripped = new Map();
  let dropped = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!isSeparator(lines[i])) continue;
    const header = cells(lines[i - 1] ?? "").map((h) => plain(h).toLowerCase());
    if (!header.length) continue;

    const idCol = header.findIndex((h) => ID_HEADERS.has(h));
    let nameCol = -1;
    for (const want of NAME_HEADERS) {
      const at = header.findIndex((h) => h === want);
      if (at !== -1) {
        nameCol = at;
        break;
      }
    }
    if (idCol === -1 || nameCol === -1) continue;

    for (let j = i + 1; j < lines.length; j++) {
      const row = lines[j];
      if (!row.trim().startsWith("|")) break;
      if (isSeparator(row)) continue;
      const c = cells(row);
      const rawId = plain(c[idCol] ?? "");
      const name = plain(c[nameCol] ?? "");
      const scar = scarred(c[nameCol] ?? "");
      if (!/^[A-Z0-9]+\.[A-Z0-9_]+$/.test(rawId)) {
        // Rows like "`RESP.EXT_4XX` / `RESP.EXT_5XX`" describe two checks.
        const multi = [...rawId.matchAll(/([A-Z0-9]+\.[A-Z0-9_]+)/g)].map((m) => m[1]);
        if (multi.length > 1 && name) {
          for (const id of multi)
            if (!found.has(id)) {
              found.set(id, name);
              stripped.set(id, scar);
            }
        } else if (rawId) {
          dropped++;
        }
        continue;
      }
      // A bare severity token is never a name. Some tables are
      // | ID | Sev | Autonomy | with no description column, and reading one as
      // a name is exactly the mistake that produced nine checks called "Low".
      if (!name || SEVERITY_ONLY.test(name)) {
        dropped++;
        continue;
      }
      if (!found.has(rawId)) {
        found.set(rawId, name);
        stripped.set(rawId, scar);
      }
    }
  }
  return { found, dropped, stripped };
}

/**
 * Checks the research doc never described, written from their detectors.
 *
 * These sixteen carry no row in 01-technical-seo.md, so the old generator left
 * the name field holding whatever the column drift put there — nine different
 * checks displayed as "Low", six as "Low–Medium". Each name below states what
 * its predicate in detectors/all.ts actually tests, so the catalogue and the
 * code agree; the detector is quoted next to it so the two can be compared
 * without going and finding it.
 */
const FROM_DETECTOR = {
  // H1_WITH_LEADING_IMG = /<h1[^>]{0,2048}>\s*<img/i
  "ONP.ALT_TEXT_IN_H1": "<h1> opens with an image instead of text",
  // dupField(pages, p => p.extract.h1[0])
  "ONP.H1_DUPLICATE": "Duplicate <h1> across URLs",
  // (p.extract?.h1[0]?.length ?? 0) > 70
  "ONP.H1_TOO_LONG": "<h1> over 70 characters",
  // (p.extract?.metaDescriptions.length ?? 0) > 1
  "ONP.META_DESC_MULTIPLE": 'More than one <meta name="description">',
  // p.extract?.metaDescription && !p.extract.metaDescInHead
  "ONP.META_DESC_OUTSIDE_HEAD": '<meta name="description"> outside <head>',
  // (p.extract?.titles.length ?? 0) > 1
  "ONP.TITLE_MULTIPLE": "More than one <title>",
  // p.extract?.title && !p.extract.titleInHead
  "ONP.TITLE_OUTSIDE_HEAD": "<title> outside <head>",
  // (p.extract?.title?.length ?? 0) > 70
  "ONP.TITLE_PIXEL_OVER": "<title> over 70 characters — likely truncated in results",
  // p.extract?.title === p.extract.h1[0]
  "ONP.TITLE_SAME_AS_H1": "<title> identical to the <h1>",
  // originPath(p.url).includes("//")
  "ONP.URL_MULTIPLE_SLASHES": "URL path contains a double slash",
  // /[^ -~]/.test(p.url)
  "ONP.URL_NON_ASCII": "URL contains non-ASCII characters",
  // p.url.length > 115
  "ONP.URL_OVER_115_CHARS": "URL longer than 115 characters",
  // new Set(segs).size < segs.length / 2 && segs.length > 4
  "ONP.URL_REPETITIVE_PATH": "URL path repeats the same segments",
  // p.url.includes("%20") || p.url.includes(" ")
  "ONP.URL_SPACES": "URL contains a space or %20",
  // originPath(p.url).includes("_")
  "ONP.URL_UNDERSCORES": "URL path uses underscores rather than hyphens",
  // /[A-Z]/.test(originPath(p.url))
  "ONP.URL_UPPERCASE": "URL path contains uppercase characters",

  // Distinct checks the doc named with a back-reference ("same for H1") or an
  // aside ("Screaming Frog ships both"), leaving pairs indistinguishable.
  // p.extract.h1 empty && p.renderedExtract.h1 non-empty
  "JS.H1_RENDER_ONLY": "<h1> present only after JavaScript renders",
  // p.extract.h1[0] !== p.renderedExtract.h1[0]
  "JS.H1_UPDATED": "<h1> rewritten by JavaScript after render",
  "JS.META_DESC_RENDER_ONLY": "Meta description present only after JavaScript renders",
  "JS.META_DESC_UPDATED": "Meta description rewritten by JavaScript after render",
  // Both push([]) — reserved, never fire today.
  "ONP.SPELLING": "Spelling errors in main content",
  "ONP.GRAMMAR": "Grammar errors in main content",
  // push(out, "RESP.EXT_4XX", ext4) / push(out, "RESP.EXT_5XX", ext5)
  "RESP.EXT_4XX": "External link returns 4xx",
  "RESP.EXT_5XX": "External link returns 5xx",
  // images[0].loading === "lazy" — the first image, as an LCP proxy...
  "IMG.LCP_LAZY": "First image on the page is lazy-loaded (likely the LCP element)",
  // ...versus any image on the page, which is a different question.
  "PERF.LCP_LAZY_LOADED": "An image on the page is lazy-loaded",
};

const md = fs.readFileSync(SOURCE, "utf8");
const { found, dropped, stripped } = parse(md);
// These win outright. Some of them do appear in the doc, but in a
// | ID | Sev | Autonomy | table that has no description column at all, so the
// parser reads the severity as the name and would otherwise keep "Low".
for (const [id, name] of Object.entries(FROM_DETECTOR)) found.set(id, name);

/**
 * Only rewrite text that is provably damaged, never merely different.
 *
 * Some rows are fine as they stand and the source column next to them holds a
 * detection expression rather than a name — MOB.CONTENT_WIDER_THAN_SCREEN is
 * "Content Wider Than Screen" here and "document.scrollWidth >
 * window.innerWidth + 2" there. Overwriting those would be a regression
 * dressed up as a fix.
 *
 * Damage has an exact signature: delete the code spans from the source row
 * (rather than unwrapping them) and you get today's value back, character for
 * character. That is what the old generator did. Anything else is left alone.
 */
function isDamaged(current, id) {
  // FROM_DETECTOR is hand-written for IDs the doc describes badly or not at
  // all, so it is authoritative for those and does not need a damage signal.
  // Without this the table would stop applying as soon as it had applied once:
  // the scar no longer matches a name this script already corrected.
  if (Object.hasOwn(FROM_DETECTOR, id)) return true;
  const scar = stripped.get(id);
  if (scar !== undefined && scar === current) return true;
  // Column drift: a severity token parked in the name field.
  return SEVERITY_ONLY.test(current.trim());
}

let ts = fs.readFileSync(TARGET, "utf8");
const before = ts;

// Rewrite name/explanation in place, entry by entry, so nothing else moves.
const ENTRY = /(\{\s*\n\s*id: "([^"]+)",)([\s\S]*?)(\n  \},)/g;
let changed = 0;
const examples = [];
const missing = [];

ts = ts.replace(ENTRY, (whole, head, id, body, tail) => {
  const want = found.get(id);
  if (!want) {
    missing.push(id);
    return whole;
  }
  const esc = JSON.stringify(want);
  let next = body;
  // Both quote styles: prettier rewrites a string containing a double quote
  // to single quotes, so `name: 'LCP image has loading="lazy"'` is normal and
  // a double-quote-only pattern silently skips exactly those entries.
  const nameRe = /(\n\s*name: )("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;
  const explRe = /(\n\s*explanation: )("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;
  const curName = nameRe.exec(body)?.[2];
  if (curName === undefined) return whole;
  const curText =
    curName[0] === "'"
      ? curName.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\")
      : JSON.parse(curName);
  if (curText !== want && isDamaged(curText, id)) {
    next = next.replace(nameRe, `$1${esc}`);
    // explanation duplicated the damaged name; keep them in step.
    if (explRe.test(next)) {
      const curExpl = explRe.exec(next)[2];
      if (curExpl === curName) next = next.replace(explRe, `$1${esc}`);
    }
    changed++;
    if (examples.length < 200) {
      examples.push(`  ${id.padEnd(30)} ${curName} -> ${esc}`);
    }
  }
  return head + next + tail;
});

console.log(`source rows parsed : ${found.size}`);
console.log(`rows skipped       : ${dropped}`);
console.log(`catalogue entries not in source: ${missing.length}`);
console.log(`names rewritten    : ${changed}`);
if (examples.length) {
  console.log("\nsample:");
  examples.forEach((e) => console.log(e));
}

if (WRITE && ts !== before) {
  fs.writeFileSync(TARGET, ts);
  console.log(`\nwrote ${path.relative(ROOT, TARGET)}`);
} else if (!WRITE) {
  console.log("\n(dry run — pass --write to apply)");
}
