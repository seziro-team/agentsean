export type RedirectHop = {
  url: string;
  status: number;
  location: string | null;
};

export type ExtractedLink = {
  href: string;
  absUrl: string;
  anchorText: string;
  rel: string[];
  target: string | null;
  isNofollow: boolean;
  isUgc: boolean;
  isSponsored: boolean;
  isInternal: boolean;
  position: "nav" | "header" | "footer" | "aside" | "main" | "unknown";
};

export type ExtractedImage = {
  src: string;
  absUrl: string;
  alt: string | null;
  hasAltAttr: boolean;
  width: string | null;
  height: string | null;
  loading: string | null;
  srcset: string | null;
  decoding: string | null;
};

export type HreflangAlt = {
  lang: string;
  href: string;
  absUrl: string;
  inHead: boolean;
  source: "head" | "header" | "body";
};

export type JsonLdBlock = {
  raw: string;
  parsed: unknown;
  error: string | null;
  inHead: boolean;
};

export type PageExtract = {
  title: string | null;
  titles: string[];
  titleInHead: boolean;
  metaDescription: string | null;
  metaDescriptions: string[];
  metaDescInHead: boolean;
  h1: string[];
  h2: string[];
  headings: { level: number; text: string }[];
  canonicalHtml: string[];
  canonicalHeader: string[];
  canonicalInHead: boolean;
  canonicalOutsideHead: boolean;
  headBrokenEarly: boolean;
  robotsMeta: string[];
  robotsMetaInHead: boolean;
  xRobotsTag: string | null;
  viewport: string | null;
  lang: string | null;
  charset: string | null;
  charsetInFirst1024: boolean;
  hreflang: HreflangAlt[];
  jsonLd: JsonLdBlock[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  links: ExtractedLink[];
  images: ExtractedImage[];
  scripts: {
    src: string | null;
    absUrl: string | null;
    async: boolean;
    defer: boolean;
  }[];
  stylesheets: { href: string | null; absUrl: string | null }[];
  wordCount: number;
  mainWordCount: number;
  mainText: string;
  allText: string;
  boilerplateRatio: number;
  metaRefresh: string | null;
  hasNoscriptJsWarning: boolean;
  spaRootEmpty: boolean;
  hashFragmentMeta: boolean;
  forms: { action: string; absAction: string }[];
  mixedActive: string[];
  mixedPassive: string[];
  unsafeTargetBlanks: number;
  plugins: boolean;
  loremIpsum: boolean;
  paginationRel: { next: string | null; prev: string | null };
  htmlLang: string | null;
};

export type CrawledPage = {
  url: string;
  finalUrl: string;
  statusCode: number | null;
  error: string | null;
  contentType: string;
  headers: Record<string, string>;
  ttfbMs: number;
  totalMs: number;
  wireBytes: number;
  decodedBytes: number;
  httpVersion: string | null;
  redirectChain: RedirectHop[];
  redirectLoop: boolean;
  exceedsGoogleRedirectLimit: boolean;
  html: string | null;
  renderedHtml: string | null;
  extract: PageExtract | null;
  renderedExtract: PageExtract | null;
  contentHash: string | null;
  simhash: string | null;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
  supports304: boolean | null;
  inSitemap: boolean;
  robotsAllowed: boolean;
  depth: number;
  inlinkCount: number;
  outlinkCount: number;
  followInlinkCount: number;
  isInternal: boolean;
  fetchedAt: string;
  renderPolicy: "always" | "never" | "sample" | "skipped";
  rendered: boolean;
  jsDependencyScore: number;
  templateKey: string;
};

export type RobotsOutcome = {
  statusCode: number | null;
  raw: string;
  contentType: string;
  bytes: number;
  redirectHops: number;
  error: string | null;
  groups: RobotsGroup[];
  sitemaps: string[];
  unknownDirectives: string[];
  hasNoindexDirective: boolean;
  hasCrawlDelay: boolean;
  crawlDelay: number | null;
  disallowAll: boolean;
  hash: string;
  mode: "allow-all" | "disallow-all" | "parsed";
};

export type RobotsGroup = {
  agents: string[];
  rules: { type: "allow" | "disallow"; pattern: string }[];
  crawlDelay: number | null;
};

export type SitemapUrl = {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
  images: string[];
  videoValid: boolean | null;
  hreflang: { lang: string; href: string }[];
};

export type ParsedSitemap = {
  url: string;
  statusCode: number | null;
  error: string | null;
  contentType: string;
  bytes: number;
  gzipBroken: boolean;
  malformed: boolean;
  namespace: string | null;
  isIndex: boolean;
  nestedIndex: boolean;
  urls: SitemapUrl[];
  childSitemaps: string[];
  relativeLocs: string[];
};

export type OriginProbe = {
  https: boolean;
  httpRedirectsToHttps: boolean | null;
  wwwSplit: boolean | null;
  wwwPreferred: string | null;
  trailingSlashSplit: boolean | null;
  randomSoft404: boolean;
  randomSoft404Url: string | null;
  randomSoft404Hash: string | null;
  certValidTo: string | null;
  certDaysRemaining: number | null;
  certError: string | null;
  alpn: string | null;
  hsts: string | null;
};

export type CrawlCheckpoint = {
  seen: string[];
  queue: { url: string; depth: number }[];
  pagesSeen: number;
};

export type CrawlResult = {
  origin: string;
  startUrl: string;
  startedAt: string;
  finishedAt: string;
  pages: CrawledPage[];
  robots: RobotsOutcome | null;
  sitemaps: ParsedSitemap[];
  originProbe: OriginProbe;
  pagesSeen: number;
  pagesChanged: number;
  maxPages: number;
  truncated: boolean;
  aborted: boolean;
  checkpoint: CrawlCheckpoint;
};

export type CrawlOptions = {
  startUrl: string;
  maxPages?: number | undefined;
  concurrency?: number | undefined;
  rps?: number | undefined;
  timeoutMs?: number | undefined;
  render?: boolean | undefined;
  userAgent?: string | undefined;
  followExternal?: boolean | undefined;
  check304?: boolean | undefined;
  signal?: AbortSignal | undefined;
  resume?: CrawlCheckpoint | undefined;
  onCheckpoint?: ((checkpoint: CrawlCheckpoint) => void) | undefined;
  checkpointEvery?: number | undefined;
};
