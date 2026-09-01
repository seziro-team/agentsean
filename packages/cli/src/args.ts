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
  | "content"
  | "keywords"
  | "mcp"
  | "measure"
  | "visibility"
  | "local"
  | "mentions"
  | "signup"
  | "tenant"
  | "onboard"
  | "doctor"
  | "update"
  | "uninstall"
  | "service"
  | "telemetry"
  | "recipes";

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
  yes: boolean;
  cms: string | undefined;
  channel: string | undefined;
  purge: boolean;
  noStart: boolean;
  noService: boolean;
  telemetry: string | undefined;
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
  "keywords",
  "mcp",
  "measure",
  "visibility",
  "local",
  "mentions",
  "signup",
  "tenant",
  "onboard",
  "doctor",
  "update",
  "uninstall",
  "service",
  "telemetry",
  "recipes",
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
    yes: false,
    cms: undefined,
    channel: undefined,
    purge: false,
    noStart: false,
    noService: false,
    telemetry: undefined,
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
    if (a === "--yes" || a === "-y") {
      args.yes = true;
      continue;
    }
    if (a === "--cms") {
      args.cms = rest[++i];
      continue;
    }
    if (a === "--channel") {
      args.channel = rest[++i];
      continue;
    }
    if (a === "--purge") {
      args.purge = true;
      continue;
    }
    if (a === "--no-start") {
      args.noStart = true;
      continue;
    }
    if (a === "--no-service") {
      args.noService = true;
      continue;
    }
    if (a === "--telemetry") {
      args.telemetry = rest[++i];
      continue;
    }
    if (a === "--url") {
      args.target = rest[++i];
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
    if (args.command === "keywords" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "mcp" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "measure" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "visibility" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "local" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "mentions" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "signup" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (args.command === "tenant" && args.target === undefined) {
      args.target = a;
      continue;
    }
    if (
      (args.command === "onboard" ||
        args.command === "service" ||
        args.command === "telemetry" ||
        args.command === "recipes" ||
        args.command === "update" ||
        args.command === "uninstall" ||
        args.command === "doctor") &&
      args.target === undefined
    ) {
      args.target = a;
      continue;
    }
    args.errors.push(`unexpected argument ${a}`);
  }

  return args;
}

export const HELP = `Agent Sean — the SEO engineer that never sleeps.

Every SEO tool tells you what's wrong. Agent Sean fixes it.

Usage:
  sean                    # first run: onboard, then start
  sean onboard [url] [--cms wordpress|shopify|git|cloudflare|other] [--telemetry on|off] [--no-start] [--json]
  sean doctor [--json]
  sean update [--channel stable|extended-stable|dev] [--json]
  sean service [status|install|uninstall] [--json]
  sean uninstall [--purge] [--json]
  sean telemetry [status|log|on|off] [--json]
  sean recipes [id] [--json]
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
  sean keywords [origin] [--json]
  sean mcp [--json]
  sean measure [origin] [--json]
  sean visibility [origin] [--json]
  sean local [origin] [--json]
  sean mentions [origin] [--json]
  sean signup [plan] [--json]
  sean tenant [tenantId] [--json]
  sean connect dataforseo --api-key login:password
  sean connect bing --api-key KEY
  sean connect openpagerank --api-key KEY
  sean connect wordpress --api-key USER:APP_PASSWORD [origin]
  sean connect shopify --api-key shpat_… [shop]
  sean connect cloudflare [origin]

Every command accepts --json. npx agentsean provisions on first run — there is
no postinstall (npm 12+ disables those by default). The daemon binds 127.0.0.1
only and refuses to start off-loopback without auth. Audit crawls a URL with
zero credentials.
Connect Google opens the local dashboard; the hosted broker never talks to
this machine. --byo uses your own Cloud project (publish to Production).
Apply plans title-tag fixes, validates them, and opens a Git PR. Revert
restores the shadow-ledger snapshot. Freeze writes HALT and stops every write
across every site; it survives restart. Content identifies a decaying page from
GSC clicks, rewrites it, runs PublishGate, and publishes via the Git adapter.
New pages are capped at 2/day/site and the cap is not overridable. Keywords
builds opportunities and clusters from GSC + Bing with zero paid keys; a
DataForSEO key upgrades rank tracking in place. sean mcp is a stdio MCP server.
sean measure labels every claim with an evidence tier and will not claim
causation it cannot support. Platform adapters write the same title-tag Action
to WordPress, Shopify, Git, or a Cloudflare edge overlay, then re-fetch live
HTML to verify. The edge worker never branches on user-agent. Hosted Cloud
Starter is $9/mo (1 site, BYOK); Agency is $249/mo (25–50 sites). Self-host is
$0 with everything. Hosted never stores CMS write credentials — pair a
customer-side connector. Sean never scrapes Google.
`;
