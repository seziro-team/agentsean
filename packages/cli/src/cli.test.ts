import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "./cli.js";

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sean-cli-"));
}

describe("cli", () => {
  it("status --json reports not running against an empty home", async () => {
    const home = tmpHome();
    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await run([
        "node",
        "sean",
        "status",
        "--json",
        "--home",
        home,
      ]);
      expect(code).toBe(1);
      const parsed = JSON.parse(chunks.join("").trim()) as {
        running: boolean;
        command: string;
      };
      expect(parsed.command).toBe("status");
      expect(parsed.running).toBe(false);
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErr;
    }
  });

  it("mcp --json lists tools and does not start stdio", async () => {
    const home = tmpHome();
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await run(["node", "sean", "mcp", "--json", "--home", home]);
      expect(code).toBe(0);
      const parsed = JSON.parse(chunks.join("").trim()) as {
        command: string;
        transport: string;
        tools: string[];
      };
      expect(parsed.command).toBe("mcp");
      expect(parsed.transport).toBe("stdio");
      expect(parsed.tools).toContain("keyword_opportunities");
      expect(parsed.tools).toContain("estimate_provider_cost");
      expect(parsed.tools).toContain("list_claims");
      expect(parsed.tools).toContain("estimate_mde");
      expect(parsed.tools).toContain("ai_citation_share");
      expect(parsed.tools).toContain("brand_mentions");
    } finally {
      process.stdout.write = orig;
    }
  });

  it("with no command onboards (does not start when --no-start)", async () => {
    const home = tmpHome();
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await run([
        "node",
        "sean",
        "--json",
        "--home",
        home,
        "--no-start",
        "--telemetry",
        "off",
      ]);
      expect(code).toBe(0);
      const parsed = JSON.parse(chunks.join("").trim()) as {
        command: string;
        telemetry: boolean;
        questions: string[];
      };
      expect(parsed.command).toBe("onboard");
      expect(parsed.telemetry).toBe(false);
      expect(parsed.questions).toContain("url");
    } finally {
      process.stdout.write = orig;
    }
  });

  it("doctor --json reports checks", async () => {
    const home = tmpHome();
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = process.stdout.write;
    try {
      const code = await run(["node", "sean", "doctor", "--json", "--home", home]);
      expect(code).toBe(0);
      const parsed = JSON.parse(chunks.join("").trim()) as {
        command: string;
        checks: Array<{ id: string }>;
      };
      expect(parsed.command).toBe("doctor");
      expect(parsed.checks.some((c) => c.id === "node")).toBe(true);
    } finally {
      process.stdout.write = orig;
      process.stderr.write = origErr;
    }
  });

  it("recipes --json lists first-party recipes", async () => {
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await run(["node", "sean", "recipes", "--json"]);
      expect(code).toBe(0);
      const parsed = JSON.parse(chunks.join("").trim()) as {
        recipes: Array<{ id: string }>;
      };
      expect(parsed.recipes.length).toBeGreaterThanOrEqual(12);
      expect(parsed.recipes.some((r) => r.id === "revert-a-change")).toBe(true);
    } finally {
      process.stdout.write = orig;
    }
  });
});
