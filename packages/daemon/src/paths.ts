import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 7777;
export const TOKEN_ACCOUNT = "daemon-auth-token";
export const HALT_FILENAME = "HALT";

export function defaultSeanHome(): string {
  return process.env["SEAN_HOME"]?.trim() || path.join(os.homedir(), ".sean");
}

export function ensureSeanHome(home: string): string {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(home, 0o700);
    } catch {
      // best-effort
    }
  }
  return home;
}

export function pidPath(home: string): string {
  return path.join(home, "daemon.pid");
}

export function logPath(home: string): string {
  return path.join(home, "daemon.log");
}

export function dbPath(home: string): string {
  return path.join(home, "sean.db");
}

export function haltPath(home: string): string {
  return path.join(home, HALT_FILENAME);
}

export function isHalted(home: string): boolean {
  if (process.env["SEAN_HALT"] === "1") return true;
  return fs.existsSync(haltPath(home));
}

export function setHalted(home: string, halted: boolean): void {
  const file = haltPath(ensureSeanHome(home));
  if (halted) {
    fs.writeFileSync(file, `halted ${new Date().toISOString()}\n`, { mode: 0o600 });
    return;
  }
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
