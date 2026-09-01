import {
  defaultSeanHome,
  isPidAlive,
  isHalted,
  readPid,
  DEFAULT_HOST,
  DEFAULT_PORT,
} from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function statusCommand(opts: {
  json: boolean;
  home?: string | undefined;
}): Promise<number> {
  const home = opts.home ?? defaultSeanHome();
  const info = readPid(home);
  if (!info || !isPidAlive(info.pid)) {
    emitError(opts.json, { command: "status", running: false }, "Sean is not running.");
    return 1;
  }

  const host = info.host || DEFAULT_HOST;
  const port = info.port || DEFAULT_PORT;
  let health: unknown = null;
  try {
    const res = await fetch(`http://${host}:${port}/api/health`, {
      headers: { Host: `${host}:${port}` },
    });
    if (res.ok) health = await res.json();
  } catch {
    health = null;
  }

  emit(
    opts.json,
    {
      ok: true,
      command: "status",
      running: true,
      pid: info.pid,
      host,
      port,
      halted: isHalted(home),
      health,
    },
    `Sean is running (pid ${info.pid}) on http://${host}:${port}${isHalted(home) ? " (frozen)" : ""}`,
  );
  return 0;
}
