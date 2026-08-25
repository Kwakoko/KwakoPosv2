import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@kwakopos2/config": path.resolve(__dirname, "./packages/config/src/index.ts"),
      "@kwakopos2/contracts": path.resolve(__dirname, "./packages/contracts/src/index.ts"),
      "@kwakopos2/domain": path.resolve(__dirname, "./packages/domain/src/index.ts"),
      "@kwakopos2/database": path.resolve(__dirname, "./packages/database/src/index.ts"),
      "@kwakopos2/auth": path.resolve(__dirname, "./packages/auth/src/index.ts"),
      "@kwakopos2/sync": path.resolve(__dirname, "./packages/sync/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "**/*.js"],
  },
});
