import fs from "node:fs";
import { defaultSeanHome } from "@agentsean/daemon";
import { emit } from "../output.js";
import { serviceCommand } from "./service.js";
import { stopCommand } from "./stop.js";

export async function uninstallCommand(opts: {
  json: boolean;
  home?: string | undefined;
  purge?: boolean | undefined;
}): Promise<number> {
  const home = opts.home ?? defaultSeanHome();
  await stopCommand({ json: true, home });
  await serviceCommand({ json: true, home, target: "uninstall", yes: true });
  let purged = false;
  if (opts.purge && fs.existsSync(home)) {
    fs.rmSync(home, { recursive: true, force: true });
    purged = true;
  }
  emit(
    opts.json,
    { ok: true, command: "uninstall", home, purged },
    purged
      ? `Stopped Sean, removed the user service, and deleted ${home}.`
      : `Stopped Sean and removed the user service. Data remains in ${home}. Pass --purge to delete it.`,
  );
  return 0;
}
