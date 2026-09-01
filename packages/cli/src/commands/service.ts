import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  defaultSeanHome,
  ensureSeanHome,
  DEFAULT_HOST,
  DEFAULT_PORT,
} from "@agentsean/daemon";
import { planService, writeService, removeServiceFile } from "@agentsean/launch";
import { emit, emitError } from "../output.js";

async function daemonEntry(): Promise<string> {
  const resolved = import.meta.resolve("@agentsean/daemon/main");
  return fileURLToPath(resolved);
}

export async function serviceCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
  yes?: boolean | undefined;
  host?: string | undefined;
  port?: number | undefined;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const action = (opts.target ?? "status").toLowerCase();
  const plan = planService({
    home,
    nodePath: process.execPath,
    daemonEntry: await daemonEntry(),
    host: opts.host ?? DEFAULT_HOST,
    port: opts.port ?? DEFAULT_PORT,
  });

  if (action === "status") {
    emit(
      opts.json,
      { ok: true, command: "service", action: "status", plan },
      `Service plan (${plan.kind}):\n${plan.summary}\nNot installed until you run sean service install.`,
    );
    return 0;
  }

  if (action === "install") {
    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        emitError(
          opts.json,
          { command: "service", error: "confirm_required", summary: plan.summary },
          `${plan.summary}\n\nPass --yes to write the unit. Service install is never a side effect of npm or onboard.`,
        );
        return 2;
      }
      const { createInterface } = await import("node:readline/promises");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`This will write:\n${plan.summary}\n\nType yes to continue: `);
      rl.close();
      if (answer.trim().toLowerCase() !== "yes") {
        emit(opts.json, { ok: true, command: "service", aborted: true }, "Aborted.");
        return 1;
      }
    }
    writeService(plan);
    const ran = spawnSync(plan.enable[0] ?? "true", plan.enable.slice(1), {
      encoding: "utf8",
    });
    const enabled = ran.status === 0;
    emit(
      opts.json,
      {
        ok: true,
        command: "service",
        action: "install",
        path: plan.path,
        enable: plan.enable,
        enabled,
        stderr: ran.stderr,
      },
      enabled
        ? `Installed ${plan.kind} at ${plan.path}.`
        : `Wrote ${plan.path}. Enable it with: ${plan.enable.join(" ")}\n${ran.stderr || ran.stdout || ""}`.trim(),
    );
    return 0;
  }

  if (action === "uninstall") {
    spawnSync(plan.disable[0] ?? "true", plan.disable.slice(1), { encoding: "utf8" });
    removeServiceFile(plan);
    emit(
      opts.json,
      { ok: true, command: "service", action: "uninstall", path: plan.path },
      `Removed ${plan.path}.`,
    );
    return 0;
  }

  emitError(
    opts.json,
    { command: "service", error: "unknown_action" },
    "Usage: sean service [status|install|uninstall]",
  );
  return 2;
}
