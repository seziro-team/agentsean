import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonLdBlock } from "@agentsean/crawler";

type Vocab = {
  version: string;
  types: Record<string, string[]>;
  enums: Record<string, string[]>;
};

type Supported = {
  version: string;
  fetched: string;
  supported: string[];
  deprecated: Record<string, string>;
  features: Record<string, { required: string[]; recommended: string[] }>;
};

function loadJson<T>(name: string): T {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "data", name),
    path.join(here, "../src/data", name),
    path.join(here, "../../src/data", name),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as T;
    } catch {
      /* try next */
    }
  }
  throw new Error(`missing data file ${name}`);
}

let vocabCache: Vocab | undefined;
let supportedCache: Supported | undefined;

export function schemaVocab(): Vocab {
  vocabCache ??= loadJson<Vocab>("schemaorg-vocab.json");
  return vocabCache;
}

export function googleSupportedTypes(): Supported {
  supportedCache ??= loadJson<Supported>("supported_types.json");
  return supportedCache;
}

export type JsonLdIssue = {
  code:
    | "PARSE_ERROR"
    | "MISSING_CONTEXT"
    | "MISSING_TYPE"
    | "UNKNOWN_TYPE"
    | "TYPE_DEPRECATED"
    | "MISSING_REQUIRED_PROP"
    | "MISSING_RECOMMENDED_PROP"
    | "INVALID_ENUM"
    | "INVALID_DATE"
    | "INVALID_DURATION";
  message: string;
  type: string | null;
  property: string | null;
};

export function validateJsonLdBlocks(blocks: JsonLdBlock[]): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];
  for (const block of blocks) {
    if (block.error) {
      issues.push({
        code: "PARSE_ERROR",
        message: block.error,
        type: null,
        property: null,
      });
      continue;
    }
    issues.push(...validateNode(block.parsed));
  }
  return issues;
}

function validateNode(node: unknown, acc: JsonLdIssue[] = []): JsonLdIssue[] {
  if (Array.isArray(node)) {
    for (const n of node) validateNode(n, acc);
    return acc;
  }
  if (!node || typeof node !== "object") return acc;
  const obj = node as Record<string, unknown>;
  if (obj["@graph"]) {
    validateNode(obj["@graph"], acc);
    return acc;
  }
  const ctx = obj["@context"];
  const typeVal = obj["@type"];
  if (ctx === undefined) {
    acc.push({
      code: "MISSING_CONTEXT",
      message: "No @context",
      type: null,
      property: "@context",
    });
  } else if (typeof ctx === "string" && !ctx.includes("schema.org")) {
    acc.push({
      code: "MISSING_CONTEXT",
      message: `@context is not schema.org: ${ctx}`,
      type: null,
      property: "@context",
    });
  }
  if (typeVal === undefined) {
    acc.push({
      code: "MISSING_TYPE",
      message: "No @type",
      type: null,
      property: "@type",
    });
    return acc;
  }
  const types = Array.isArray(typeVal) ? typeVal.map(String) : [String(typeVal)];
  const vocab = schemaVocab();
  const gallery = googleSupportedTypes();
  for (const t of types) {
    const short = t.replace(/^https?:\/\/schema\.org\//, "");
    if (!(short in vocab.types) && !gallery.supported.includes(short)) {
      acc.push({
        code: "UNKNOWN_TYPE",
        message: `Unknown @type ${short}`,
        type: short,
        property: "@type",
      });
    }
    if (short in gallery.deprecated) {
      acc.push({
        code: "TYPE_DEPRECATED",
        message: gallery.deprecated[short] ?? "deprecated",
        type: short,
        property: "@type",
      });
    }
    const feature = gallery.features[short];
    if (feature) {
      for (const req of feature.required) {
        if (obj[req] === undefined) {
          acc.push({
            code: "MISSING_REQUIRED_PROP",
            message: `${short} missing required ${req}`,
            type: short,
            property: req,
          });
        }
      }
      for (const rec of feature.recommended) {
        if (obj[rec] === undefined) {
          acc.push({
            code: "MISSING_RECOMMENDED_PROP",
            message: `${short} missing recommended ${rec}`,
            type: short,
            property: rec,
          });
        }
      }
    }
    if (typeof obj["availability"] === "string") {
      const allowed = vocab.enums["ItemAvailability"] ?? [];
      const v = String(obj["availability"]);
      if (
        allowed.length &&
        !allowed.includes(v) &&
        !allowed.includes(`https://schema.org/${v}`)
      ) {
        acc.push({
          code: "INVALID_ENUM",
          message: `Bad availability ${v}`,
          type: short,
          property: "availability",
        });
      }
    }
    for (const key of ["datePublished", "dateModified", "startDate", "endDate", "datePosted"]) {
      const v = obj[key];
      if (typeof v === "string" && !isIsoDate(v)) {
        acc.push({
          code: "INVALID_DATE",
          message: `${key} is not ISO 8601`,
          type: short,
          property: key,
        });
      }
    }
    for (const key of ["prepTime", "cookTime", "duration"]) {
      const v = obj[key];
      if (typeof v === "string" && !v.startsWith("P")) {
        acc.push({
          code: "INVALID_DURATION",
          message: `${key} is not ISO 8601 duration`,
          type: short,
          property: key,
        });
      }
    }
  }
  return acc;
}

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(v);
}

export function flattenTypes(node: unknown, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) flattenTypes(n, acc);
    return acc;
  }
  if (!node || typeof node !== "object") return acc;
  const obj = node as Record<string, unknown>;
  if (obj["@graph"]) return flattenTypes(obj["@graph"], acc);
  const t = obj["@type"];
  if (t) {
    for (const x of Array.isArray(t) ? t : [t]) {
      acc.push(String(x).replace(/^https?:\/\/schema\.org\//, ""));
    }
  }
  return acc;
}
