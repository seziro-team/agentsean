// Copied from OpenSEO (every-app/open-seo) src/server/mcp/formatters.ts
// under the MIT License. Copyright (c) 2026 Ben Senescu and contributors.
// COPY_VERBATIM except the CallToolResult import: OpenSEO used
// `@modelcontextprotocol/server`; Sean's MCP is stdio-first and uses a local
// type matching the MCP spec so we do not take a Workers MCP runtime.

export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
};

type McpResponseMeta = {
  url?: string;
  projectId?: string;
  runId?: string;
  creditsCharged?: number;
  creditsRemaining?: number;
};

// The generic overload preserves each tool's concrete structuredContent shape
// so tests (and callers) can access fields without casting. The type parameter
// appears in exactly one position — a required `structuredContent: T` — which
// is what makes inference work; a `T` shared between an optional field and an
// intersection member collapses to `{}`.
export function mcpResponse<T extends Record<string, unknown>>(opts: {
  text: string;
  meta?: McpResponseMeta;
  structuredContent: T;
}): CallToolResult & {
  structuredContent: T & { meta?: Record<string, unknown> };
};
export function mcpResponse(opts: {
  text: string;
  meta?: McpResponseMeta;
}): CallToolResult;
export function mcpResponse(opts: {
  text: string;
  meta?: McpResponseMeta;
  structuredContent?: Record<string, unknown>;
}): CallToolResult {
  const result: CallToolResult = {
    content: [{ type: "text", text: opts.text }],
  };
  let meta: Record<string, unknown> | undefined;
  if (opts.meta) {
    meta = {};
    for (const [key, value] of Object.entries(opts.meta)) {
      if (value !== undefined) meta[key] = value;
    }
  }
  const hasMeta = meta != null && Object.keys(meta).length > 0;
  if (opts.structuredContent) {
    result.structuredContent =
      hasMeta && meta ? { ...opts.structuredContent, meta } : opts.structuredContent;
  } else if (hasMeta && meta) {
    result.structuredContent = { meta };
  }
  if (hasMeta && meta) {
    result._meta = meta;
  }
  return result;
}
