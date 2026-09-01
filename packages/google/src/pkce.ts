import { createHash, randomBytes } from "node:crypto";

export type PkcePair = {
  verifier: string;
  challenge: string;
  method: "S256";
};

export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
}

export function randomState(): string {
  return randomBytes(16).toString("base64url");
}

export function randomWrapKey(): Buffer {
  return randomBytes(32);
}
