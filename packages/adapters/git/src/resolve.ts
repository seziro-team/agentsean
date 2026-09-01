import fs from "node:fs";
import path from "node:path";

const PAGE_FILES = [
  "page.tsx",
  "page.jsx",
  "page.ts",
  "page.js",
  "index.tsx",
  "index.jsx",
  "index.ts",
  "index.js",
  "index.mdx",
  "index.md",
  "index.astro",
  "index.html",
];

function exists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function urlPath(pageUrl: string): string {
  const u = new URL(pageUrl);
  return u.pathname.replace(/\/+$/, "") || "/";
}

function candidatesFor(repoRoot: string, pathname: string): string[] {
  const rel = pathname === "/" ? "" : pathname.replace(/^\//, "");
  const segs = rel ? rel.split("/") : [];
  const out: string[] = [];
  const roots = ["", "src"];
  for (const src of roots) {
    const app = src ? path.join(repoRoot, src, "app") : path.join(repoRoot, "app");
    const pages = src ? path.join(repoRoot, src, "pages") : path.join(repoRoot, "pages");
    if (pathname === "/") {
      for (const f of PAGE_FILES) {
        out.push(path.join(app, f));
        out.push(path.join(pages, f));
      }
      out.push(path.join(repoRoot, "src/pages/index.astro"));
      out.push(path.join(repoRoot, "content/_index.md"));
      out.push(path.join(repoRoot, "index.md"));
      out.push(path.join(repoRoot, "index.html"));
    } else {
      for (const f of PAGE_FILES) {
        out.push(path.join(app, ...segs, f));
        out.push(path.join(pages, ...segs) + path.extname(f === "page.tsx" ? "" : ""));
        out.push(path.join(pages, `${rel}.tsx`));
        out.push(path.join(pages, `${rel}.jsx`));
        out.push(path.join(pages, `${rel}.mdx`));
        out.push(path.join(pages, `${rel}.md`));
        out.push(path.join(pages, ...segs, "index.tsx"));
      }
      out.push(path.join(repoRoot, "src/pages", `${rel}.astro`));
      out.push(path.join(repoRoot, "content", `${rel}.md`));
      out.push(path.join(repoRoot, `${rel}.md`));
    }
  }
  return out;
}

export function resolvePageFile(repoRoot: string, pageUrl: string): string | null {
  const pathname = urlPath(pageUrl);
  for (const file of candidatesFor(repoRoot, pathname)) {
    if (exists(file)) return file;
  }
  return null;
}

export function detectFramework(repoRoot: string): "next" | "astro" | "hugo" | "jekyll" | "docusaurus" | "unknown" {
  const pkgPath = path.join(repoRoot, "package.json");
  if (exists(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["next"]) return "next";
      if (deps["astro"]) return "astro";
      if (deps["@docusaurus/core"]) return "docusaurus";
    } catch {
      /* ignore */
    }
  }
  if (exists(path.join(repoRoot, "hugo.toml")) || exists(path.join(repoRoot, "config.toml"))) {
    return "hugo";
  }
  if (exists(path.join(repoRoot, "_config.yml"))) return "jekyll";
  if (fs.existsSync(path.join(repoRoot, "app")) || fs.existsSync(path.join(repoRoot, "src/app"))) {
    return "next";
  }
  return "unknown";
}
