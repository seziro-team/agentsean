import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { allowedHosts, allowedOrigins } from "./bind.js";
import { tokensEqual } from "./token.js";

export const CSRF_HEADER = "x-sean-csrf";
export const TOKEN_HEADER = "x-sean-token";
export const TOKEN_COOKIE = "sean_token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function pathOnly(url: string): string {
  const q = url.indexOf("?");
  const path = q === -1 ? url : url.slice(0, q);
  return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}

export type SecurityOptions = {
  port: number;
  token: string;
  authEnabled: boolean;
  /** Used when listen() assigned an ephemeral port (port 0). */
  getPort?: (() => number) | undefined;
  publicOrigin?: string | undefined;
};

function readToken(req: FastifyRequest): string | undefined {
  const header = req.headers[TOKEN_HEADER];
  if (typeof header === "string" && header.length > 0) return header;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length);
  }
  const cookie = req.headers.cookie;
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [rawName, ...rest] = part.trim().split("=");
      if (rawName === TOKEN_COOKIE) return rest.join("=");
    }
  }
  return undefined;
}

export function registerSecurity(
  app: FastifyInstance,
  options: SecurityOptions,
): void {
  const portOf = () => options.getPort?.() ?? options.port;

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const hosts = allowedHosts(portOf(), options.publicOrigin);
    const host = req.headers.host ?? "";
    if (!hosts.has(host)) {
      return reply.code(403).send({ error: "forbidden_host" });
    }

    const path = pathOnly(req.url);
    // RFC 8252 loopback: Google / the broker 302 here. Host is still checked.
    if (SAFE_METHODS.has(req.method.toUpperCase()) && path === "/oauth/callback") {
      return;
    }
    // Stripe webhooks cannot send CSRF or the session cookie. Signature is checked in-route.
    if (req.method.toUpperCase() === "POST" && path === "/api/billing/webhook") {
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      if (!allowedOrigins(portOf(), options.publicOrigin).has(origin)) {
        return reply.code(403).send({ error: "forbidden_origin" });
      }
    }

    const fetchSite = req.headers["sec-fetch-site"];
    if (fetchSite === "cross-site") {
      return reply.code(403).send({ error: "forbidden_fetch_site" });
    }

    const method = req.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      if (path === "/api/events") {
        if (!options.authEnabled) {
          return reply.code(401).send({ error: "unauthorized" });
        }
        const presented = readToken(req);
        if (!presented || !tokensEqual(presented, options.token)) {
          return reply.code(401).send({ error: "unauthorized" });
        }
      }
      return;
    }

    const csrf = req.headers[CSRF_HEADER];
    if (csrf !== "1") {
      return reply.code(403).send({ error: "missing_csrf_header" });
    }

    if (!options.authEnabled) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const presented = readToken(req);
    if (!presented || !tokensEqual(presented, options.token)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  // No CORS, ever. Strip any plugin that tries.
  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.removeHeader("access-control-allow-origin");
    reply.removeHeader("access-control-allow-credentials");
    reply.removeHeader("access-control-allow-headers");
    reply.removeHeader("access-control-allow-methods");
  });
}
