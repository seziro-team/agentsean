/**
 * Adapted from OpenSEO `src/shared/audit-issues.ts` (MIT).
 * Copyright (c) 2026 Ben Senescu and contributors.
 *
 * Descriptor shape kept: severity, title, explanation, howToFix.
 * IDs remapped onto Agent Sean's check catalogue (research/01-technical-seo.md).
 * User-facing copy is adapted; this is not a fork of OpenSEO.
 */
export type OpenSeoDescriptor = {
  title: string;
  explanation: string;
  howToFix: string;
};

export const OPENSEO_SEED_TO_CHECK: Record<string, string> = {
  "blocked-page": "RESP.4XX_INTERNAL",
  "server-error": "RESP.5XX_INTERNAL",
  "broken-internal-link": "LINK.BROKEN_INTERNAL",
  "missing-title": "ONP.TITLE_MISSING",
  "broken-page": "RESP.4XX_INTERNAL",
  "duplicate-title": "ONP.TITLE_DUPLICATE",
  "duplicate-meta-description": "ONP.META_DESC_DUPLICATE",
  "duplicate-content": "DUP.EXACT_BODY",
  "missing-meta-description": "ONP.META_DESC_MISSING",
  "missing-h1": "ONP.H1_MISSING",
  "multiple-h1": "ONP.H1_MULTIPLE",
  "redirect-chain": "RESP.REDIRECT_CHAIN",
  "redirect-loop": "RESP.REDIRECT_LOOP",
  "canonical-conflict": "CANON.HTML_HEADER_MISMATCH",
  "thin-content": "THIN.LOW_WORDCOUNT",
  "images-missing-alt": "IMG.MISSING_ALT_ATTR",
  "orphan-page": "CRAWL.ORPHAN",
  "no-outgoing-links": "LINK.NO_OUTLINKS",
  "title-too-long": "ONP.TITLE_TOO_LONG",
  "title-too-short": "ONP.TITLE_TOO_SHORT",
  "meta-description-too-long": "ONP.META_DESC_TOO_LONG",
  "meta-description-too-short": "ONP.META_DESC_TOO_SHORT",
  "heading-order-skip": "ONP.H_NON_SEQUENTIAL",
  "slow-response": "RESP.SLOW_TTFB",
  "noindex-page": "DIRECT.NOINDEX_UNEXPECTED",
  "canonicalized-page": "CANON.CANONICALISED",
  "deep-page": "CRAWL.DEPTH_GT_5",
};

