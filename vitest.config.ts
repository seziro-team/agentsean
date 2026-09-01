import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@agentsean/db": path.join(root, "packages/db/src/index.ts"),
      "@agentsean/credentials": path.join(
        root,
        "packages/credentials/src/index.ts",
      ),
      "@agentsean/daemon/main": path.join(root, "packages/daemon/src/main.ts"),
      "@agentsean/crawler": path.join(root, "packages/crawler/src/index.ts"),
      "@agentsean/analyzers": path.join(root, "packages/analyzers/src/index.ts"),
      "@agentsean/google": path.join(root, "packages/google/src/index.ts"),
      "@agentsean/actions": path.join(root, "packages/actions/src/index.ts"),
      "@agentsean/adapter-git": path.join(
        root,
        "packages/adapters/git/src/index.ts",
      ),
      "@agentsean/scheduler": path.join(root, "packages/scheduler/src/index.ts"),
      "@agentsean/daemon": path.join(root, "packages/daemon/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/adapters/*/src/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});

