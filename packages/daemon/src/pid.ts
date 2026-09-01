import fs from "node:fs";
import { pidPath } from "./paths.js";

export type PidInfo = {
  pid: number;
  host: string;
  port: number;
  startedAt: string;
};

export function readPid(home: string): PidInfo | null {
  const file = pidPath(home);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as PidInfo;
    if (typeof parsed.pid !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePid(home: string, info: PidInfo): void {
  fs.writeFileSync(pidPath(home), JSON.stringify(info), { mode: 0o600 });
}

export function removePid(home: string): void {
  const file = pidPath(home);
  try {
    fs.unlinkSync(file);
  } catch {
    // already gone
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
