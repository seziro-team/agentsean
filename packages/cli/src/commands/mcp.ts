import { openSqlite } from "@agentsean/db";
import { MCP_TOOLS, serveStdio } from "@agentsean/mcp";
import { dbPath, defaultSeanHome, ensureSeanHome } from "@agentsean/daemon";
import { emit } from "../output.js";

export async function mcpCommand(opts: {
  json: boolean;
  home?: string | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  if (opts.json) {
    emit(
      true,
      {
        command: "mcp",
        ok: true,
        transport: "stdio",
        protocol: "2024-11-05",
        tools: MCP_TOOLS.map((t) => t.name),
      },
      "",
    );
    return 0;
  }
  const { db, sqlite } = openSqlite(dbPath(home));
  try {
    await serveStdio({ db });
    return 0;
  } finally {
    sqlite.close();
  }
}
