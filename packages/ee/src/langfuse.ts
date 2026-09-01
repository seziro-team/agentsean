export type LangfuseEvent = {
  tenantId: string;
  siteId?: string | undefined;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** Self-hosted Langfuse on the hosted tier only. No-op without LANGFUSE_HOST. */
export async function traceLlm(
  event: LangfuseEvent,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const host = env["LANGFUSE_HOST"]?.trim();
  if (!host) return;
  const publicKey = env["LANGFUSE_PUBLIC_KEY"]?.trim();
  const secretKey = env["LANGFUSE_SECRET_KEY"]?.trim();
  if (!publicKey || !secretKey) return;
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  await fetch(`${host.replace(/\/$/, "")}/api/public/ingestion`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      batch: [
        {
          type: "generation-create",
          body: {
            name: "sean-llm",
            model: event.model,
            input: { tenantId: event.tenantId, siteId: event.siteId ?? null },
            usage: {
              input: event.inputTokens,
              output: event.outputTokens,
              total: event.inputTokens + event.outputTokens,
            },
            metadata: { costUsd: event.costUsd },
          },
        },
      ],
    }),
  });
}
