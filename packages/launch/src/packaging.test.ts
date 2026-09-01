/**
 * Packaging guards.
 *
 * These exist because three separate publish bugs shipped to npm before a
 * clean-room `npx agentsean` install caught them:
 *
 *  1. a published package depended on `@agentsean/ee`, which is private and
 *     therefore 404s for every user;
 *  2. `npm publish` (rather than `pnpm publish`) left `workspace:*` in the
 *     published manifests, which npm cannot resolve;
 *  3. a package name existed in a half-created state on the registry.
 *
 * (1) and (2) are mechanically detectable from the repo, so they are asserted
 * here rather than discovered by a user.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Manifest = {
  name?: string;
  version?: string;
  private?: boolean;
  files?: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  publishConfig?: { access?: string };
};

function manifests(): { dir: string; pkg: Manifest }[] {
  const out: { dir: string; pkg: Manifest }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      const manifest = path.join(full, "package.json");
      if (fs.existsSync(manifest)) {
        out.push({
          dir: full,
          pkg: JSON.parse(fs.readFileSync(manifest, "utf8")) as Manifest,
        });
      }
      walk(full);
    }
  };
  walk(path.join(root, "packages"));
  return out;
}

const all = manifests();
const published = all.filter((m) => !m.pkg.private);
const privateNames = new Set(all.filter((m) => m.pkg.private).map((m) => m.pkg.name));

describe("packaging", () => {
  it("finds the workspace packages", () => {
    expect(all.length).toBeGreaterThan(20);
    expect(published.length).toBeGreaterThan(20);
  });

  it("no published package depends on a private package", () => {
    // A private package is never on the registry, so any published package
    // that requires one is uninstallable for every user.
    const offences: string[] = [];
    for (const { pkg } of published) {
      const runtime = {
        ...pkg.dependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      };
      for (const dep of Object.keys(runtime)) {
        if (privateNames.has(dep)) offences.push(`${pkg.name} -> ${dep}`);
      }
    }
    expect(
      offences,
      `private packages leaked into runtime deps: ${offences.join(", ")}`,
    ).toEqual([]);
  });

  it("every publishable package declares public access", () => {
    const missing = published
      .filter(
        (m) => m.pkg.name?.startsWith("@") && m.pkg.publishConfig?.access !== "public",
      )
      .map((m) => m.pkg.name);
    expect(
      missing,
      `scoped packages default to restricted access: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every publishable package ships a files allowlist", () => {
    const missing = published
      .filter((m) => !m.pkg.files?.length)
      .map((m) => m.pkg.name);
    expect(missing).toEqual([]);
  });

  it("the ee package stays private and is never a runtime import", () => {
    const ee = all.find((m) => m.pkg.name === "@agentsean/ee");
    expect(ee, "packages/ee must exist").toBeDefined();
    expect(ee?.pkg.private, "@agentsean/ee is commercially licensed, not AGPL").toBe(
      true,
    );

    // Static `import ... from "@agentsean/ee"` puts it in the module graph.
    // It must only ever be reached through a caught dynamic import.
    const offenders: string[] = [];
    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
        if (full.includes(`${path.sep}ee${path.sep}`)) continue;
        const src = fs.readFileSync(full, "utf8");
        if (/^\s*import\s[^;]*from\s+["']@agentsean\/ee["']/m.test(src)) {
          offenders.push(path.relative(root, full));
        }
      }
    };
    scan(path.join(root, "packages"));
    expect(
      offenders,
      `static imports of @agentsean/ee (use loadEe() instead): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("no manifest is left on the placeholder version", () => {
    const zero = published
      .filter((m) => m.pkg.version === "0.0.0")
      .map((m) => m.pkg.name);
    expect(zero).toEqual([]);
  });
});
