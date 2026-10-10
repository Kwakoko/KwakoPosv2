import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

const envPath = path.resolve(import.meta.dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] ??= val;
      }
    }
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@kwakopos2/config": path.resolve(import.meta.dirname, "./packages/config/src/index.ts"),
      "@kwakopos2/contracts": path.resolve(import.meta.dirname, "./packages/contracts/src/index.ts"),
      "@kwakopos2/domain": path.resolve(import.meta.dirname, "./packages/domain/src/index.ts"),
      "@kwakopos2/database": path.resolve(import.meta.dirname, "./packages/database/src/index.ts"),
      "@kwakopos2/auth": path.resolve(import.meta.dirname, "./packages/auth/src/index.ts"),
      "@kwakopos2/sync": path.resolve(import.meta.dirname, "./packages/sync/src/index.ts"),
      "@kwakopos2/observability": path.resolve(import.meta.dirname, "./packages/observability/src/index.ts"),
    },
  },
  test: {
    env: { KWAKOPOS_TEST_BYPASS_LEGAL_GATE: "true" },
    globals: true,
    environment: "node",
    setupFiles: [path.resolve(import.meta.dirname, "tests/setup/indexeddb.ts")],
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "**/*.js"],
    pool: "forks",
    testTimeout: 20000,
  },
});
