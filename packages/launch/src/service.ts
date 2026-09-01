import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ServiceKind = "systemd-user" | "launchd" | "schtasks";

export function serviceKind(platform: string = process.platform): ServiceKind {
  if (platform === "darwin") return "launchd";
  if (platform === "win32") return "schtasks";
  return "systemd-user";
}

export type ServicePlan = {
  kind: ServiceKind;
  path: string;
  contents: string;
  enable: string[];
  disable: string[];
  summary: string;
};

export type ServicePlanInput = {
  home: string;
  nodePath: string;
  daemonEntry: string;
  host?: string | undefined;
  port?: number | undefined;
  platform?: string | undefined;
};

export function planService(input: ServicePlanInput): ServicePlan {
  const host = input.host ?? "127.0.0.1";
  const port = input.port ?? 7777;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      `Refusing to install a service that binds ${host}. The user unit is loopback-only. Use Tailscale Serve for remote access.`,
    );
  }
  const kind = serviceKind(input.platform ?? process.platform);
  const nodePath = input.nodePath;
  const entry = input.daemonEntry;
  const home = input.home;

  if (kind === "launchd") {
    const plist = path.join(os.homedir(), "Library/LaunchAgents/dev.agentsean.plist");
    const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>dev.agentsean</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(entry)}</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>${port}</string>
    <string>--home</string><string>${escapeXml(home)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SEAN_HOME</key><string>${escapeXml(home)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${escapeXml(path.join(home, "daemon.log"))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(home, "daemon.log"))}</string>
</dict>
</plist>
`;
    return {
      kind,
      path: plist,
      contents,
      enable: ["launchctl", "load", plist],
      disable: ["launchctl", "unload", plist],
      summary: `macOS LaunchAgent\n  write ${plist}\n  launchctl load ${plist}\n  bind 127.0.0.1:${port}\n  SEAN_HOME=${home}`,
    };
  }

  if (kind === "schtasks") {
    const xmlPath = path.join(home, "agentsean.schtasks.xml");
    const tr = `"${nodePath}" "${entry}" --host 127.0.0.1 --port ${port} --home "${home}"`;
    const contents = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Agent Sean</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(nodePath)}</Command>
      <Arguments>${escapeXml(`"${entry}" --host 127.0.0.1 --port ${port} --home "${home}"`)}</Arguments>
    </Exec>
  </Actions>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy></Settings>
</Task>
`;
    return {
      kind,
      path: xmlPath,
      contents,
      enable: ["schtasks", "/Create", "/TN", "AgentSean", "/XML", xmlPath, "/F"],
      disable: ["schtasks", "/Delete", "/TN", "AgentSean", "/F"],
      summary: `Windows Scheduled Task\n  write ${xmlPath}\n  schtasks /Create /TN AgentSean /XML ${xmlPath}\n  start at logon: ${tr}\n  bind 127.0.0.1:${port}`,
    };
  }

  const unitDir = path.join(os.homedir(), ".config/systemd/user");
  const unit = path.join(unitDir, "agentsean.service");
  const contents = `[Unit]
Description=Agent Sean — the SEO engineer that never sleeps
After=network.target

[Service]
Type=simple
ExecStart=${shellQuote(nodePath)} ${shellQuote(entry)} --host 127.0.0.1 --port ${port} --home ${shellQuote(home)}
Restart=on-failure
RestartSec=5
Environment=SEAN_HOME=${home}
WorkingDirectory=${home}

[Install]
WantedBy=default.target
`;
  return {
    kind,
    path: unit,
    contents,
    enable: ["systemctl", "--user", "enable", "--now", "agentsean.service"],
    disable: ["systemctl", "--user", "disable", "--now", "agentsean.service"],
    summary: `Linux systemd user unit\n  write ${unit}\n  systemctl --user enable --now agentsean.service\n  bind 127.0.0.1:${port}\n  SEAN_HOME=${home}`,
  };
}

export function writeService(plan: ServicePlan): void {
  fs.mkdirSync(path.dirname(plan.path), { recursive: true, mode: 0o755 });
  fs.writeFileSync(plan.path, plan.contents, { mode: 0o644 });
}

export function removeServiceFile(plan: ServicePlan): void {
  if (fs.existsSync(plan.path)) fs.unlinkSync(plan.path);
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(s)) return s;
  return `'${s.replaceAll("'", `'\\''`)}'`;
}
