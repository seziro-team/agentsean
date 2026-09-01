/** Canonical installer flag surface. install.sh and install.ps1 must match. */
export const INSTALL_FLAGS = [
  "--no-onboard",
  "--version=",
  "--prefix=",
  "--channel=",
  "--from-source=",
  "--dry-run",
  "--help",
] as const;

export const INSTALL_CHANNELS = ["stable", "extended-stable", "dev"] as const;

export type InstallPlan = {
  prefix: string;
  channel: string;
  onboard: boolean;
  fromSource: string | null;
  version: string | null;
  dryRun: boolean;
  steps: string[];
};

export function planInstall(args: {
  prefix?: string | undefined;
  channel?: string | undefined;
  onboard?: boolean | undefined;
  fromSource?: string | null | undefined;
  version?: string | null | undefined;
  dryRun?: boolean | undefined;
  nodePresent?: boolean | undefined;
}): InstallPlan {
  const prefix = args.prefix ?? "~/.sean";
  const channel = args.channel ?? "stable";
  const onboard = args.onboard ?? true;
  const fromSource = args.fromSource ?? null;
  const version = args.version ?? null;
  const dryRun = args.dryRun ?? false;
  const nodePresent = args.nodePresent ?? true;
  const steps: string[] = [];
  if (!nodePresent) {
    steps.push(
      `download Node >= 22.19 into ${prefix}/runtime (official nodejs.org tarball)`,
    );
  } else {
    steps.push("use Node already on PATH");
  }
  if (fromSource) {
    steps.push(`link CLI from source at ${fromSource} (no npm lifecycle scripts)`);
  } else {
    steps.push(
      version
        ? `npm install -g agentsean@${version} (no postinstall; npm 12+ safe)`
        : `npm install -g agentsean@${channel === "stable" ? "latest" : channel} (no postinstall; npm 12+ safe)`,
    );
  }
  steps.push(`provision ${prefix} on first run, not at install`);
  if (onboard) steps.push("run sean onboard");
  else steps.push("skip onboard (--no-onboard)");
  return { prefix, channel, onboard, fromSource, version, dryRun, steps };
}
