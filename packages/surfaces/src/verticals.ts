export const VERTICAL_PRESETS = [
  "b2b_saas",
  "b2b_lead_gen",
  "publisher_news",
  "marketplace_ugc",
  "affiliate_review",
  "multi_location",
  "jobs_classifieds",
  "ymyl",
] as const;

export type VerticalPreset = (typeof VERTICAL_PRESETS)[number];

export type VerticalSignal = {
  id: string;
  hit: boolean;
  pointsTo: VerticalPreset;
  weight: number;
};

export type VerticalInput = {
  urls: string[];
  titles: string[];
  jsonLdTypes: string[];
  outboundSponsoredShare: number;
  telLinkShare: number;
  gscNewsRows: number;
  gscDiscoverShare: number;
  newsSitemap: boolean;
  publishVelocity30d: number;
  jobPostingCount: number;
  sitemapUrlCount: number;
  productSellerVaries: boolean;
  profileUrlCount: number;
  localityCount: number;
  eeaTrafficShare: number;
  hasPricing: boolean;
  hasDemoOrSignup: boolean;
  hasComparePaths: boolean;
  medicalLexiconShare: number;
};

export const ONBOARDING_QUESTIONS = [
  {
    id: "win",
    prompt: "What does a win look like?",
    options: [
      "signups/trials",
      "demo requests or quote forms",
      "phone calls or bookings",
      "ad revenue / pageviews",
      "subscriptions",
      "listings posted or applications",
      "affiliate clicks/commissions",
      "transactions on the platform",
    ],
  },
  {
    id: "indexable",
    prompt: "Roughly how many pages should be in Google?",
    options: ["<100", "100–2k", "2k–50k", "50k–1M", ">1M"],
  },
  {
    id: "velocity",
    prompt: "Do you publish new content more than 3× per week?",
    options: ["yes", "no"],
  },
  {
    id: "third_party",
    prompt: "Is any of your content written by people who don't work for you?",
    options: ["yes", "no", "some"],
  },
  {
    id: "regulated",
    prompt: "Are you in a regulated space?",
    options: ["health/medical", "finance/insurance", "legal", "none"],
  },
  {
    id: "geo",
    prompt: "Where do you serve customers?",
    options: [
      "one location",
      "multiple named locations",
      "a region/country",
      "globally, online only",
    ],
  },
] as const;

const SAAS_SUPPRESS = 41;

function signal(
  id: string,
  hit: boolean,
  pointsTo: VerticalPreset,
  weight = 1,
): VerticalSignal {
  return { id, hit, pointsTo, weight };
}

export function scoreSignals(input: VerticalInput): VerticalSignal[] {
  const urls = input.urls.map((u) => u.toLowerCase());
  return [
    signal("S1", input.gscNewsRows > 0, "publisher_news", 3),
    signal("S2", input.gscDiscoverShare > 0.3, "publisher_news", 2),
    signal("S3", input.newsSitemap, "publisher_news", 2),
    signal(
      "S4",
      input.jsonLdTypes.filter((t) => /NewsArticle/i.test(t)).length > 0,
      "publisher_news",
    ),
    signal("S5", input.publishVelocity30d > 30, "publisher_news"),
    signal("S6", input.jobPostingCount > 50, "jobs_classifieds", 3),
    signal("S7", input.sitemapUrlCount > 100_000, "marketplace_ugc", 2),
    signal("S8", input.productSellerVaries, "marketplace_ugc", 2),
    signal("S9", input.profileUrlCount > 1000, "marketplace_ugc"),
    signal(
      "S10",
      input.jsonLdTypes.some((t) => /DiscussionForumPosting|QAPage/i.test(t)),
      "marketplace_ugc",
    ),
    signal("S11", input.hasPricing && input.hasDemoOrSignup, "b2b_saas", 3),
    signal(
      "S12",
      urls.some((u) => /\/(vs|alternatives|compare|integrations)\b/.test(u)),
      "b2b_saas",
      2,
    ),
    signal(
      "S13",
      input.urls.length < 2000 && input.hasPricing && !input.productSellerVaries,
      "b2b_saas",
      2,
    ),
    signal("S14", input.telLinkShare > 0.6 && !input.hasPricing, "b2b_lead_gen", 2),
    signal(
      "S15",
      urls.some((u) => /\/(locations|store-locator|branches|find-a)\b/.test(u)),
      "multi_location",
      3,
    ),
    signal("S16", input.localityCount >= 5, "multi_location", 2),
    signal("S17", input.outboundSponsoredShare > 0.15, "affiliate_review", 3),
    signal(
      "S18",
      input.titles.filter((t) => /\bbest |\breview\b|\b vs \b|\btop \d/i.test(t))
        .length /
        Math.max(input.titles.length, 1) >
        0.3,
      "affiliate_review",
      2,
    ),
    signal(
      "S19",
      input.jsonLdTypes.some((t) => t === "Paywalled"),
      "publisher_news",
    ),
    signal(
      "S20",
      input.jsonLdTypes.some((t) =>
        /MedicalWebPage|Physician|MedicalClinic/i.test(t),
      ) || input.medicalLexiconShare > 0.1,
      "ymyl",
      3,
    ),
    signal(
      "S21",
      urls.filter((u) => /\/(homes|property|for-sale)\b/.test(u)).length > 1000,
      "jobs_classifieds",
    ),
    signal(
      "S22",
      input.jsonLdTypes.some((t) => /Vehicle|Car/i.test(t)),
      "jobs_classifieds",
    ),
    signal("S23", input.medicalLexiconShare > 0.2, "ymyl", 2),
    signal("S24", input.eeaTrafficShare > 0.5, "publisher_news", 0.2),
  ];
}

