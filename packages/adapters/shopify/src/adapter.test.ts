import { describe, expect, it } from "vitest";
import { refuseThemeFileWrite, resourceFromUrl } from "./adapter.js";

describe("shopify routing", () => {
  it("maps product/collection/page URLs", () => {
    expect(resourceFromUrl("https://shop.example/products/shoes")).toEqual({
      type: "product",
      handle: "shoes",
    });
    expect(resourceFromUrl("https://shop.example/collections/run")).toEqual({
      type: "collection",
      handle: "run",
    });
    expect(resourceFromUrl("https://shop.example/pages/about")).toEqual({
      type: "page",
      handle: "about",
    });
  });

  it("refuses theme file writes", () => {
    expect(() => refuseThemeFileWrite()).toThrow(/write_themes/);
  });
});
