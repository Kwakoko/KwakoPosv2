import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PLATFORM_SERVICES_PRODUCTION_LOCKS } from "../../packages/config/src/platformServicesProductionLock.js";

describe("Platform Services Production Lock v1", () => {
  it("defines all eleven C01-C11 services", () => {
    expect(PLATFORM_SERVICES_PRODUCTION_LOCKS).toHaveLength(11);
    expect(PLATFORM_SERVICES_PRODUCTION_LOCKS.map((service) => service.id)).toEqual([
      "C01","C02","C03","C04","C05","C06","C07","C08","C09","C10","C11",
    ]);
  });

  it("executes the fail-closed production lock successfully", () => {
    execFileSync(process.execPath, [path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs"), "scripts/certification/platform-services-production-lock.ts"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  });

  it("keeps the production lock explicitly wired into CI, candidate, and exact-main release gates", () => {
    for (const workflow of [
      ".github/workflows/ci.yml",
      ".github/workflows/production-certification.yml",
      ".github/workflows/production-release-exact-main.yml",
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), workflow), "utf8");
      expect(source).toContain("npm run certify:platform-services-lock");
    }
  });
});
