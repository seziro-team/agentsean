import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@agentsean/db": path.join(root, "packages/db/src/index.ts"),
      "@agentsean/credentials": path.join(root, "packages/credentials/src/index.ts"),
      "@agentsean/daemon/main": path.join(root, "packages/daemon/src/main.ts"),
      "@agentsean/crawler": path.join(root, "packages/crawler/src/index.ts"),
      "@agentsean/analyzers": path.join(root, "packages/analyzers/src/index.ts"),
      "@agentsean/google": path.join(root, "packages/google/src/index.ts"),
      "@agentsean/actions": path.join(root, "packages/actions/src/index.ts"),
      "@agentsean/adapter-git": path.join(root, "packages/adapters/git/src/index.ts"),
      "@agentsean/adapter-wordpress": path.join(
        root,
        "packages/adapters/wordpress/src/index.ts",
      ),
      "@agentsean/adapter-shopify": path.join(
        root,
        "packages/adapters/shopify/src/index.ts",
      ),
      "@agentsean/adapter-cloudflare": path.join(
        root,
        "packages/adapters/cloudflare/src/index.ts",
      ),
      "@agentsean/adapter-saas": path.join(root, "packages/adapters/saas/src/index.ts"),
      "@agentsean/adapter-factory": path.join(
        root,
        "packages/adapters/factory/src/index.ts",
      ),
      "@agentsean/scheduler": path.join(root, "packages/scheduler/src/index.ts"),
      "@agentsean/playbooks": path.join(root, "packages/playbooks/src/index.ts"),
      "@agentsean/llm": path.join(root, "packages/llm/src/index.ts"),
      "@agentsean/content": path.join(root, "packages/content/src/index.ts"),
      "@agentsean/providers": path.join(root, "packages/providers/src/index.ts"),
      "@agentsean/keywords": path.join(root, "packages/keywords/src/index.ts"),
      "@agentsean/mcp": path.join(root, "packages/mcp/src/index.ts"),
      "@agentsean/measure": path.join(root, "packages/measure/src/index.ts"),
      "@agentsean/surfaces": path.join(root, "packages/surfaces/src/index.ts"),
      "@agentsean/hosted": path.join(root, "packages/hosted/src/index.ts"),
      "@agentsean/launch": path.join(root, "packages/launch/src/index.ts"),
      "@agentsean/ee": path.join(root, "packages/ee/src/index.ts"),
      "@agentsean/daemon": path.join(root, "packages/daemon/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/adapters/*/src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
