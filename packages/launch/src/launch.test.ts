import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertTokenStrength,
  TokenStrengthError,
  MIN_TOKEN_LENGTH,
} from "./token-strength.js";
import {
  consentTelemetry,
  dntHonored,
  isTelemetryEnabled,
  previewPayload,
  recordEvent,
  readTelemetryLog,
} from "./telemetry.js";
import { ONBOARD_QUESTIONS, parseCms, parseSiteUrl, SERVICE_HINT } from "./onboard.js";
import { runDoctor } from "./doctor.js";
import { planService } from "./service.js";
import { RECIPES, recipeById } from "./recipes.js";
import {
  hasPostinstallScripts,
  provisionHome,
  isOnboarded,
  markOnboarded,
} from "./provision.js";
import { checkUpdate } from "./update.js";
import { INSTALL_FLAGS, planInstall } from "./install.js";
import { OPENSEO_CREDIT, POSITIONING, recipePage, recipesIndex } from "./site.js";
import { nodeMeetsMin, VERSION } from "./version.js";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sean-launch-"));
}

describe("token strength", () => {
  it("rejects short and low-entropy tokens", () => {
    expect(() => assertTokenStrength("a")).toThrow(TokenStrengthError);
    expect(() => assertTokenStrength("a".repeat(MIN_TOKEN_LENGTH))).toThrow(
      TokenStrengthError,
    );
    expect(() => assertTokenStrength("abcdefghijklmnopqrstuvwxyz012345")).not.toThrow();
  });
});

describe("telemetry", () => {
  it("does not send until consent, honors DNT, and never includes URLs", () => {
    const home = tmp();
    expect(isTelemetryEnabled(home)).toBe(false);
    expect(dntHonored({ DO_NOT_TRACK: "1" })).toBe(true);
    expect(dntHonored({ SEAN_TELEMETRY: "0" })).toBe(true);
    const preview = previewPayload({ event: "first_run", installMethod: "npx" });
    expect(preview.version).toBe(VERSION);
    expect(JSON.stringify(preview)).not.toMatch(/https?:\/\//);
    expect(preview).not.toHaveProperty("url");
    expect(preview).not.toHaveProperty("origin");
    expect(recordEvent(home, { event: "command_used", command: "start" })).toBeNull();
    consentTelemetry(home, true, "npx");
    expect(isTelemetryEnabled(home)).toBe(true);
    const sent = recordEvent(home, { event: "command_used", command: "doctor" });
    expect(sent?.command).toBe("doctor");
    expect(JSON.stringify(sent)).not.toMatch(/https?:\/\//);
    expect(readTelemetryLog(home)).toHaveLength(1);
    expect(isTelemetryEnabled(home, { DO_NOT_TRACK: "1" })).toBe(false);
  });
});

describe("onboard", () => {
  it("asks a handful of questions and does not treat service install as onboarding", () => {
    expect(ONBOARD_QUESTIONS.length).toBeGreaterThanOrEqual(4);
    expect(ONBOARD_QUESTIONS.length).toBeLessThanOrEqual(6);
    expect(ONBOARD_QUESTIONS.map((q) => q.id)).toEqual([
      "url",
      "cms",
      "google",
      "telemetry",
    ]);
    expect(parseCms("WordPress")).toBe("wordpress");
    expect(parseSiteUrl("https://example.com/blog")).toBe("https://example.com");
    expect(parseSiteUrl("not-a-url")).toBeUndefined();
    expect(SERVICE_HINT).toMatch(/sean service install/);
    expect(SERVICE_HINT).toMatch(/never a side effect/);
  });
});

describe("doctor", () => {
  it("fails old Node and weak tokens, warns when Playwright is missing", async () => {
    const home = tmp();
    const bad = await runDoctor({
      home,
      nodeVersion: "20.20.0",
      tokenPresent: true,
      tokenLength: 8,
      playwright: false,
    });
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.id === "node")?.ok).toBe(false);
    expect(bad.checks.find((c) => c.id === "token")?.ok).toBe(false);
    expect(bad.checks.find((c) => c.id === "playwright")?.severity).toBe("warn");

    const good = await runDoctor({
      home,
      nodeVersion: "22.19.0",
      tokenPresent: true,
      tokenLength: 43,
      playwright: true,
      pidAlive: false,
    });
    expect(good.ok).toBe(true);
    expect(nodeMeetsMin("22.19.0")).toBe(true);
  });
});

