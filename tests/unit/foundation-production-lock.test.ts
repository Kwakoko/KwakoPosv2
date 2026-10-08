import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Foundation production lock contract", () => {
  it("uses the active full-system evidence engine for the production campaign", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["certify:campaign"]).toBe("tsx scripts/certification/runFullSystemCertification.ts");
    expect(read("scripts/certification/runFullSystemCertification.ts")).toContain("runFullSystemCertificationEngine");
    expect(read("scripts/certification/full-system-certification-engine.ts")).not.toContain("Array.from({ length:");
  });

  it("closes every A01-A12 pillar through one fail-closed lock", () => {
    const source = read("scripts/certification/foundation-production-lock.ts");
    for (const pillar of [
      "A01_RELEASE_IDENTITY","A02_AUTH_TRANSPORT","A03_RBAC_TENANT_ISOLATION",
      "A04_NAVIGATION","A05_PERSISTENCE_INDEXEDDB","A06_SYNC_CONVERGENCE",
      "A07_CONFLICT_CENTER","A08_DASHBOARD_ANALYTICS","A09_RUNTIME","A10_SECURITY",
      "A11_RELEASE_AUTHORITY","A12_GOVERNANCE",
    ]) {
      expect(source).toContain(pillar);
    }
    expect(source).toContain("FOUNDATION PRODUCTION LOCK: PASS");
  });

  it("gates CI, candidate, and exact-main production certification", () => {
    expect(read(".github/workflows/ci.yml")).toContain("npm run certify:foundation");
    expect(read(".github/workflows/production-certification.yml")).toContain("npm run certify:foundation");
    expect(read(".github/workflows/production-release-exact-main.yml")).toContain("npm run certify:foundation");
  });
});
