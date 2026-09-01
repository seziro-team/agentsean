import { checkUpdate, isChannel, VERSION, type Channel } from "@agentsean/launch";
import { emit, emitError } from "../output.js";

export async function updateCommand(opts: {
  json: boolean;
  channel?: string | undefined;
}): Promise<number> {
  const raw = opts.channel ?? "stable";
  if (!isChannel(raw)) {
    emitError(
      opts.json,
      { command: "update", error: "unknown_channel", channel: raw },
      "Channel must be stable, extended-stable, or dev.",
    );
    return 2;
  }
  const channel: Channel = raw;
  const result = await checkUpdate({ channel });
  const human = result.published
    ? result.behind
      ? `Update available: ${result.current} → ${result.latest} (${channel}). Auto-update never runs while an Action is mid-flight. npm install -g agentsean@${result.latest}`
      : `Agent Sean ${VERSION} is current on ${channel}.`
    : `Agent Sean ${VERSION}. Not on npm yet — install from source or wait for the first publish.`;
  emit(opts.json, { ok: true, command: "update", ...result }, human);
  return 0;
}
