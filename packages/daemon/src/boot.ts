import { openSqlite, assertDbNotWorldReadable } from "@agentsean/db";
import { assertBindAllowed, BindError } from "./bind.js";
import {
  dbPath,
  defaultSeanHome,
  DEFAULT_HOST,
  DEFAULT_PORT,
  ensureSeanHome,
} from "./paths.js";
import { isPidAlive, readPid, removePid, writePid } from "./pid.js";
import { createServer } from "./server.js";
import { loadOrCreateToken, openDaemonStore } from "./token.js";

export type BootOptions = {
  host?: string | undefined;
  port?: number | undefined;
  seanHome?: string | undefined;
  authEnabled?: boolean | undefined;
  registerSignals?: boolean | undefined;
};

export type RunningDaemon = {
  host: string;
  port: number;
  pid: number;
  close: () => Promise<void>;
};

export async function startDaemon(options: BootOptions = {}): Promise<RunningDaemon> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const authEnabled = options.authEnabled ?? true;
  assertBindAllowed(host, authEnabled);
  if (!authEnabled) {
    throw new BindError("Auth cannot be disabled. The daemon is fail-closed.");
  }

  const seanHome = ensureSeanHome(options.seanHome ?? defaultSeanHome());
  const existing = readPid(seanHome);
  if (existing && isPidAlive(existing.pid) && existing.pid !== process.pid) {
    throw new Error(
      `Daemon already running (pid ${existing.pid} on ${existing.host}:${existing.port})`,
    );
  }

  const store = openDaemonStore(seanHome);
  const token = await loadOrCreateToken(store);
  const dbFile = dbPath(seanHome);
  const { sqlite } = openSqlite(dbFile);
  assertDbNotWorldReadable(dbFile);

  const bound = { port };
  const app = await createServer({
    host,
    port,
    token: token.unwrap(),
    authEnabled: true,
    seanHome,
    getPort: () => bound.port,
  });

  try {
    await app.listen({ host, port, listenTextResolver: () => "" });
  } catch (err) {
    sqlite.close();
    throw err;
  }

  const addr = app.server.address();
  const actualPort =
    typeof addr === "object" && addr !== null ? addr.port : port;
  bound.port = actualPort;

  writePid(seanHome, {
    pid: process.pid,
    host,
    port: actualPort,
    startedAt: new Date().toISOString(),
  });

  const close = async () => {
    await app.close();
    sqlite.close();
    const current = readPid(seanHome);
    if (current?.pid === process.pid) removePid(seanHome);
  };

  if (options.registerSignals !== false) {
    const shutdown = () => {
      void close().finally(() => process.exit(0));
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  }

  return { host, port: actualPort, pid: process.pid, close };
}
