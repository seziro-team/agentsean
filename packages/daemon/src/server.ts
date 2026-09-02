import Fastify, { type FastifyInstance } from "fastify";
import type { SqliteDatabase } from "@agentsean/db";
import { searchFindingsFts } from "@agentsean/db";
import type { CredentialStore } from "@agentsean/credentials";
import type { PendingStore } from "@agentsean/google";
import type { JobQueue } from "@agentsean/scheduler";
import { VERSION } from "./version.js";
import {
  readToken,
  registerSecurity,
  TOKEN_COOKIE,
  type SecurityOptions,
} from "./security.js";
import { isHalted } from "./paths.js";
import { registerGoogleRoutes } from "./google-routes.js";
import { registerActionRoutes } from "./action-routes.js";
import { registerDashboardRoutes } from "./dashboard-routes.js";
import { registerHostedRoutes } from "./hosted-routes.js";
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
  publicOrigin?: string | undefined;
};

export async function createServer(
  options: CreateServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: false,
    routerOptions: { ignoreTrailingSlash: true },
  });

  const security: SecurityOptions = {
    port: options.port,
    token: options.token,
    authEnabled: options.authEnabled,
  };
  if (options.getPort) security.getPort = options.getPort;
  if (options.publicOrigin) security.publicOrigin = options.publicOrigin;
  registerSecurity(app, security);

  app.get("/api/health", async () => ({
    ok: true,
    name: "sean",
    version: VERSION,
    bind: `${options.host}:${options.port}`,
    halted: isHalted(options.seanHome),
  }));

  // Sets the SameSite=Strict cookie so the dashboard EventSource can auth.
  //
  // Reads the cookie as well as the header. The SPA strips `#token=` from the
  // URL once the session exists, so on every load after the first the cookie
  // is the only credential the browser still holds; a header-only check
  // answered 401 there, and the dashboard drew its "open this from the daemon"
  // gate over every route while a perfectly good cookie sat in the browser.
  // Same token comparison either way, and the onRequest hook has already
  // enforced host and origin.
  app.get("/api/session", async (req, reply) => {
    if (readToken(req) !== options.token) {
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
  if (options.db) {
    registerHostedRoutes(app, { db: options.db });
  }

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
