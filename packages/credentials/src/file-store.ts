import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { Secret } from "./secret.js";
import type { CredentialStore } from "./types.js";

const KEK_FILE = "kek";
const VAULT_FILE = "vault.json";
const NONCE_LEN = 24;

function chmodIfPossible(filePath: string, mode: number): void {
  if (process.platform === "win32") return;
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // best-effort
  }
}

function readKek(kekPath: string): Uint8Array {
  const buf = fs.readFileSync(kekPath);
  if (buf.length !== 32) {
    throw new Error(`Corrupt KEK at ${kekPath}: expected 32 bytes`);
  }
  return new Uint8Array(buf);
}

function loadOrCreateKek(dir: string): Uint8Array {
  const kekPath = path.join(dir, KEK_FILE);
  const kek = randomBytes(32);
  // Create the key-encryption-key with O_EXCL ("wx"): the existence check and
  // the write are a single atomic syscall, so two racing daemons cannot both
  // believe they are the creator and clobber each other's KEK — the loser gets
  // EEXIST and re-reads the winner's key (js/file-system-race on the secret
  // vault). O_EXCL also refuses to follow a pre-planted symlink at `kek`, so an
  // attacker cannot redirect the freshly generated key to a readable location.
  try {
    fs.writeFileSync(kekPath, kek, { mode: 0o600, flag: "wx" });
    chmodIfPossible(kekPath, 0o600);
    return new Uint8Array(kek);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      return readKek(kekPath);
    }
    throw e;
  }
}

type VaultFile = {
  v: 1;
  secrets: Record<string, { nonce: string; ciphertext: string }>;
};

function emptyVault(): VaultFile {
  return { v: 1, secrets: {} };
}

function encrypt(
  kek: Uint8Array,
  plaintext: string,
): { nonce: string; ciphertext: string } {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = xchacha20poly1305(kek, nonce);
  const ciphertext = cipher.encrypt(new TextEncoder().encode(plaintext));
  return {
    nonce: Buffer.from(nonce).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
  };
}

function decrypt(kek: Uint8Array, nonceB64: string, ciphertextB64: string): string {
  const nonce = new Uint8Array(Buffer.from(nonceB64, "base64"));
  const ciphertext = new Uint8Array(Buffer.from(ciphertextB64, "base64"));
  const cipher = xchacha20poly1305(kek, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function openFileStore(dir: string): CredentialStore {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodIfPossible(dir, 0o700);
  const kek = loadOrCreateKek(dir);
  const vaultPath = path.join(dir, VAULT_FILE);

  const readVault = (): VaultFile => {
    if (!fs.existsSync(vaultPath)) return emptyVault();
    const parsed = JSON.parse(fs.readFileSync(vaultPath, "utf8")) as VaultFile;
    if (parsed.v !== 1 || typeof parsed.secrets !== "object") {
      throw new Error(`Corrupt vault at ${vaultPath}`);
    }
    return parsed;
  };

  const writeVault = (vault: VaultFile): void => {
    const tmp = `${vaultPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(vault), { mode: 0o600 });
    chmodIfPossible(tmp, 0o600);
    fs.renameSync(tmp, vaultPath);
    chmodIfPossible(vaultPath, 0o600);
  };

  return {
    backend: "encrypted-file",
    async set(account, secret) {
      const vault = readVault();
      vault.secrets[account] = encrypt(kek, secret.unwrap());
      writeVault(vault);
    },
    async get(account) {
      const vault = readVault();
      const row = vault.secrets[account];
      if (!row) return null;
      return new Secret(decrypt(kek, row.nonce, row.ciphertext));
    },
    async delete(account) {
      const vault = readVault();
      if (account in vault.secrets) {
        delete vault.secrets[account];
        writeVault(vault);
      }
    },
  };
}
