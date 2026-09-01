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

  it("parses signup and tenant", () => {
    const a = parseArgs(["node", "sean", "signup", "agency", "--json"]);
    expect(a.command).toBe("signup");
    expect(a.target).toBe("agency");
    const b = parseArgs(["node", "sean", "tenant", "abc"]);
    expect(b.command).toBe("tenant");
    expect(b.target).toBe("abc");
  });

  it("parses visibility, local, and mentions", () => {
    const a = parseArgs(["node", "sean", "visibility", "https://example.com", "--json"]);
    expect(a.command).toBe("visibility");
    expect(a.target).toBe("https://example.com");
    const b = parseArgs(["node", "sean", "local", "--json"]);
    expect(b.command).toBe("local");
    const c = parseArgs(["node", "sean", "mentions", "https://example.com"]);
    expect(c.command).toBe("mentions");
    expect(c.target).toBe("https://example.com");
  });

  it("parses keywords, mcp, and measure", () => {
    const a = parseArgs(["node", "sean", "keywords", "https://example.com", "--json"]);
    expect(a.command).toBe("keywords");
    expect(a.target).toBe("https://example.com");
    const b = parseArgs(["node", "sean", "mcp", "--json"]);
    expect(b.command).toBe("mcp");
    expect(b.json).toBe(true);
    const c = parseArgs(["node", "sean", "measure", "https://example.com", "--json"]);
    expect(c.command).toBe("measure");
    expect(c.target).toBe("https://example.com");
    const d = parseArgs([
      "node",
      "sean",
      "connect",
      "wordpress",
      "--api-key",
      "user:pass",
      "https://blog.example",
    ]);
    expect(d.command).toBe("connect");
    expect(d.provider).toBe("wordpress");
    expect(d.apiKey).toBe("user:pass");
    expect(d.target).toBe("https://blog.example");
  });

  it("parses onboard, doctor, service, telemetry, recipes, update", () => {
    const a = parseArgs([
      "node",
      "sean",
      "onboard",
      "https://example.com",
      "--cms",
      "wordpress",
      "--telemetry",
      "off",
      "--no-start",
      "--json",
    ]);
    expect(a.command).toBe("onboard");
    expect(a.target).toBe("https://example.com");
    expect(a.cms).toBe("wordpress");
    expect(a.telemetry).toBe("off");
    expect(a.noStart).toBe(true);
    const b = parseArgs(["node", "sean", "service", "install", "--yes"]);
    expect(b.command).toBe("service");
    expect(b.target).toBe("install");
    expect(b.yes).toBe(true);
    const c = parseArgs(["node", "sean", "update", "--channel", "extended-stable"]);
    expect(c.command).toBe("update");
    expect(c.channel).toBe("extended-stable");
    const d = parseArgs(["node", "sean", "recipes", "revert-a-change"]);
    expect(d.command).toBe("recipes");
    expect(d.target).toBe("revert-a-change");
    const e = parseArgs(["node", "sean", "uninstall", "--purge"]);
    expect(e.purge).toBe(true);
  });

  it("flags unknown options", () => {
    const a = parseArgs(["node", "sean", "status", "--wat"]);
    expect(a.errors[0]).toMatch(/unknown flag/);
  });
});
