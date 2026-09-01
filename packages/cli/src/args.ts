export type CommandName =
  | "start"
  | "stop"
  | "status"
  | "audit"
  | "connect"
  | "apply"
  | "revert"
  | "freeze"
  | "unfreeze"
  | "content";

export type CliArgs = {
  command: CommandName | undefined;
  json: boolean;
  help: boolean;
  version: boolean;
  foreground: boolean;
  host: string | undefined;
  port: number | undefined;
  home: string | undefined;
  target: string | undefined;
  maxPages: number | undefined;
  concurrency: number | undefined;
  render: boolean;
  provider: string | undefined;
  byo: boolean;
  credentialsPath: string | undefined;
  apiKey: string | undefined;
  repo: string | undefined;
  dryRun: boolean;
  off: boolean;
  errors: string[];
};

const COMMANDS = new Set<string>([
  "start",
  "stop",
  "status",
  "audit",
  "connect",
  "apply",
  "revert",
  "freeze",
  "unfreeze",
  "content",
]);

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: undefined,
    json: false,
    help: false,
    version: false,
    foreground: false,
    host: undefined,
    port: undefined,
    home: undefined,
    target: undefined,
    maxPages: undefined,
    concurrency: undefined,
    render: true,
    provider: undefined,
    byo: false,
    credentialsPath: undefined,
    apiKey: undefined,
    repo: undefined,
    dryRun: false,
    off: false,
    errors: [],
  };

  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === undefined) break;
    if (a === "--json") {
      args.json = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      args.help = true;
      continue;
    }
    if (a === "--version" || a === "-v") {
      args.version = true;
      continue;
    }
    if (a === "--foreground" || a === "-f") {
      args.foreground = true;
      continue;
    }
    if (a === "--host") {
      args.host = rest[++i];
      continue;
    }
    if (a === "--port") {
      const raw = rest[++i];
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        args.errors.push(`invalid --port ${raw}`);
      } else {
        args.port = n;
      }
      continue;
    }
    if (a === "--home") {
      args.home = rest[++i];
      continue;
    }
    if (a === "--max-pages") {
      const raw = rest[++i];
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) args.errors.push(`invalid --max-pages ${raw}`);
      else args.maxPages = n;
      continue;
    }
    if (a === "--concurrency") {
      const raw = rest[++i];
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) args.errors.push(`invalid --concurrency ${raw}`);
      else args.concurrency = n;
      continue;
    }
    if (a === "--no-js" || a === "--no-render") {
      args.render = false;
      continue;
    }
    if (a === "--byo" || a === "--own-credentials") {
      args.byo = true;
      continue;
    }
    if (a === "--credentials") {
      args.credentialsPath = rest[++i];
      continue;
    }
    if (a === "--api-key") {
      args.apiKey = rest[++i];
      continue;
    }
    if (a === "--repo") {
      args.repo = rest[++i];
      continue;
    }
    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (a === "--off") {
      args.off = true;
      continue;
    }
    if (a.startsWith("-")) {
      args.errors.push(`unknown flag ${a}`);
      continue;
    }
    if (COMMANDS.has(a) && args.command === undefined) {
      args.command = a as CommandName;
      continue;
    }
    if (args.command === "audit" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "connect" && args.provider === undefined) {
      args.provider = a;
      continue;
    }
    if (args.command === "connect" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "apply" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "revert" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "content" && args.target === undefined) {
      args.target = a;
      continue;
    }
    args.errors.push(`unexpected argument ${a}`);
  }

  return args;
}

export const HELP = `Agent Sean — the SEO engineer that never sleeps.

Usage:
  sean start [--foreground] [--host 127.0.0.1] [--port 7777] [--json]
  sean stop [--json]
  sean status [--json]
  sean audit <url> [--max-pages N] [--concurrency N] [--no-js] [--json]
  sean connect google [origin] [--byo] [--credentials client_secret.json] [--api-key KEY] [--json]
  sean apply [origin] --repo /path/to/site [--dry-run] [--json]
  sean revert <changeId> [--json]
  sean freeze [--off] [--json]
  sean unfreeze [--json]
  sean content [origin] [--repo /path/to/site] [--dry-run] [--json]

Every command accepts --json. The daemon binds 127.0.0.1 only and refuses to
start off-loopback without auth. Audit crawls a URL with zero credentials.
Connect Google opens the local dashboard; the hosted broker never talks to
this machine. --byo uses your own Cloud project (publish to Production).
Apply plans title-tag fixes, validates them, and opens a Git PR. Revert
restores the shadow-ledger snapshot. Freeze writes HALT and stops every write
across every site; it survives restart. Content identifies a decaying page from
GSC clicks, rewrites it, runs PublishGate, and publishes via the Git adapter.
New pages are capped at 2/day/site and the cap is not overridable.
`;
