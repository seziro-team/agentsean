import { randomBytes } from "node:crypto";
import {
  openCredentialStore,
  Secret,
  type CredentialStore,
} from "@agentsean/credentials";
import { assertTokenStrength, envAuthToken } from "@agentsean/launch";
import { TOKEN_ACCOUNT } from "./paths.js";

export function generateToken(): Secret {
  return new Secret(randomBytes(32).toString("base64url"));
}

export async function loadOrCreateToken(
  store: CredentialStore,
): Promise<Secret> {
  const env = envAuthToken();
  if (env) {
    assertTokenStrength(env);
    const token = new Secret(env);
    await store.set(TOKEN_ACCOUNT, token);
    return token;
  }
  const existing = await store.get(TOKEN_ACCOUNT);
  if (existing) return existing;
  const token = generateToken();
  await store.set(TOKEN_ACCOUNT, token);
  return token;
}

export function openDaemonStore(seanHome: string): CredentialStore {
  return openCredentialStore({ dir: seanHome });
}

export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
