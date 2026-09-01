export class BindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindError";
  }
}

const LOOPBACK_EXACT = new Set([
  "127.0.0.1",
  "::1",
  "localhost",
  "0:0:0:0:0:0:0:1",
  "::ffff:127.0.0.1",
]);

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (LOOPBACK_EXACT.has(h)) return true;
  // 127.0.0.0/8
  if (/^127(?:\.\d{1,3}){3}$/.test(h)) return true;
  return false;
}

/**
 * Refuse to start if the process would be exposed without auth.
 * Auth is on by default; `--no-auth` is only legal on loopback.
 */
export function assertBindAllowed(host: string, authEnabled: boolean): void {
  if (isLoopbackHost(host)) return;
  if (!authEnabled) {
    throw new BindError(
      `Refusing to bind ${host}: off-loopback bind requires auth. Use Tailscale Serve or a Cloudflare Tunnel; never bind 0.0.0.0 without auth.`,
    );
  }
}

export function allowedHosts(
  port: number,
  publicOrigin?: string | undefined,
): Set<string> {
  const hosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
    `::1:${port}`,
  ]);
  if (publicOrigin) {
    try {
      const u = new URL(publicOrigin);
      hosts.add(u.host);
    } catch {
      // ignore malformed
    }
  }
  return hosts;
}

export function allowedOrigins(
  port: number,
  publicOrigin?: string | undefined,
): Set<string> {
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]);
  if (publicOrigin) origins.add(publicOrigin.replace(/\/$/, ""));
  return origins;
}