export const OPENSEO_COPY: Record<string, OpenSeoDescriptor> = {
  "RESP.5XX_INTERNAL": {
    title: "Server error (5xx)",
    explanation:
      "The page returned a 5xx server error. Search engines that repeatedly see server errors will crawl the site less and may drop the page from the index.",
    howToFix:
      "Check the server logs for this URL and fix the underlying error. If the page is gone, return a 404/410 or redirect it to a relevant page instead of erroring.",
  },
  "LINK.BROKEN_INTERNAL": {
    title: "Broken internal link",
    explanation:
      "This page links to an internal URL that returns an error status (4xx/5xx). Broken links waste crawl budget, leak link equity, and frustrate users.",
    howToFix:
      "Update the link to point at the correct live URL, or remove it. If the target was moved, prefer linking directly to the new URL rather than relying on a redirect.",
  },
  "ONP.TITLE_MISSING": {
    title: "Missing title tag",
    explanation:
      "The page has no <title>. The title is the strongest on-page relevance signal and the headline shown in search results; without it search engines generate one themselves, usually badly.",
    howToFix:
      "Add a unique, descriptive <title> of roughly 50–60 characters that includes the page's primary topic.",
  },
  "RESP.4XX_INTERNAL": {
    title: "Page returns an error (4xx)",
    explanation:
      "This crawled URL returned a client error (e.g. 404). If it is referenced from your sitemap or other pages, crawlers keep wasting requests on it.",
    howToFix:
      "If the page should exist, restore it. If it is intentionally gone, remove it from the sitemap and internal links, and consider a 301 redirect to the closest live page.",
  },
  "ONP.TITLE_DUPLICATE": {
    title: "Duplicate title",
    explanation:
      "Multiple pages share the same title tag. Search engines use titles to differentiate pages; duplicates make pages compete with each other.",
    howToFix: "Write a unique title for each page describing its specific content.",
  },
  "ONP.META_DESC_DUPLICATE": {
    title: "Duplicate meta description",
    explanation:
      "Multiple pages share the same meta description, so search results show identical snippets.",
    howToFix: "Write a unique meta description per page.",
  },
  "DUP.EXACT_BODY": {
    title: "Duplicate page content",
    explanation:
      "Two or more URLs serve byte-identical visible text. Search engines pick one version to index and ignore the rest.",
    howToFix:
      "Consolidate duplicates: pick the canonical URL, add rel=canonical from the others, and 301-redirect duplicate URLs where possible.",
  },
  "ONP.META_DESC_MISSING": {
    title: "Missing meta description",
    explanation:
      "The page has no meta description. Search engines will assemble a snippet from page text.",
    howToFix:
      "Add a meta description of roughly 70–160 characters that summarizes the page.",
  },
  "ONP.H1_MISSING": {
    title: "Missing H1 heading",
    explanation:
      "The page has no H1. The H1 tells users and search engines what the page is about.",
    howToFix: "Add a single H1 that states the page's main topic.",
  },
  "ONP.H1_MULTIPLE": {
    title: "Multiple H1 headings",
    explanation: "The page has more than one H1, which dilutes the main-topic signal.",
    howToFix: "Keep one H1 for the page's main heading and demote the others.",
  },
  "RESP.REDIRECT_CHAIN": {
    title: "Redirect chain",
    explanation:
      "Reaching the final page requires two or more consecutive redirects. Each hop adds latency and burns crawl budget.",
    howToFix:
      "Point the first URL (and any internal links) directly at the final destination so there is at most one redirect.",
  },
  "RESP.REDIRECT_LOOP": {
    title: "Redirect loop",
    explanation:
      "This redirect eventually points back to itself, so the URL never resolves.",
    howToFix: "Trace the redirect rules for this URL and break the cycle.",
  },
  "CANON.HTML_HEADER_MISMATCH": {
    title: "Conflicting canonical signals",
    explanation:
      "The page declares different canonical URLs in its HTML rel=canonical and its HTTP Link header.",
    howToFix: "Pick one canonical URL and declare it in exactly one place.",
  },
  "THIN.LOW_WORDCOUNT": {
    title: "Thin content",
    explanation:
      "The page has very little visible text. Thin pages rarely rank and can drag down sitewide quality assessments.",
    howToFix:
      "Expand the page with genuinely useful content, noindex it, or consolidate it into a stronger page.",
  },
  "IMG.MISSING_ALT_ATTR": {
    title: "Images missing alt text",
    explanation:
      "One or more images on the page lack alt attributes. Alt text is an accessibility requirement and the main way search engines understand images.",
    howToFix:
      'Add descriptive alt text to meaningful images; use an empty alt (alt="") only for purely decorative ones.',
  },
  "CRAWL.ORPHAN": {
    title: "Orphan page",
    explanation:
      "No crawled page links to this URL — it was only discoverable via the sitemap.",
    howToFix: "Link to this page from relevant pages, or remove it from the sitemap.",
  },
  "LINK.NO_OUTLINKS": {
    title: "Page has no outgoing links",
    explanation:
      "The page contains no internal links — a dead end. Link equity that flows into it stops there.",
    howToFix: "Add links to related pages, the parent category, or the homepage.",
  },
  "ONP.TITLE_TOO_LONG": {
    title: "Title too long",
    explanation:
      "The title exceeds ~60 characters, so search results will truncate it.",
    howToFix: "Shorten the title to roughly 50–60 characters.",
  },
  "ONP.TITLE_TOO_SHORT": {
    title: "Title too short",
    explanation: "The title is under ~30 characters, which is usually too generic.",
    howToFix: "Expand the title into a descriptive phrase (roughly 30–60 characters).",
  },
  "ONP.META_DESC_TOO_LONG": {
    title: "Meta description too long",
    explanation: "The meta description exceeds ~155 characters and will be truncated.",
    howToFix: "Trim the description to roughly 70–155 characters.",
  },
  "ONP.META_DESC_TOO_SHORT": {
    title: "Meta description too short",
    explanation: "The meta description is under ~70 characters.",
    howToFix: "Expand the description to roughly 70–155 characters.",
  },
  "ONP.H_NON_SEQUENTIAL": {
    title: "Heading levels skip",
    explanation:
      "The heading hierarchy skips levels (e.g. an H4 directly after an H2).",
    howToFix: "Adjust heading levels so they descend one step at a time.",
  },
  "RESP.SLOW_TTFB": {
    title: "Slow server response",
    explanation:
      "The HTML response took over 600 ms. Slow TTFB drags down every downstream performance metric.",
    howToFix: "Investigate server time and caching for this route.",
  },
  "CANON.CANONICALISED": {
    title: "Canonicalized to another URL",
    explanation:
      "The page declares a different URL as its canonical, telling search engines to index that URL instead.",
    howToFix: "If this page should rank on its own, set its canonical to itself.",
  },
  "CRAWL.DEPTH_GT_5": {
    title: "Page is deep in the site structure",
    explanation:
      "The page is 5+ clicks from the homepage. Deep pages get crawled less often.",
    howToFix: "Add links from higher-level pages to flatten the path to this page.",
  },
};
