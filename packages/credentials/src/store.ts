import path from "node:path";
import { openFileStore } from "./file-store.js";
import { openKeyringStore, probeKeyring } from "./keyring.js";
import type { CredentialStore, OpenStoreOptions, SecretBackend } from "./types.js";

export function resolveBackend(options: OpenStoreOptions): SecretBackend {
  if (options.backend) return options.backend;
  const env = process.env["SEAN_SECRETS_BACKEND"]?.trim().toLowerCase();
  if (env === "keyring" || env === "encrypted-file") return env;
  return probeKeyring() ? "keyring" : "encrypted-file";
}

export function openCredentialStore(options: OpenStoreOptions): CredentialStore {
  const backend = resolveBackend(options);
  if (backend === "keyring") {
    try {
      return openKeyringStore();
    } catch (err) {
      // Headless Linux, CI, and containers usually have no Secret Service.
      if (options.backend === "keyring") throw err;
    }
  }
  const dir = path.join(options.dir, "secrets");
  return openFileStore(dir);
}
