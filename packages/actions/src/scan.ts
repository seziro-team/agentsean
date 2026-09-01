/**
 * Output-side scanners. Applied to Action text, never to crawled input.
 * Classifiers score ~60% on benign SEO trigger words — that is why we scan
 * what we would write, not what we read.
 */

function inRange(cp: number, a: number, b: number): boolean {
  return cp >= a && cp <= b;
}

function classifyInvisible(cp: number): string | null {
  if (inRange(cp, 0xe0000, 0xe007f)) return "tag_block";
  if (cp === 0x200e || cp === 0x200f || inRange(cp, 0x202a, 0x202e) || inRange(cp, 0x2066, 0x2069)) {
    return "bidi";
  }
  if (inRange(cp, 0x200b, 0x200d) || cp === 0x2060 || cp === 0xfeff || cp === 0x180e) {
    return "zero_width";
  }
  if (
    cp === 0x00ad ||
    cp === 0x034f ||
    cp === 0x061c ||
    cp === 0x115f ||
    cp === 0x1160 ||
    cp === 0x17b4 ||
    cp === 0x17b5 ||
    cp === 0x3164 ||
    cp === 0xffa0
  ) {
    return "other_invisible";
  }
  if (inRange(cp, 0x00, 0x08) || cp === 0x0b || cp === 0x0c || inRange(cp, 0x0e, 0x1f) || inRange(cp, 0x7f, 0x9f)) {
    return "ctrl";
  }
  if (inRange(cp, 0xfe00, 0xfe0f) || inRange(cp, 0xe0100, 0xe01ef)) return "variation";
  return null;
}

export const BANNED_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "ignore_previous", re: /ignore\s+(all\s+)?(previous|prior|above)/i },
  { id: "disregard_previous", re: /disregard\s+(the\s+)?(previous|above)/i },
  { id: "system_prompt", re: /system\s+prompt/i },
  { id: "you_are_now", re: /you\s+are\s+(now\s+)?an?\s+/i },
  { id: "system_tag", re: /<\/?system>/i },
  { id: "special_token", re: /<\|.*?\|>/ },
  { id: "inst_tag", re: /\[INST\]/i },
  { id: "instruction_header", re: /###\s*Instruction/i },
  { id: "assistant_colon", re: /\bassistant:/i },
  { id: "developer_mode", re: /developer\s+mode/i },
  { id: "do_anything_now", re: /do\s+anything\s+now/i },
  { id: "jailbreak", re: /\bjailbreak\b/i },
  { id: "prompt_injection", re: /prompt\s+injection/i },
  { id: "ai_agent_colon", re: /AI\s+agent:/i },
  { id: "llm_colon", re: /\bLLM:/ },
  { id: "x_ai_colon", re: /\bX-AI:/i },
  { id: "missing_license", re: /MissingLicenseKeyException/i },
  { id: "eth_address", re: /\b0x[a-fA-F0-9]{40}\b/ },
  { id: "bc1", re: /\bbc1[a-z0-9]{25,}\b/ },
  { id: "rm_rf", re: /\brm\s+-rf\b/ },
  { id: "drop_table", re: /\bDROP\s+TABLE\b/i },
  { id: "script_tag", re: /<script\b/i },
  { id: "javascript_url", re: /javascript:/i },
  { id: "data_html", re: /data:text\/html/i },
];

const CYRILLIC_FOLD: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ѕ: "s",
  ї: "i",
};

export function foldHomoglyphs(text: string): string {
  return [...text]
    .map((ch) => {
      const lower = ch.toLowerCase();
      return CYRILLIC_FOLD[lower] ?? ch;
    })
    .join("");
}

export function invisibleHits(text: string): { count: number; kinds: string[] } {
  const kindSet = new Set<string>();
  let count = 0;
  for (const ch of text) {
    const kind = classifyInvisible(ch.codePointAt(0) ?? 0);
    if (kind) {
      count += 1;
      kindSet.add(kind);
    }
  }
  return { count, kinds: [...kindSet] };
}

export function stripInvisible(text: string): string {
  let out = "";
  for (const ch of text) {
    if (!classifyInvisible(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}

export function bannedHits(text: string): string[] {
  const folded = foldHomoglyphs(text.normalize("NFKC"));
  const hits: string[] = [];
  for (const p of BANNED_PATTERNS) {
    p.re.lastIndex = 0;
    if (p.re.test(folded) || p.re.test(text)) hits.push(p.id);
  }
  return hits;
}

function tryDecodeBase64(chunk: string): string | null {
  if (chunk.length < 40 || chunk.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(chunk) && !/^[A-Za-z0-9_-]+=*$/.test(chunk)) return null;
  try {
    const buf = Buffer.from(chunk.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (buf.length < 8) return null;
    const s = buf.toString("utf8");
    const printable = [...s].filter((c) => c >= " " && c <= "~" || c === "\n").length;
    if (printable / s.length < 0.6) return null;
    return s;
  } catch {
    return null;
  }
}

const BASE64_CHUNK = /[A-Za-z0-9+/_-]{40,}={0,2}/g;
const PCT_SEQ = /(?:%[0-9a-fA-F]{2}){8,}/g;
const ENTITY_SEQ = /(?:&#(?:x[0-9a-fA-F]+|\d+);){10,}/gi;
const U_ESCAPE = /(?:\\u[0-9a-fA-F]{4}){4,}/g;
const HEX_BLOB = /(?:[0-9a-fA-F]{2}){20,}/g;

function decodeEntities(seq: string): string {
  return seq.replace(/&#x([0-9a-fA-F]+);/gi, (_, h: string) =>
    String.fromCodePoint(Number.parseInt(h, 16)),
  ).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number.parseInt(d, 10)));
}

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export function encodedPayloadHits(text: string): string[] {
  const hits: string[] = [];
  const candidates: string[] = [];
  for (const m of text.match(BASE64_CHUNK) ?? []) {
    const dec = tryDecodeBase64(m);
    if (dec) candidates.push(dec);
  }
  for (const m of text.match(PCT_SEQ) ?? []) {
    try {
      candidates.push(decodeURIComponent(m));
    } catch {
      /* ignore */
    }
  }
  for (const m of text.match(ENTITY_SEQ) ?? []) {
    candidates.push(decodeEntities(m));
  }
  for (const m of text.match(U_ESCAPE) ?? []) {
    candidates.push(
      m.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) =>
        String.fromCharCode(Number.parseInt(h, 16)),
      ),
    );
  }
  for (const m of text.match(HEX_BLOB) ?? []) {
    try {
      const buf = Buffer.from(m, "hex");
      const s = buf.toString("utf8");
      const printable = [...s].filter((c) => c >= " " && c <= "~").length;
      if (s.length && printable / s.length >= 0.6) candidates.push(s);
    } catch {
      /* ignore */
    }
  }
  candidates.push(rot13(text));
  for (const c of candidates) {
    const banned = bannedHits(c);
    if (banned.length) hits.push(...banned.map((id) => `encoded:${id}`));
  }
  return [...new Set(hits)];
}

export function collectActionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(collectActionText).join("\n");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(collectActionText)
      .join("\n");
  }
  return "";
}
