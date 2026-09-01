import { defaultSeanHome, isPidAlive, readPid, removePid } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function stopCommand(opts: {
  json: boolean;
  home?: string | undefined;
}): Promise<number> {
  const home = opts.home ?? defaultSeanHome();
  const info = readPid(home);
  if (!info || !isPidAlive(info.pid)) {
    removePid(home);
    emit(
      opts.json,
      { ok: true, command: "stop", running: false },
      "Sean is not running.",
    );
    return 0;
  }

  try {
    process.kill(info.pid, "SIGTERM");
  } catch (err) {
    emitError(
      opts.json,
      { command: "stop", error: String(err) },
      `Failed to stop pid ${info.pid}: ${String(err)}`,
    );
    return 1;
  }

  for (let i = 0; i < 50; i++) {
    if (!isPidAlive(info.pid)) break;
    await sleep(100);
  }

  if (isPidAlive(info.pid)) {
    try {
      process.kill(info.pid, "SIGKILL");
    } catch {
      // ignore
    }
  }
  removePid(home);
  emit(
    opts.json,
    { ok: true, command: "stop", pid: info.pid },
    `Stopped Sean (pid ${info.pid}).`,
  );
  return 0;
}
