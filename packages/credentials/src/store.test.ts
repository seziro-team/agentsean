import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Secret } from "./secret.js";
import { openCredentialStore } from "./store.js";

describe("encrypted-file credential store", () => {
  it("round-trips a secret and never writes plaintext", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-creds-"));
    const store = openCredentialStore({ dir, backend: "encrypted-file" });
    expect(store.backend).toBe("encrypted-file");

    await store.set("daemon-auth-token", new Secret("tok_abc"));
    const got = await store.get("daemon-auth-token");
    expect(got?.unwrap()).toBe("tok_abc");

    const vaultPath = path.join(dir, "secrets", "vault.json");
    const vaultRaw = fs.readFileSync(vaultPath, "utf8");
    expect(vaultRaw).not.toContain("tok_abc");

    await store.delete("daemon-auth-token");
    expect(await store.get("daemon-auth-token")).toBeNull();
  });
});