describe("service", () => {
  it("plans loopback-only units and refuses 0.0.0.0", () => {
    const linux = planService({
      home: "/home/u/.sean",
      nodePath: "/usr/bin/node",
      daemonEntry: "/opt/sean/daemon.js",
      platform: "linux",
    });
    expect(linux.kind).toBe("systemd-user");
    expect(linux.contents).toMatch(/127\.0\.0\.1/);
    expect(linux.contents).not.toMatch(/0\.0\.0\.0/);
    expect(linux.summary).toMatch(/write /);

    const mac = planService({
      home: "/Users/u/.sean",
      nodePath: "/usr/local/bin/node",
      daemonEntry: "/opt/sean/daemon.js",
      platform: "darwin",
    });
    expect(mac.kind).toBe("launchd");
    expect(mac.path).toMatch(/LaunchAgents/);

    expect(() =>
      planService({
        home: "/tmp",
        nodePath: "/usr/bin/node",
        daemonEntry: "/opt/x.js",
        host: "0.0.0.0",
        platform: "linux",
      }),
    ).toThrow(/loopback-only/);
  });
});

describe("recipes and docs copy", () => {
  it("ships first-party recipes and the OpenSEO credit", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(12);
    expect(recipeById("city-service-pages-refused")?.title).toMatch(/refused/i);
    expect(recipeById("fix-orphaned-pages-shopify")?.summary).toMatch(
      /Theme writes are refused/,
    );
    expect(POSITIONING).toBe(
      "Every SEO tool tells you what's wrong. Agent Sean fixes it.",
    );
    expect(OPENSEO_CREDIT).toMatch(/not a fork of OpenSEO/);
    const html = recipesIndex();
    for (const r of RECIPES) {
      expect(html).toContain(`id="${r.id}"`);
      expect(recipePage(r)).toContain(r.title);
    }
  });
});

describe("provision and install", () => {
  it("provisions on first run and forbids lifecycle scripts", () => {
    const home = tmp();
    provisionHome(home, "curl");
    expect(fs.existsSync(path.join(home, "install-method"))).toBe(true);
    expect(isOnboarded(home)).toBe(false);
    markOnboarded(home);
    expect(isOnboarded(home)).toBe(true);
    expect(hasPostinstallScripts({ start: "node dist/bin.js" })).toBe(false);
    expect(hasPostinstallScripts({ postinstall: "node scripts/fetch-chrome.js" })).toBe(
      true,
    );
    expect(INSTALL_FLAGS).toContain("--no-onboard");
    const plan = planInstall({
      prefix: "/tmp/sean",
      fromSource: "/src",
      onboard: false,
      nodePresent: false,
      dryRun: true,
    });
    expect(plan.steps.some((s) => s.includes("download Node"))).toBe(true);
    expect(plan.steps.some((s) => s.includes("no npm lifecycle"))).toBe(true);
    expect(plan.steps.some((s) => s.includes("skip onboard"))).toBe(true);
  });
});

describe("checked-in installers and docs site", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

  it("install.sh matches the flag surface and never uses postinstall", () => {
    const sh = fs.readFileSync(path.join(root, "install/install.sh"), "utf8");
    for (const flag of [
      "--no-onboard",
      "--version=",
      "--prefix=",
      "--channel=",
      "--from-source=",
      "--dry-run",
    ]) {
      expect(sh).toContain(flag);
    }
    expect(sh).toMatch(/npm v12/);
    expect(sh).not.toMatch(/npm install[^\n]*--ignore-scripts/);
    expect(sh).toMatch(/no postinstall/i);
    const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
    expect(compose).toContain("127.0.0.1:7777:7777");
    expect(compose).toContain("SEAN_AUTH_TOKEN");
    const entry = fs.readFileSync(path.join(root, "docker-entrypoint.sh"), "utf8");
    expect(entry).toMatch(/32/);
    const recipes = fs.readFileSync(path.join(root, "web/recipes/index.html"), "utf8");
    for (const r of RECIPES) {
      expect(recipes).toContain(`id="${r.id}"`);
    }
    const landing = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
    expect(landing).toContain(POSITIONING);
    expect(landing).toContain("not a fork of OpenSEO");
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    expect(readme).toContain(POSITIONING);
    expect(readme).toMatch(/not a fork of OpenSEO/i);
    expect(readme).toContain("npx agentsean");
    expect(fs.existsSync(path.join(root, "docs/assets/demo.svg"))).toBe(true);
  });
});

describe("update", () => {
  it("treats an unpublished package as current, not behind", async () => {
    const unpublished = await checkUpdate({
      fetch: (async () => new Response("Not Found", { status: 404 })) as typeof fetch,
    });
    expect(unpublished.published).toBe(false);
    expect(unpublished.behind).toBe(false);
    expect(unpublished.current).toBe(VERSION);

    const tagged = await checkUpdate({
      current: "2026.8.0",
      fetch: (async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "2026.9.0" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    });
    expect(tagged.published).toBe(true);
    expect(tagged.behind).toBe(true);
    expect(tagged.latest).toBe("2026.9.0");
  });
});
