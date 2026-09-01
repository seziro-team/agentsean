import { parseArgs, HELP } from "./args.js";
import { emit, emitError } from "./output.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";

const VERSION = "0.0.0";

export async function run(argv: string[] = process.argv): Promise<number> {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    emit(args.json, { ok: true, name: "agentsean", version: VERSION }, `agentsean ${VERSION}`);
    return 0;
  }
  if (args.errors.length > 0) {
    emitError(
      args.json,
      { command: args.command, errors: args.errors },
      args.errors.join("\n"),
    );
    return 2;
  }
  if (!args.command) {
    emitError(
      args.json,
      { error: "missing_command" },
      "Missing command. Try `sean start`, `sean stop`, or `sean status`.\n\n" + HELP,
    );
    return 2;
  }

  switch (args.command) {
    case "start":
      return startCommand({
        json: args.json,
        foreground: args.foreground,
        host: args.host,
        port: args.port,
        home: args.home,
      });
    case "stop":
      return stopCommand({ json: args.json, home: args.home });
    case "status":
      return statusCommand({ json: args.json, home: args.home });
    default:
      return 2;
  }
}
