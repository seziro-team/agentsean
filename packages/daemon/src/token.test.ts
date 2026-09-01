import { afterEach, describe, expect, it } from "vitest";
import { openCredentialStore } from "@agentsean/credentials";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TokenStrengthError } from "@agentsean/launch";
import { generateToken, loadOrCreateToken } from "./token.js";

describe("daemon token", () => {
  const prev = process.env["SEAN_AUTH_TOKEN"];
  afterEach(() => {
    if (prev === undefined) delete process.env["SEAN_AUTH_TOKEN"];
    else process.env["SEAN_AUTH_TOKEN"] = prev;
  });

  it("generates a long token and rejects a short env override", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-tok-"));
    const store = openCredentialStore({ dir, backend: "encrypted-file" });
    const generated = generateToken();
    expect(generated.unwrap().length).toBeGreaterThanOrEqual(32);

    process.env["SEAN_AUTH_TOKEN"] = "short";
    await expect(loadOrCreateToken(store)).rejects.toBeInstanceOf(TokenStrengthError);

    process.env["SEAN_AUTH_TOKEN"] = "abcdefghijklmnopqrstuvwxyz012345";
    const fromEnv = await loadOrCreateToken(store);
    expect(fromEnv.unwrap()).toBe("abcdefghijklmnopqrstuvwxyz012345");
  });
});
