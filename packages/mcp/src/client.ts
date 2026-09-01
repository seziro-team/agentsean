/**
 * MCP *client* so Sean can consume OpenSEO if the user already runs it.
 * LEARN_FROM OpenSEO's streamable-HTTP transport; we speak JSON-RPC over POST.
 * Agent Sean is not a fork of OpenSEO.
 */

export type OpenSeoClient = {
  url: string;
  listTools: () => Promise<Array<{ name: string; description?: string }>>;
  callTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
};

export function createOpenSeoClient(opts: {
  url: string;
  apiKey?: string;
  fetch?: typeof fetch;
}): OpenSeoClient {
  const fetchFn = opts.fetch ?? fetch;
  let nextId = 1;

  async function rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (opts.apiKey) headers["authorization"] = `Bearer ${opts.apiKey}`;
    const res = await fetchFn(opts.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method,
        ...(params ? { params } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenSEO MCP HTTP ${res.status}`);
    const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message ?? "OpenSEO MCP error");
    return json.result;
  }

  return {
    url: opts.url,
    async listTools() {
      const result = (await rpc("tools/list")) as { tools?: Array<{ name: string; description?: string }> };
      return result.tools ?? [];
    },
    async callTool(name, args) {
      return rpc("tools/call", { name, arguments: args ?? {} });
    },
  };
}
