import type { OAuthMode } from "./tokens.js";

export type PendingOauth = {
  state: string;
  verifier: string | null;
  wrapKeyB64: string;
  mode: OAuthMode;
  createdAt: number;
  siteId: string | null;
  redirectUri: string;
  clientId: string | null;
};

const TTL_MS = 10 * 60_000;

export function createPendingStore(): {
  set: (p: PendingOauth) => void;
  take: (state: string) => PendingOauth | null;
  get: (state: string) => PendingOauth | null;
} {
  const map = new Map<string, PendingOauth>();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of map) {
      if (now - v.createdAt > TTL_MS) map.delete(k);
    }
  };
  return {
    set(p) {
      sweep();
      map.set(p.state, p);
    },
    take(state) {
      sweep();
      const v = map.get(state) ?? null;
      if (v) map.delete(state);
      return v;
    },
    get(state) {
      sweep();
      return map.get(state) ?? null;
    },
  };
}

export type PendingStore = ReturnType<typeof createPendingStore>;
