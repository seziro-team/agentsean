import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  KIND_TIER,
  htmlTitle,
  patchHtmlTitle,
  type Action,
  type AppliedChange,
} from "@agentsean/actions";
import { createGitAdapter } from "@agentsean/adapter-git";
import { createWordpressAdapter } from "@agentsean/adapter-wp";
import { createShopifyAdapter, refuseThemeFileWrite } from "@agentsean/adapter-shopify";
import { createCloudflareAdapter } from "@agentsean/adapter-cloudflare";
import { createSiteAdapter } from "./factory.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

const TITLE = "About our running shoes today";

function titleAction(url: string): Action {
  return {
    id: randomUUID(),
    siteId: randomUUID(),
    kind: "rewrite_title",
    tier: KIND_TIER.rewrite_title,
    target: { pageId: randomUUID(), url },
    payload: { title: TITLE },
    rationale: ["Short title."],
    findingIds: [randomUUID()],
    estimatedImpact: { metric: "clicks", estimate: 0, confidence: 0.2 },
  };
}

function asChange(
  action: Action,
  applied: {
    targetRef: string;
    before: string;
    after: string;
    summary: string;
    commitSha?: string;
    branch?: string;
    prUrl?: string;
  },
): AppliedChange {
  const change: AppliedChange = {
    id: randomUUID(),
    actionId: action.id,
    siteId: action.siteId,
    targetRef: applied.targetRef,
    before: applied.before,
    after: applied.after,
    summary: applied.summary,
  };
  if (applied.commitSha) change.commitSha = applied.commitSha;
  if (applied.branch) change.branch = applied.branch;
  if (applied.prUrl) change.prUrl = applied.prUrl;
  return change;
}

describe("Phase 8 four-platform title-tag exit", () => {
  it("WordPress: apply, verify by re-fetching live HTML, rollback", async () => {
    const live = {
      html: "<html><head><title>Old</title></head><body>WP</body></html>",
    };
    const stored = { title: "Old" };
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        url.includes("/wp-json/sean/v1/seo") &&
        (!init?.method || init.method === "GET")
      ) {
        return new Response(JSON.stringify({ title: stored.title, html: live.html }), {
          status: 200,
        });
      }
      if (url.includes("/wp-json/sean/v1/seo") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { title: string };
        stored.title = body.title;
        live.html = patchHtmlTitle(live.html, body.title);
        return new Response(JSON.stringify({ ok: true, after: body.title }), {
          status: 200,
        });
      }
      if (url.includes("/wp-json/sean/v1/rollback/")) {
        stored.title = "Old";
        live.html = patchHtmlTitle(live.html, "Old");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.startsWith("https://blog.example/")) {
        return new Response(live.html, { status: 200 });
      }
      return new Response("nope", { status: 404 });
    }) as typeof fetch;

    const adapter = createWordpressAdapter({
      origin: "https://blog.example",
      username: "sean",
      appPassword: "xxxx xxxx xxxx xxxx xxxx xxxx",
      fetch: fetchFn,
    });
    const action = titleAction("https://blog.example/");
    const applied = await adapter.apply(action);
    expect(htmlTitle(applied.after)).toBe(TITLE);
    const change = asChange(action, applied);
    expect((await adapter.verify(change)).ok).toBe(true);
    await adapter.rollback(change);
    expect((await adapter.verify({ ...change, after: change.before })).ok).toBe(true);
  });

  it("Shopify: apply SEO field (not theme files), verify live HTML, rollback", async () => {
    const live = { html: "<html><head><title>Old</title></head></html>" };
    const seo = { title: "Old" };
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/graphql.json")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          query: string;
          variables?: { input?: { seo?: { title?: string } } };
        };
        expect(body.query).not.toMatch(/themeFiles/i);
        if (body.variables?.input?.seo?.title)
          seo.title = body.variables.input.seo.title;
        live.html = patchHtmlTitle(live.html, seo.title);
        return new Response(
          JSON.stringify({ data: { productUpdate: { product: { seo } } } }),
          { status: 200 },
        );
      }
      return new Response(live.html, { status: 200 });
    }) as typeof fetch;

    const adapter = createShopifyAdapter({
      shop: "acme.myshopify.com",
      accessToken: "shpat_test",
      storefrontOrigin: "https://shop.example",
      fetch: fetchFn,
    });
    const action = titleAction("https://shop.example/products/shoes");
    const applied = await adapter.apply(action);
    expect(htmlTitle(applied.after)).toBe(TITLE);
    const change = asChange(action, applied);
    expect((await adapter.verify(change)).ok).toBe(true);
    await adapter.rollback(change);
    expect(seo.title).toBe("Old");
    expect(() => refuseThemeFileWrite()).toThrow(/write_themes/);
  });

  it("Next.js git repo: commit, verify source, revert", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-next-"));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, "app"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", dependencies: { next: "15.0.0" } }),
    );
    fs.writeFileSync(
      path.join(dir, "app/page.tsx"),
      `export const metadata = { title: "Hi" };\nexport default function Page() { return <h1>Hello</h1>; }\n`,
    );
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync(
      "git",
      ["-c", "user.email=t@t.test", "-c", "user.name=t", "commit", "-m", "init"],
      {
        cwd: dir,
      },
    );
    const adapter = createGitAdapter({ repoPath: dir, skipPush: true });
    const action = titleAction("https://example.com/");
    const applied = await adapter.apply(action);
    expect(applied.after).toContain(TITLE);
    const change = asChange(action, applied);
    expect((await adapter.verify(change)).ok).toBe(true);
    const rolled = await adapter.rollback(change);
    expect(rolled.after).toContain('title: "Hi"');
  });

  it("Squarespace behind Cloudflare edge: overlay, verify live HTML, rollback, never cloak", async () => {
    const originHtml =
      "<html><head><title>Old Squarespace</title></head><body>SQ</body></html>";
    const fetchFn = (async () =>
      new Response(originHtml, { status: 200 })) as typeof fetch;
    const adapter = createCloudflareAdapter({
      origin: "https://site.squarespace.com",
      fetch: fetchFn,
    });
    const action = titleAction("https://site.squarespace.com/");
    const applied = await adapter.apply(action);
    expect(htmlTitle(applied.after)).toBe(TITLE);
    const change = asChange(action, applied);
    const verified = await adapter.verify(change);
    expect(verified.ok).toBe(true);
    await adapter.rollback(change);
    expect((await adapter.verify({ ...change, after: change.before })).ok).toBe(true);
  });

  it("factory constructs the four exit platforms", () => {
    expect(
      createSiteAdapter("wordpress", {
        origin: "https://x.com",
        username: "u",
        appPassword: "p",
      }).kind,
    ).toBe("wordpress");
    expect(
      createSiteAdapter("shopify", { shop: "acme", accessToken: "shpat" }).kind,
    ).toBe("shopify");
    expect(createSiteAdapter("cloudflare", { origin: "https://x.com" }).kind).toBe(
      "cloudflare",
    );
  });
});
