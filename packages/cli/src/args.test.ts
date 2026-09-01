import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses start --json --foreground --port", () => {
    const a = parseArgs([
      "node",
      "sean",
      "start",
      "--json",
      "--foreground",
      "--port",
      "8888",
      "--host",
      "127.0.0.1",
    ]);
    expect(a.command).toBe("start");
    expect(a.json).toBe(true);
    expect(a.foreground).toBe(true);
    expect(a.port).toBe(8888);
    expect(a.host).toBe("127.0.0.1");
    expect(a.errors).toEqual([]);
  });

  it("accepts --json before the command", () => {
    const a = parseArgs(["node", "sean", "--json", "status"]);
    expect(a.command).toBe("status");
    expect(a.json).toBe(true);
  });

  it("parses audit url and --max-pages --no-js", () => {
    const a = parseArgs([
      "node",
      "sean",
      "audit",
      "https://example.com",
      "--json",
      "--max-pages",
      "500",
      "--no-js",
    ]);
    expect(a.command).toBe("audit");
    expect(a.target).toBe("https://example.com");
    expect(a.maxPages).toBe(500);
    expect(a.render).toBe(false);
    expect(a.json).toBe(true);
  });

  it("parses connect google --byo --credentials", () => {
    const a = parseArgs([
      "node",
      "sean",
      "connect",
      "google",
      "https://example.com",
      "--byo",
      "--credentials",
      "./client_secret.json",
      "--json",
    ]);
    expect(a.command).toBe("connect");
    expect(a.provider).toBe("google");
    expect(a.target).toBe("https://example.com");
    expect(a.byo).toBe(true);
    expect(a.credentialsPath).toBe("./client_secret.json");
    expect(a.json).toBe(true);
  });

  it("parses apply --repo --dry-run", () => {
    const a = parseArgs([
      "node",
      "sean",
      "apply",
      "https://example.com",
      "--repo",
      "./site",
      "--dry-run",
      "--json",
    ]);
    expect(a.command).toBe("apply");
    expect(a.target).toBe("https://example.com");
    expect(a.repo).toBe("./site");
    expect(a.dryRun).toBe(true);
    expect(a.json).toBe(true);
  });

  it("parses revert change id", () => {
    const a = parseArgs(["node", "sean", "revert", "abc-123", "--json"]);
    expect(a.command).toBe("revert");
    expect(a.target).toBe("abc-123");
  });

  it("parses freeze and unfreeze", () => {
    const a = parseArgs(["node", "sean", "freeze", "--json"]);
    expect(a.command).toBe("freeze");
    expect(a.off).toBe(false);
    const b = parseArgs(["node", "sean", "freeze", "--off", "--json"]);
    expect(b.off).toBe(true);
    const c = parseArgs(["node", "sean", "unfreeze"]);
    expect(c.command).toBe("unfreeze");
  });

  it("parses content --dry-run", () => {
    const a = parseArgs([
      "node",
      "sean",
      "content",
      "https://example.com",
      "--repo",
      "./site",
      "--dry-run",
      "--json",
    ]);
    expect(a.command).toBe("content");
    expect(a.target).toBe("https://example.com");
    expect(a.repo).toBe("./site");
    expect(a.dryRun).toBe(true);
  });

  it("flags unknown options", () => {
    const a = parseArgs(["node", "sean", "status", "--wat"]);
    expect(a.errors[0]).toMatch(/unknown flag/);
  });
});
