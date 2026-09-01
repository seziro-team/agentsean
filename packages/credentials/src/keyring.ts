import { Entry } from "@napi-rs/keyring";
import { Secret } from "./secret.js";
import { KEYRING_SERVICE, type CredentialStore } from "./types.js";

export function probeKeyring(): boolean {
  try {
    const probe = new Entry(KEYRING_SERVICE, "__sean_probe__");
    probe.setPassword("probe");
    probe.deletePassword();
    return true;
  } catch {
    return false;
  }
}

export function openKeyringStore(): CredentialStore {
  return {
    backend: "keyring",
    async set(account, secret) {
      const entry = new Entry(KEYRING_SERVICE, account);
      entry.setPassword(secret.unwrap());
    },
    async get(account) {
      const entry = new Entry(KEYRING_SERVICE, account);
      try {
        const value = entry.getPassword();
        return value ? new Secret(value) : null;
      } catch {
        return null;
      }
    },
    async delete(account) {
      const entry = new Entry(KEYRING_SERVICE, account);
      try {
        entry.deletePassword();
      } catch {
        // already gone
      }
    },
  };
}
