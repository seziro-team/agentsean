import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Secret } from "./secret.js";
import { openFileStore } from "./file-store.js";
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

  // Regression for the KEK file-system race (js/file-system-race). The KEK is
  // created with O_EXCL ("wx"), so a second open must reuse the existing key
  // rather than clobber it — otherwise every previously-encrypted secret would
  // become undecryptable. This is the observable symptom the atomic create
  // prevents when two daemons start concurrently.
  it("reuses an existing KEK across opens instead of regenerating it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sean-kek-"));
    const first = openFileStore(dir);
    await first.set("acct", new Secret("secret-value"));

    const kekBefore = fs.readFileSync(path.join(dir, "kek"));
    const second = openFileStore(dir);
    const kekAfter = fs.readFileSync(path.join(dir, "kek"));

    // The second open did not mint a new KEK...
    expect(kekAfter.equals(kekBefore)).toBe(true);
    // ...so the secret written under the first is still decryptable.
    expect((await second.get("acct"))?.unwrap()).toBe("secret-value");
  });
});
