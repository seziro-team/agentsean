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

  it("flags unknown options", () => {
    const a = parseArgs(["node", "sean", "status", "--wat"]);
    expect(a.errors[0]).toMatch(/unknown flag/);
  });
});
