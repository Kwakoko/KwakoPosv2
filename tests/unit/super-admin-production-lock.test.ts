import { describe, expect, it } from "vitest";
import { runSuperAdminPlatformCertification } from "../../scripts/certification/super-admin-platform-certification-engine.js";

describe("Super Admin Production Lock", () => {
  it("passes the repository-backed Super Admin control-plane certification", () => {
    const result = runSuperAdminPlatformCertification();
    expect(result.failedPillars).toBe(0);
    expect(result.successRatePct).toBe(100);
  });

  it("contains an independent fail-closed lock contract", async () => {
    const mod = await import("../../scripts/certification/super-admin-production-lock.ts");
    const result = mod.runSuperAdminProductionLock(process.cwd());
    expect(result.verdict).toBe("PASS");
    expect(result.failures).toEqual([]);
  });
});
