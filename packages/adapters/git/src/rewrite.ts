const TITLE_PATTERNS: {
  re: RegExp;
  wrap: (title: string, match: RegExpExecArray) => string;
}[] = [
  {
    re: /title:\s*\{[^{}]*default:\s*(["'`])([\s\S]*?)\1/,
    wrap: (title, m) => m[0]!.replace(m[2]!, title),
  },
  {
    // Negated-close inner + `|$` fallback: disjoint branches cannot backtrack,
    // and the fallback stops an unterminated <title> from forcing a rescan to
    // end-of-input from every start position (js/polynomial-redos).
    re: /(<title\b[^>]*>)((?:[^<]|<(?!\/title[\s>]))*)(<\/title[^>]*>|$)/i,
    wrap: (title, m) => `${m[1]}${title}${m[3]}`,
  },
  {
    re: /title:\s*(["'`])([\s\S]*?)\1/,
    wrap: (title, m) => `title: ${m[1]}${title}${m[1]}`,
  },
];

export function rewriteTitle(
  source: string,
  next: string,
): { ok: true; after: string } | { ok: false; error: string } {
  for (const p of TITLE_PATTERNS) {
    p.re.lastIndex = 0;
    const m = p.re.exec(source);
    if (m) {
      const after =
        source.slice(0, m.index) +
        p.wrap(next, m) +
        source.slice(m.index + m[0].length);
      return { ok: true, after };
    }
  }
  if (/export const metadata/.test(source)) {
    const after = source.replace(
      /export const metadata\s*=\s*\{/,
      `export const metadata = {\n  title: ${JSON.stringify(next)},`,
    );
    if (after !== source) return { ok: true, after };
  }
  return { ok: false, error: "no title field found in file" };
}

export function rewriteBody(
  source: string,
  next: string,
): { ok: true; after: string } | { ok: false; error: string } {
  const fm = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (fm) {
    return { ok: true, after: fm[0] + next.replace(/^\n/, "") };
  }
  const main = /(<main\b[^>]*>)((?:[^<]|<(?!\/main[\s>]))*)(<\/main[^>]*>|$)/i.exec(
    source,
  );
  if (main && main.index !== undefined) {
    const inner = markdownToHtml(next);
    const after =
      source.slice(0, main.index) +
      `${main[1]}${inner}${main[3]}` +
      source.slice(main.index + main[0].length);
    return { ok: true, after };
  }
  const article =
    /(<article\b[^>]*>)((?:[^<]|<(?!\/article[\s>]))*)(<\/article[^>]*>|$)/i.exec(
      source,
    );
  if (article && article.index !== undefined) {
    const inner = markdownToHtml(next);
    const after =
      source.slice(0, article.index) +
      `${article[1]}${inner}${article[3]}` +
      source.slice(article.index + article[0].length);
    return { ok: true, after };
  }
  if (/^#\s+/m.test(source) || source.trim().length < 40) {
    return { ok: true, after: next };
  }
  return { ok: true, after: next };
}

function markdownToHtml(md: string): string {
  const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `\n${escaped}\n`;
}

export function titleInSource(source: string): string | null {
  const html = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source);
  if (html?.[1]) return html[1].trim();
  const def = /title:\s*\{[^{}]*default:\s*(["'`])([\s\S]*?)\1/.exec(source);
  if (def?.[2]) return def[2];
  const simple = /title:\s*(["'`])([\s\S]*?)\1/.exec(source);
  if (simple?.[2]) return simple[2];
  return null;
}
