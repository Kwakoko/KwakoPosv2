import { describe, expect, it } from "vitest";
import { assessLiveProductionEvidence } from "@kwakopos2/domain";

const base = {
  certificationDecision: "PASS" as const,
  evidenceClass: "PRODUCTION",
  productionCertificationMode: true,
  gitSha: "0123456789abcdef0123456789abcdef01234567",
  containerDigest: `sha256:${"a".repeat(64)}`,
  cloudRunRevision: "kwakopos-prod-20260915",
  liveRevisionVerified: true,
  liveHealth: true,
  liveReadiness: true,
  liveIdentity: true,
  browserRuntime: true,
  syncConvergence: true,
  databaseReconciliation: true,
  tenantIsolation: true,
  observability: true,
  trafficMeasured: true,
  rollbackReady: true,
  postReleaseReconciliation: true,
};

describe("Step 26 live production evidence", () => {
  it("passes only with complete real production evidence", () => {
    expect(assessLiveProductionEvidence(base).decision).toBe("PASS");
  });

  it("blocks simulated evidence", () => {
    expect(assessLiveProductionEvidence({ ...base, evidenceClass: "SIMULATED" }).decision).toBe("BLOCK");
  });

  it("blocks missing live evidence", () => {
    expect(assessLiveProductionEvidence({ ...base, liveIdentity: false, browserRuntime: false, syncConvergence: false }).decision).toBe("BLOCK");
  });

  it("holds controlled evidence instead of calling it production", () => {
    expect(assessLiveProductionEvidence({ ...base, evidenceClass: "CONTROLLED", productionCertificationMode: false }).decision).toBe("HOLD");
  });
});
