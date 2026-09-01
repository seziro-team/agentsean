import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeBody } from "./decode.js";

describe("decodeBody", () => {
  it("gunzips and passes identity through", async () => {
    const raw = Buffer.from("hello sean");
    expect((await decodeBody(raw, undefined)).toString()).toBe("hello sean");
    const gz = gzipSync(raw);
    expect((await decodeBody(gz, "gzip")).toString()).toBe("hello sean");
  });
});