export function detectVertical(input: VerticalInput): {
  preset: VerticalPreset;
  confidence: number;
  signals: VerticalSignal[];
  suppressedChecks: number;
  v1: boolean;
} {
  const signals = scoreSignals(input);
  const scores = new Map<VerticalPreset, number>();
  for (const p of VERTICAL_PRESETS) scores.set(p, 0);
  let total = 0;
  for (const s of signals) {
    if (!s.hit) continue;
    scores.set(s.pointsTo, (scores.get(s.pointsTo) ?? 0) + s.weight);
    total += s.weight;
  }
  let preset: VerticalPreset = "b2b_saas";
  let best = -1;
  for (const p of VERTICAL_PRESETS) {
    const v = scores.get(p) ?? 0;
    if (v > best) {
      best = v;
      preset = p;
    }
  }
  if (best <= 0) preset = "b2b_saas";
  const confidence = total === 0 ? 0.4 : Math.min(1, best / Math.max(total, 1));
  return {
    preset,
    confidence,
    signals: signals.filter((s) => s.hit),
    suppressedChecks: preset === "b2b_saas" ? SAAS_SUPPRESS : 12,
    v1: preset === "b2b_saas" || preset === "multi_location",
  };
}

export function contentGenerationBlocked(preset: VerticalPreset): boolean {
  return preset === "affiliate_review" || preset === "ymyl";
}

export function ymylCategoryFor(preset: VerticalPreset): string | null {
  if (preset === "ymyl") return "ymyl";
  if (preset === "affiliate_review") return "affiliate";
  return null;
}

export function verticalRules(preset: VerticalPreset): string[] {
  switch (preset) {
    case "b2b_saas":
      return [
        "Add bottom-funnel pages (/vs, /alternatives, /integrations).",
        "Refresh decaying blog posts before minting URLs.",
        "Git-backed execution as a PR.",
      ];
    case "marketplace_ugc":
      return [
        "Stop indexing thin template pages.",
        "Faceted nav: robots.txt disallow is preferred (Google 2025-12-18).",
      ];
    case "publisher_news":
      return ["Split Discover vs web alerts.", "Do not generate scaled news URLs."];
    case "affiliate_review":
      return [
        "Content generation is T4 hard-blocked.",
        "Thin affiliation is a spam policy.",
      ];
    case "ymyl":
      return [
        "Content generation is T4 hard-blocked.",
        "Human review required for any medical/finance/legal claim.",
      ];
    case "multi_location":
      return [
        "City×service pages are T4 unless unique data per URL.",
        "GBP hours/categories are the safe writes.",
      ];
    case "b2b_lead_gen":
      return ["Prioritize NAP, quote forms, and call tracking over blog volume."];
    case "jobs_classifieds":
      return ["Indexation control first; expired listings must 404/410."];
    default:
      return [];
  }
}
