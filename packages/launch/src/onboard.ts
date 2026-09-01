export const CMS_KINDS = [
  "wordpress",
  "shopify",
  "git",
  "cloudflare",
  "other",
] as const;
export type CmsKind = (typeof CMS_KINDS)[number];

export type OnboardQuestion = {
  id: "url" | "cms" | "google" | "telemetry";
  prompt: string;
  required: boolean;
  options?: string[];
};

/** Four questions. Service install is a separate command (marketplace guideline). */
export const ONBOARD_QUESTIONS: OnboardQuestion[] = [
  {
    id: "url",
    prompt: "What site should Sean work on?",
    required: true,
  },
  {
    id: "cms",
    prompt: "Where does the site live?",
    required: true,
    options: [...CMS_KINDS],
  },
  {
    id: "google",
    prompt: "Connect Google Search Console now? Audit works without it.",
    required: false,
    options: ["yes", "later"],
  },
  {
    id: "telemetry",
    prompt:
      "Share anonymous usage events? Never domains, URLs, queries, keys, or IPs. Honor DO_NOT_TRACK=1.",
    required: false,
    options: ["yes", "no"],
  },
];

export type OnboardAnswers = {
  url: string;
  cms: CmsKind;
  google: "yes" | "later";
  telemetry: boolean;
};

export function parseCms(raw: string | undefined): CmsKind | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return (CMS_KINDS as readonly string[]).includes(v) ? (v as CmsKind) : undefined;
}

export function parseSiteUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}

export const SERVICE_HINT =
  "Sean is running for this session. To survive reboot, run `sean service install` — it prints the exact files it will write and is never a side effect of npm or onboard.";

export const NOT_OUR_JOB = [
  "stakeholder negotiation",
  "strategy arguments",
  "deciding whether a business should want the traffic",
];
