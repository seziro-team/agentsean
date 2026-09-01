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
      "@agentsean/daemon": path.join(root, "packages/daemon/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});

