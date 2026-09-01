import Fastify, { type FastifyInstance } from "fastify";
import { VERSION } from "./version.js";
import { registerSecurity, TOKEN_COOKIE } from "./security.js";
import { isHalted } from "./paths.js";

export type CreateServerOptions = {
  host: string;
  port: number;
  token: string;
  authEnabled: boolean;
  seanHome: string;
  getPort?: (() => number) | undefined;
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

  // Sets the SameSite=Strict cookie so a later dashboard can use it.
  // Token still required on mutating routes via header or cookie.
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

  return app;
}
