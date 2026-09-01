import { CHANNELS, type Channel, VERSION } from "./version.js";

export type UpdateCheck = {
  current: string;
  channel: Channel;
  latest: string | null;
  published: boolean;
  behind: boolean;
};

const REGISTRY = "https://registry.npmjs.org/agentsean";

export async function checkUpdate(opts: {
  channel?: Channel | undefined;
  fetch?: typeof fetch | undefined;
  current?: string | undefined;
}): Promise<UpdateCheck> {
  const channel: Channel = opts.channel ?? "stable";
  const current = opts.current ?? VERSION;
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const tag = channel === "stable" ? "latest" : channel === "dev" ? "beta" : "extended-stable";
  try {
    const res = await fetchFn(REGISTRY);
    if (res.status === 404) {
      return { current, channel, latest: null, published: false, behind: false };
    }
    if (!res.ok) {
      return { current, channel, latest: null, published: false, behind: false };
    }
    const body = (await res.json()) as {
      "dist-tags"?: Record<string, string>;
    };
    const latest = body["dist-tags"]?.[tag] ?? body["dist-tags"]?.["latest"] ?? null;
    return {
      current,
      channel,
      latest,
      published: latest !== null,
      behind: Boolean(latest && latest !== current),
    };
  } catch {
    return { current, channel, latest: null, published: false, behind: false };
  }
}

export { CHANNELS };
