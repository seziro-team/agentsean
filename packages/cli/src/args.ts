export type CommandName = "start" | "stop" | "status";

export type CliArgs = {
  command: CommandName | undefined;
  json: boolean;
  help: boolean;
  version: boolean;
  foreground: boolean;
  host: string | undefined;
  port: number | undefined;
  home: string | undefined;
  errors: string[];
};

const COMMANDS = new Set<string>(["start", "stop", "status"]);

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
    if (a.startsWith("-")) {
      args.errors.push(`unknown flag ${a}`);
      continue;
    }
    if (COMMANDS.has(a) && args.command === undefined) {
      args.command = a as CommandName;
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

Every command accepts --json. The daemon binds 127.0.0.1 only and refuses to
start off-loopback without auth.
`;
