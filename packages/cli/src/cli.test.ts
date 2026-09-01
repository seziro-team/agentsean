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

  it("rejects a missing command with --json", async () => {
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await run(["node", "sean", "--json"]);
      expect(code).toBe(2);
      expect(JSON.parse(chunks.join("").trim()).error).toBe("missing_command");
    } finally {
      process.stdout.write = orig;
    }
  });
});
