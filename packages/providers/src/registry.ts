import type { CredentialStore } from "@agentsean/credentials";
import type { KeywordRow, ProviderKeys, ProviderStack } from "./types.js";
import { createGscKeywords } from "./gsc.js";
import { createBingClient, createBingVolume } from "./bing.js";
import { createDataForSeoBacklinks, createDataForSeoClient, createDataForSeoSerp, createDataForSeoVolume } from "./dataforseo.js";
import { createOpenPageRank } from "./openpagerank.js";
import { emptyKeywords, unavailableBacklinks, unavailableSerp, unavailableVolume } from "./unavailable.js";
import { isDeadProvider, refuseDeadProvider } from "./refuse.js";

export const PROVIDER_ACCOUNTS = {
  dataforseo: "provider:dataforseo",
  bing: "provider:bing",
  openpagerank: "provider:openpagerank",
  openseo: "provider:openseo",
} as const;

export async function loadProviderKeys(
  store?: CredentialStore,
  extra?: ProviderKeys,
): Promise<ProviderKeys> {
  const keys: ProviderKeys = { ...extra };
  if (!store) return keys;
  const dfs = await store.get(PROVIDER_ACCOUNTS.dataforseo);
  const bing = await store.get(PROVIDER_ACCOUNTS.bing);
  const opr = await store.get(PROVIDER_ACCOUNTS.openpagerank);
  if (dfs) keys.dataforseo = dfs.unwrap();
  if (bing) keys.bing = bing.unwrap();
  if (opr) keys.openpagerank = opr.unwrap();
  return keys;
}

export function createProviderStack(opts: {
  keys?: ProviderKeys;
  gsc?: KeywordRow[];
  fetch?: typeof fetch;
}): ProviderStack {
  const keys = opts.keys ?? {};
  for (const id of Object.keys(keys)) {
    if (isDeadProvider(id)) refuseDeadProvider(id);
  }
  const gsc = opts.gsc?.length ? createGscKeywords(opts.gsc) : emptyKeywords();
  const dfs = keys.dataforseo
    ? createDataForSeoClient({
        loginPassword: keys.dataforseo,
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
      })
    : null;
  const bing = keys.bing
    ? createBingClient({
        apiKey: keys.bing,
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
      })
    : null;

  return {
    keywords: gsc,
    volume: dfs
      ? createDataForSeoVolume(dfs)
      : bing
        ? createBingVolume(bing)
        : unavailableVolume(),
    serp: dfs ? createDataForSeoSerp(dfs) : unavailableSerp(),
    backlinks: dfs
      ? createDataForSeoBacklinks(dfs)
      : keys.openpagerank
        ? createOpenPageRank({
            apiKey: keys.openpagerank,
            ...(opts.fetch ? { fetch: opts.fetch } : {}),
          })
        : unavailableBacklinks(),
    keys: {
      dataforseo: Boolean(keys.dataforseo),
      bing: Boolean(keys.bing),
      openpagerank: Boolean(keys.openpagerank),
    },
    paidUpgrade: Boolean(keys.dataforseo),
  };
}
