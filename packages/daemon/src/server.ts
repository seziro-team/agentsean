import Fastify, { type FastifyInstance } from "fastify";
import type { SqliteDatabase } from "@agentsean/db";
import { searchFindingsFts } from "@agentsean/db";
import type { CredentialStore } from "@agentsean/credentials";
import type { PendingStore } from "@agentsean/google";
import type { JobQueue } from "@agentsean/scheduler";
import { VERSION } from "./version.js";
import { registerSecurity, TOKEN_COOKIE } from "./security.js";
import { isHalted } from "./paths.js";
import { registerGoogleRoutes } from "./google-routes.js";
import { registerActionRoutes } from "./action-routes.js";
import { registerDashboardRoutes } from "./dashboard-routes.js";
import { registerSpa } from "./spa.js";
import { createEventBus, type EventBus } from "./events.js";

export type CreateServerOptions = {
  host: string;
  port: number;
  token: string;
  authEnabled: boolean;
  seanHome: string;
  getPort?: (() => number) | undefined;
  db?: SqliteDatabase | undefined;
  sqlite?: Parameters<typeof searchFindingsFts>[0] | undefined;
  store?: CredentialStore | undefined;
  pending?: PendingStore | undefined;
  fetch?: typeof fetch | undefined;
  queue?: JobQueue | undefined;
  bus?: EventBus | undefined;
};

export async function createServer(
  options: CreateServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: false,
    routerOptions: { ignoreTrailingSlash: true },
  });

  registerSecurity(app, {
    port: options.port,
    token: options.token,
    authEnabled: options.authEnabled,
    getPort: options.getPort,
  });

  app.get("/api/health", async () => ({
    ok: true,
    name: "sean",
    version: VERSION,
    bind: `${options.host}:${options.port}`,
    halted: isHalted(options.seanHome),
  }));

  // Sets the SameSite=Strict cookie so the dashboard EventSource can auth.
  app.get("/api/session", async (req, reply) => {
    const presented =
      (typeof req.headers["x-sean-token"] === "string" &&
        req.headers["x-sean-token"]) ||
      (typeof req.headers.authorization === "string" &&
      req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice("Bearer ".length)
        : undefined);
    if (presented !== options.token) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    reply.header(
      "Set-Cookie",
      `${TOKEN_COOKIE}=${options.token}; HttpOnly; SameSite=Strict; Path=/`,
    );
    return { ok: true };
  });

  if (options.db && options.store && options.pending) {
    registerGoogleRoutes(app, {
      db: options.db,
      store: options.store,
      pending: options.pending,
      getPort: options.getPort ?? (() => options.port),
      fetch: options.fetch,
    });
  }

  if (options.db) {
    registerActionRoutes(app, {
      db: options.db,
      seanHome: options.seanHome,
      token: options.token,
      gitFetch: options.fetch,
    });
  }

  const sqlite = options.sqlite;
  if (options.db && sqlite) {
    registerDashboardRoutes(app, {
      db: options.db,
      sqlite,
      seanHome: options.seanHome,
      token: options.token,
      bus: options.bus ?? createEventBus(),
      queue: options.queue,
      store: options.store,
    });
  }

  registerSpa(app);

  return app;
}
