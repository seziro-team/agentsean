import { describe, expect, it } from "vitest";
import { getDatabaseProvider } from "./provider.js";

describe("getDatabaseProvider", () => {
  it("defaults to sqlite", () => {
    expect(getDatabaseProvider(undefined)).toBe("sqlite");
  });
});
