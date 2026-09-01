import { parseArgs, HELP } from "./args.js";
import { emit, emitError } from "./output.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { auditCommand } from "./commands/audit.js";
import { connectCommand } from "./commands/connect.js";
import { applyCommand } from "./commands/apply.js";
import { revertCommand } from "./commands/revert.js";
import { freezeCommand } from "./commands/freeze.js";
import { contentCommand } from "./commands/content.js";

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
      "Missing command. Try `sean start`, `sean stop`, `sean status`, `sean audit <url>`, `sean connect google`, `sean apply --repo ./site`, `sean revert <id>`, `sean content`, or `sean freeze`.\n\n" + HELP,
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
    case "audit":
      return auditCommand({
        json: args.json,
        target: args.target,
        home: args.home,
        maxPages: args.maxPages,
        concurrency: args.concurrency,
        render: args.render,
      });
    case "connect":
      return connectCommand({
        json: args.json,
        home: args.home,
        provider: args.provider,
        target: args.target,
        byo: args.byo,
        credentialsPath: args.credentialsPath,
        apiKey: args.apiKey,
      });
    case "apply":
      return applyCommand({
        json: args.json,
        home: args.home,
        target: args.target,
        repo: args.repo,
        dryRun: args.dryRun,
      });
    case "revert":
      return revertCommand({
        json: args.json,
        home: args.home,
        changeId: args.target,
      });
    case "freeze":
      return freezeCommand({ json: args.json, home: args.home, off: args.off });
    case "unfreeze":
      return freezeCommand({ json: args.json, home: args.home, off: true });
    case "content":
      return contentCommand({
        json: args.json,
        home: args.home,
        target: args.target,
        repo: args.repo,
        dryRun: args.dryRun,
      });
    default:
      return 2;
  }
}
