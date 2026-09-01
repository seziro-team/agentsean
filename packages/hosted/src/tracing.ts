import { isEeBuild, traceLlm as eeTraceLlm } from "@agentsean/ee";
import { isHostedMode } from "./plans.js";

export type LlmTrace = {
  tenantId: string;
  siteId?: string | undefined;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** Langfuse is hosted-tier only. Self-host is a no-op. */
export async function traceLlm(
  event: LlmTrace,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!isHostedMode(env) || !isEeBuild(env)) return;
  await eeTraceLlm(event);
}
