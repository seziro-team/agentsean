import fs from "node:fs";
import path from "node:path";

/**
 * First-run provisioning. npm v12 disables preinstall/install/postinstall
 * by default — nothing in this package runs at install time. Chromium is
 * not downloaded here; the crawler fetches it lazily on first JS render.
 */
export type InstallMethod = "npx" | "npm" | "curl" | "homebrew" | "docker" | "source";

export function provisionHome(home: string, method: InstallMethod = "npx"): string {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(home, 0o700);
    } catch {
      // best-effort
    }
  }
  const marker = path.join(home, "install-method");
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(marker, method + "\n", { mode: 0o600 });
  }
  return home;
}

export function readInstallMethod(home: string): InstallMethod {
  try {
    const raw = fs.readFileSync(path.join(home, "install-method"), "utf8").trim();
    if (
      raw === "npx" ||
      raw === "npm" ||
      raw === "curl" ||
      raw === "homebrew" ||
      raw === "docker" ||
      raw === "source"
    ) {
      return raw;
    }
  } catch {
    // first run
  }
  return "npx";
}

export function onboardedPath(home: string): string {
  return path.join(home, "onboarded");
}

export function isOnboarded(home: string): boolean {
  return fs.existsSync(onboardedPath(home));
}

export function markOnboarded(home: string): void {
  fs.writeFileSync(onboardedPath(home), new Date().toISOString() + "\n", { mode: 0o600 });
}

export function hasPostinstallScripts(scripts: Record<string, string> | undefined): boolean {
  if (!scripts) return false;
  return Boolean(scripts["preinstall"] || scripts["install"] || scripts["postinstall"]);
}
