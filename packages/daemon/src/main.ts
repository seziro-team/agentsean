#!/usr/bin/env node
import { startDaemon } from "./boot.js";
import { DEFAULT_HOST, DEFAULT_PORT, defaultSeanHome } from "./paths.js";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const host = arg("host") ?? process.env["SEAN_HOST"] ?? DEFAULT_HOST;
const portRaw = arg("port") ?? process.env["SEAN_PORT"];
const port = portRaw ? Number(portRaw) : DEFAULT_PORT;
const seanHome = arg("home") ?? defaultSeanHome();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write(`invalid port: ${portRaw}\n`);
  process.exit(2);
}

const running = await startDaemon({ host, port, seanHome });
process.stdout.write(
  JSON.stringify({
    ok: true,
    host: running.host,
    port: running.port,
    pid: running.pid,
  }) + "\n",
);
