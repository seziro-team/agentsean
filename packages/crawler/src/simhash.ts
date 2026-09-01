/**
 * 64-bit SimHash over character 3-grams. Near-duplicate when Hamming ≤ 3.
 * Implemented in-process so we never take a Python/datasketch dependency.
 */
export function simhash64(text: string): bigint {
  const tokens = shingles(text.toLowerCase(), 3);
  if (tokens.length === 0) return 0n;
  const acc = new Int32Array(64);
  for (const token of tokens) {
    const h = fnv1a64(token);
    for (let i = 0; i < 64; i++) {
      const bit = (h >> BigInt(i)) & 1n;
      acc[i] = (acc[i] ?? 0) + (bit === 1n ? 1 : -1);
    }
  }
  let out = 0n;
  for (let i = 0; i < 64; i++) {
    if ((acc[i] ?? 0) >= 0) out |= 1n << BigInt(i);
  }
  return out;
}

export function simhashHex(text: string): string {
  return simhash64(text).toString(16).padStart(16, "0");
}

export function hamming64(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

export function nearDuplicate(aHex: string, bHex: string, maxDistance = 3): boolean {
  return hamming64(BigInt(`0x${aHex}`), BigInt(`0x${bHex}`)) <= maxDistance;
}

function shingles(text: string, n: number): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < n) return cleaned ? [cleaned] : [];
  const out: string[] = [];
  for (let i = 0; i <= cleaned.length - n; i++) {
    out.push(cleaned.slice(i, i + n));
  }
  return out;
}

function fnv1a64(str: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash;
}
