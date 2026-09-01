import type { Secret } from "./secret.js";

export type SecretBackend = "keyring" | "encrypted-file";

export const KEYRING_SERVICE = "agentsean";

export interface CredentialStore {
  readonly backend: SecretBackend;
  set(account: string, secret: Secret): Promise<void>;
  get(account: string): Promise<Secret | null>;
  delete(account: string): Promise<void>;
}

export type OpenStoreOptions = {
  dir: string;
  /** Force a backend. Default: try keyring, fall back to encrypted-file. */
  backend?: SecretBackend | undefined;
};
