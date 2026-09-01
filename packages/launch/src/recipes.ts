export type Recipe = {
  id: string;
  title: string;
  summary: string;
  cms: string[];
  href: string;
  steps: string[];
};

export const RECIPES: Recipe[] = [
  {
    id: "fix-title-tags-wordpress",
    title: "Fix title tags on WordPress",
    summary:
      "Sean writes unique titles through the companion plugin, verifies live HTML, and stores a revert snapshot.",
    cms: ["wordpress"],
    href: "/recipes/fix-title-tags-wordpress.html",
    steps: [
      "Install sean-bridge and create an Application Password.",
      "sean connect wordpress --api-key USER:APP_PASSWORD https://example.com",
      "sean apply — T1 title-tag Actions apply automatically after the observe window.",
      "Click Revert on any change. The shadow ledger restores the previous post meta.",
    ],
  },
  {
    id: "fix-orphaned-pages-shopify",
    title: "Fix orphaned pages on a Shopify store",
    summary:
      "Internal-link Actions go to metafields. Theme writes are refused — Shopify write_themes stays denied.",
    cms: ["shopify"],
    href: "/recipes/fix-orphaned-pages-shopify.html",
    steps: [
      "sean connect shopify --api-key shpat_… mystore.myshopify.com",
      "Sean lists pages with zero inbound links from the crawl graph.",
      "An Action proposes a metafield + a merchant-pasted snippet. Sean never writes the theme.",
      "Verify-by-refetch. Revert restores the previous metafield value.",
    ],
  },
  {
    id: "git-pr-title-tags-nextjs",
    title: "Open a Git PR for Next.js title tags",
    summary:
      "The git adapter writes a reviewable diff against the customer's source of truth.",
    cms: ["git"],
    href: "/recipes/git-pr-title-tags-nextjs.html",
    steps: [
      "sean apply --repo ./my-next-app",
      "Sean plans title-tag Actions, runs the 15-check validator, opens a PR.",
      "Merge is yours. Revert is another PR from the shadow-ledger snapshot.",
    ],
  },
  {
    id: "refresh-decaying-content",
    title: "Refresh a decaying page",
    summary:
      "Daily, Sean picks a page whose GSC clicks are falling, rewrites it, runs PublishGate, and publishes. 2 refreshes/day, not overridable.",
    cms: ["wordpress", "git", "shopify"],
    href: "/recipes/refresh-decaying-content.html",
    steps: [
      "Connect Google so clicks exist. Default metric is clicks.",
      "sean content — or wait for the daily job.",
      "PublishGate refuses YMYL, affiliate, and thin rewrites.",
      "newPagesPerDay=2 and contentRefreshPerDay=2 cannot be raised.",
    ],
  },
  {
    id: "faq-schema-from-gsc",
    title: "FAQ schema from Search Console queries",
    summary:
      "Schema is a check, not an AEO lever. Sean will not sell llms.txt, word count, or FAQ schema as AI-citation tactics.",
    cms: ["wordpress", "git"],
    href: "/recipes/faq-schema-from-gsc.html",
    steps: [
      "Pull GSC queries for a URL.",
      "If the page already answers them, Sean may add FAQPage JSON-LD.",
      "If it does not, Sean refreshes the copy first. Schema without the answer is refused.",
    ],
  },
  {
    id: "internal-links-pillar",
    title: "Build internal links into a pillar page",
    summary: "Deterministic graph, not an LLM with write credentials.",
    cms: ["wordpress", "git", "shopify"],
    href: "/recipes/internal-links-pillar.html",
    steps: [
      "Crawl produces the link graph.",
      "Sean queues T2 internal-link Actions onto relevant pages.",
      "Each apply is verified by re-fetching live HTML.",
    ],
  },
  {
    id: "gbp-local-pack",
    title: "Keep a Google Business Profile inside quota",
    summary:
      "10 edits/min, 300 QPM, and 0 QPM until the location is approved. Sean will not generate reviews (T4).",
    cms: ["other"],
    href: "/recipes/gbp-local-pack.html",
    steps: [
      "sean local — detect the GBP and the quota remaining.",
      "Safe edits (hours, categories) apply; review generation is refused.",
      "City×service pages are T4 and are not created unbounded.",
    ],
  },
  {
    id: "ai-citation-share",
    title: "Measure AI citation share",
    summary:
      "~$1.11/run across ~20 prompts × 2 engines. Training crawlers ≠ citation crawlers. Schema and llms.txt are not sold as levers.",
    cms: ["other"],
    href: "/recipes/ai-citation-share.html",
    steps: [
      "sean visibility",
      "Bing Webmaster AI CSV is import-only — there is no API.",
      "robots.txt is checked for accidental training-crawler blocks vs citation-crawler blocks.",
    ],
  },
  {
    id: "brand-mentions-outreach",
    title: "Mention-first outreach",
    summary:
      "Find unlinked brand mentions. Sending email is T3 two-key. Sean does not buy links.",
    cms: ["other"],
    href: "/recipes/brand-mentions-outreach.html",
    steps: [
      "sean mentions",
      "Review the draft. Two-key send is not overridable.",
      "T4 review generation and paid placements are refused.",
    ],
  },
  {
    id: "cloudflare-edge-squarespace",
    title: "Edge overlay for Squarespace / Framer / Duda",
    summary: "The worker never branches on user-agent. That is the cloaking line.",
    cms: ["cloudflare"],
    href: "/recipes/cloudflare-edge-squarespace.html",
    steps: [
      "sean connect cloudflare",
      "Title-tag overlays apply to HTML for every client.",
      "A crawler-only branch is a bug. Tests assert one response.",
    ],
  },
  {
    id: "revert-a-change",
    title: "Revert a live change",
    summary: "Every write has a before-snapshot. One click, or sean revert <id>.",
    cms: ["wordpress", "shopify", "git", "cloudflare"],
    href: "/recipes/revert-a-change.html",
    steps: [
      "Open Activity. Every applied Action has Revert.",
      "sean revert <changeId>",
      "Verify-by-refetch confirms the old HTML is back.",
    ],
  },
  {
    id: "freeze-writes",
    title: "Freeze every write",
    summary:
      "sean freeze writes HALT and survives restart. The kill switch is the product.",
    cms: ["other"],
    href: "/recipes/freeze-writes.html",
    steps: [
      "sean freeze",
      "Confirm the dashboard banner.",
      "sean unfreeze when ready.",
    ],
  },
  {
    id: "observe-then-apply",
    title: "Observe, then apply",
    summary: "7-day observe-only on a new site, shortenable to 24h, not to zero.",
    cms: ["other"],
    href: "/recipes/observe-then-apply.html",
    steps: [
      "Onboard a site. Auto-apply waits out observeUntil.",
      "Settings will not accept observeDays: 0.",
      "T3 still needs two keys after the window.",
    ],
  },
  {
    id: "bing-volume-no-paid-key",
    title: "Keyword volume with zero paid keys",
    summary: "GSC + Bing + autocomplete. Sean never scrapes Google.",
    cms: ["other"],
    href: "/recipes/bing-volume-no-paid-key.html",
    steps: [
      "sean keywords",
      "DataForSEO is an upgrade for rank tracking, not a requirement.",
      "Default metric is clicks. Impressions 2025-05-13 to 2026-04-27 are contaminated.",
    ],
  },
  {
    id: "evidence-tier-report",
    title: "Report with an evidence tier",
    summary:
      "Causation only at tier A. Small sites mostly land in E — applied, not measurable.",
    cms: ["other"],
    href: "/recipes/evidence-tier-report.html",
    steps: [
      "sean measure",
      "Every claim carries A–E.",
      "Sean will not claim a ranking lift it cannot support.",
    ],
  },
  {
    id: "connect-google-byo",
    title: "Bring your own Google Cloud project",
    summary:
      "The hosted broker never talks to this machine. --byo publishes to Production on your project.",
    cms: ["other"],
    href: "/recipes/connect-google-byo.html",
    steps: [
      "sean connect google --byo --credentials ./client_secret.json",
      "The dashboard at 127.0.0.1:7777/connect runs the loopback OAuth dance.",
      "Sensitive-scope, not CASA.",
    ],
  },
  {
    id: "agency-ten-sites",
    title: "Run ten client sites on Agency",
    summary:
      "Cloud Agency is $249/mo for 25–50 sites. Hosted never stores CMS write credentials.",
    cms: ["other"],
    href: "/recipes/agency-ten-sites.html",
    steps: [
      "sean signup agency",
      "Pair a customer-side connector per site.",
      "sean tenant — per-tenant cost visibility.",
    ],
  },
  {
    id: "city-service-pages-refused",
    title: "City × service pages are refused",
    summary: "Unbounded location pages are T4. The honest recipe is: do not do this.",
    cms: ["other"],
    href: "/recipes/city-service-pages-refused.html",
    steps: [
      "A request to create_city_service_page is refused.",
      "Use GBP + a handful of real location pages you will maintain.",
      "Scaled location spam is how sites earn a manual action.",
    ],
  },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
