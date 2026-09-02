import { parseArgs, helpText, invokedAs } from "./args.js";
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
import { keywordsCommand } from "./commands/keywords.js";
import { mcpCommand } from "./commands/mcp.js";
import { measureCommand } from "./commands/measure.js";
import { visibilityCommand } from "./commands/visibility.js";
import { localCommand } from "./commands/local.js";
import { mentionsCommand } from "./commands/mentions.js";
import { signupCommand } from "./commands/signup.js";
import { tenantCommand } from "./commands/tenant.js";
import { onboardCommand } from "./commands/onboard.js";
import { doctorCommand } from "./commands/doctor.js";
import { updateCommand } from "./commands/update.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { serviceCommand } from "./commands/service.js";
import { telemetryCommand } from "./commands/telemetry.js";
import { recipesCommand } from "./commands/recipes.js";
import { defaultSeanHome } from "@agentsean/daemon";
import { recordEvent, VERSION } from "@agentsean/launch";

export async function run(argv: string[] = process.argv): Promise<number> {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(helpText(invokedAs(argv)));
    return 0;
  }
  if (args.version) {
    emit(
      args.json,
      { ok: true, name: "agentsean", version: VERSION },
      `agentsean ${VERSION}`,
    );
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
  const command = args.command ?? "onboard";
  recordEvent(args.home ?? defaultSeanHome(), { event: "command_used", command });

  switch (command) {
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
    case "keywords":
      return keywordsCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "mcp":
      return mcpCommand({
        json: args.json,
        home: args.home,
      });
    case "measure":
      return measureCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "visibility":
      return visibilityCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "local":
      return localCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "mentions":
      return mentionsCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "signup":
      return signupCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "tenant":
      return tenantCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "onboard":
      return onboardCommand({
        json: args.json,
        home: args.home,
        target: args.target,
        cms: args.cms,
        telemetry: args.telemetry,
        noStart: args.noStart,
        host: args.host,
        port: args.port,
      });
    case "doctor":
      return doctorCommand({ json: args.json, home: args.home, port: args.port });
    case "update":
      return updateCommand({ json: args.json, channel: args.channel ?? args.target });
    case "uninstall":
      return uninstallCommand({
        json: args.json,
        home: args.home,
        purge: args.purge,
      });
    case "service":
      return serviceCommand({
        json: args.json,
        home: args.home,
        target: args.target,
        yes: args.yes,
        host: args.host,
        port: args.port,
      });
    case "telemetry":
      return telemetryCommand({
        json: args.json,
        home: args.home,
        target: args.target,
      });
    case "recipes":
      return recipesCommand({ json: args.json, target: args.target });
    default:
      return 2;
  }
}
