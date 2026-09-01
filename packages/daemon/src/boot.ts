import { createHash } from "node:crypto";
import { openSqlite, assertDbNotWorldReadable } from "@agentsean/db";
import { createPendingStore } from "@agentsean/google";
import { createHandlers, createSqliteQueue, startLoop } from "@agentsean/scheduler";
import { assertBindAllowed, BindError } from "./bind.js";
import {
  dbPath,
  defaultSeanHome,
  DEFAULT_HOST,
  DEFAULT_PORT,
  ensureSeanHome,
  isHalted,
} from "./paths.js";
import { isPidAlive, readPid, removePid, writePid } from "./pid.js";
import { createServer } from "./server.js";
import { loadOrCreateToken, openDaemonStore } from "./token.js";
import { createEventBus } from "./events.js";

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
  const { sqlite, db } = openSqlite(dbFile);
  assertDbNotWorldReadable(dbFile);
  const pending = createPendingStore();
  const bus = createEventBus();
  const queue = createSqliteQueue(db);
  await queue.recoverStale();
  const tokenValue = token.unwrap();
  const handlers = createHandlers({
    db,
    store,
    approvalKey: createHash("sha256").update(tokenValue).digest(),
  });
  const stopLoop = startLoop(queue, handlers, {
    db,
    halted: () => isHalted(seanHome),
    intervalMs: 15_000,
    onTick: (result) => {
      if (result.ran > 0 || result.recovered > 0) bus.emit("jobs");
    },
  });

  const bound = { port };
  const app = await createServer({
    host,
    port,
    token: tokenValue,
    authEnabled: true,
    seanHome,
    getPort: () => bound.port,
    db,
    sqlite,
    store,
    pending,
    queue,
    bus,
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
    await stopLoop();
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
