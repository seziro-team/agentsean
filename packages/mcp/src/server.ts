import { MCP_TOOLS, callTool, type ToolContext } from "./tools.js";

export const MCP_PROTOCOL = "2024-11-05";

type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

export function handleMcpMessage(_ctx: ToolContext, msg: JsonRpc): JsonRpc | null {
  if (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled") {
    return null;
  }
  const id = msg.id ?? null;
  if (msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: MCP_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "agentsean", version: "2026.9.0" },
        instructions:
          "Agent Sean MCP. Demand-side intelligence from GSC + Bing by default. DataForSEO upgrades in place. Sean never scrapes Google. The LLM never holds write credentials.",
      },
    };
  }
  if (msg.method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  if (msg.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    };
  }
  if (msg.method === "tools/call") {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "tools/call requires handleMcpMessageAsync" },
    };
  }
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${msg.method ?? "unknown"}` },
  };
}

export async function handleMcpMessageAsync(ctx: ToolContext, msg: JsonRpc): Promise<JsonRpc | null> {
  if (msg.method === "tools/call") {
    const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const result = await callTool(ctx, params.name ?? "", params.arguments ?? {});
    return { jsonrpc: "2.0", id: msg.id ?? null, result };
  }
  return handleMcpMessage(ctx, msg);
}

export async function serveStdio(ctx: ToolContext, stdin = process.stdin, stdout = process.stdout): Promise<void> {
  stdin.setEncoding("utf8");
  let buf = "";
  const write = (msg: JsonRpc) => {
    stdout.write(JSON.stringify(msg) + "\n");
  };
  for await (const chunk of stdin) {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let parsed: JsonRpc;
      try {
        parsed = JSON.parse(line) as JsonRpc;
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      const reply = await handleMcpMessageAsync(ctx, parsed);
      if (reply) write(reply);
    }
  }
}
