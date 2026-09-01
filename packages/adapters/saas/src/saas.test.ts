import { describe, expect, it } from "vitest";
import { createGhostAdapter, createWebflowAdapter, createWixAdapter } from "./index.js";

describe("saas adapters", () => {
  it("constructs webflow, ghost, and wix adapters", () => {
    expect(
      createWebflowAdapter({ origin: "https://api.webflow.com", token: "t" }).kind,
    ).toBe("webflow");
    expect(
      createGhostAdapter({
        origin: "https://blog.example",
        adminKey: "id:" + "ab".repeat(32),
      }).kind,
    ).toBe("ghost");
    expect(
      createWixAdapter({ origin: "https://www.wixapis.com", token: "t" }).kind,
    ).toBe("wix");
  });
});
