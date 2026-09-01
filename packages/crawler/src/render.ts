import type { PageExtract } from "./types.js";
import { extractPage } from "./extract.js";

export type RenderResult = {
  html: string;
  extract: PageExtract;
  finalUrl: string;
  errors: string[];
  timedOut: boolean;
};

/**
 * Adaptive Playwright renderer. Playwright is optional — if Chromium is not
 * installed we skip JS rendering rather than failing the audit.
 */
export async function renderPage(
  url: string,
  rawHtml: string,
): Promise<RenderResult | null> {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    return null;
  }
  const browserType = playwright.chromium;
  let browser: Awaited<ReturnType<typeof browserType.launch>> | undefined;
  try {
    browser = await browserType.launch({
      headless: true,
      args: [
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--mute-audio",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 2.625,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "media" || type === "font") {
        return route.abort();
      }
      return route.continue();
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let timedOut = false;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch {
      timedOut = true;
    }
    const html = await page.content();
    const finalUrl = page.url();
    await context.close();
    return {
      html,
      extract: extractPage(html, finalUrl),
      finalUrl,
      errors,
      timedOut,
    };
  } catch {
    return {
      html: rawHtml,
      extract: extractPage(rawHtml, url),
      finalUrl: url,
      errors: ["playwright_unavailable"],
      timedOut: false,
    };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export function jsDependencyScore(html: string, extract: PageExtract): number {
  let score = 0;
  if (extract.spaRootEmpty) score += 0.5;
  if (extract.hasNoscriptJsWarning) score += 0.3;
  if (extract.mainWordCount < 50) score += 0.2;
  if (extract.scripts.filter((s) => s.src).length >= 8) score += 0.1;
  if (/#\/|#!/.test(html)) score += 0.2;
  return Math.min(1, score);
}
