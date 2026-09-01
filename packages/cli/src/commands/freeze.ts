import {
  defaultSeanHome,
  ensureSeanHome,
  isHalted,
  setHalted,
} from "@agentsean/daemon";
import { emit } from "../output.js";

export async function freezeCommand(opts: {
  json: boolean;
  home?: string | undefined;
  off: boolean;
}): Promise<number> {
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  setHalted(home, !opts.off);
  const halted = isHalted(home);
  emit(
    opts.json,
    { ok: true, command: opts.off ? "unfreeze" : "freeze", halted },
    halted
      ? "Sean is frozen. All writes are halted until `sean unfreeze`."
      : "Sean is unfrozen. Writes may proceed under policy.",
  );
  return 0;
}
