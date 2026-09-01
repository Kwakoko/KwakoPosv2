import { describe, it, expect } from "vitest";
import { AutonomousOperationsEngine } from "@kwakopos2/domain";
import { runAutonomousOperationsCertification } from "../../scripts/certification/autonomous-operations-certification-engine.js";

describe("Phase 22 — Autonomous Operations (KAOF) Test Suite", () => {
  const engine = new AutonomousOperationsEngine();

  it("should evaluate autonomous requests through 4-level maturity model and deterministic policy engine", () => {
    const req = engine.detectAndDiagnose({
      tenantId: "TENANT-001",
      branchId: "BRANCH-01",
      targetService: "CloudRunWorker",
      failureClass: "TransientTimeout",
      proposedRemediation: "Restart Worker Instance",
      maturityLevel: "LEVEL_3_GUARDED_AUTOMATION",
      blastRadiusScope: "SINGLE_INSTANCE",
      rollbackAvailable: true,
    });
    expect(req.requestId.startsWith("AUTO-REQ-")).toBe(true);

    const policy = engine.evaluatePolicy(req.requestId, { maxHourlyActions: 50, currentHourlyActions: 5, maxBlastScopeAllowed: "SINGLE_TENANT" });
    expect(policy.approvedForExecution).toBe(true);
  });

  it("should execute remediation via Action Gateway and verify independent health before declaring success", () => {
    const req = engine.detectAndDiagnose({
      tenantId: "TENANT-001",
      branchId: "BRANCH-01",
      targetService: "SyncQueueWorker",
      failureClass: "QueueStall",
      proposedRemediation: "Resume Queue & Rebalance",
      maturityLevel: "LEVEL_4_AUTONOMOUS_OPERATIONS",
      blastRadiusScope: "SINGLE_SERVICE",
      rollbackAvailable: true,
    });

    const res = engine.executeActionGateway(
      req.requestId,
      () => ({ success: true, details: "Queue resumed successfully." }),
      () => ({ healthy: true, details: "Independent verification confirmed 100% queue health." })
    );

    expect(res.verification.isVerifiedHealthy).toBe(true);
    expect(res.ledgerEntry.evidenceHash.startsWith("HASH-")).toBe(true);
  });

  it("should trip circuit breaker and block repeated failing automations", () => {
    const freshEngine = new AutonomousOperationsEngine();
    const req = freshEngine.detectAndDiagnose({
      tenantId: "TENANT-001",
      branchId: "BRANCH-01",
      targetService: "FailingService",
      failureClass: "HardOutage",
      proposedRemediation: "Restart",
      maturityLevel: "LEVEL_3_GUARDED_AUTOMATION",
      blastRadiusScope: "SINGLE_SERVICE",
      rollbackAvailable: true,
    });

    // Execute 3 times failing
    freshEngine.executeActionGateway(req.requestId, () => ({ success: false, details: "Failed" }), () => ({ healthy: false, details: "Unhealthy" }));
    freshEngine.executeActionGateway(req.requestId, () => ({ success: false, details: "Failed" }), () => ({ healthy: false, details: "Unhealthy" }));
    freshEngine.executeActionGateway(req.requestId, () => ({ success: false, details: "Failed" }), () => ({ healthy: false, details: "Unhealthy" }));

    const policy = freshEngine.evaluatePolicy(req.requestId, { maxHourlyActions: 50, currentHourlyActions: 5, maxBlastScopeAllowed: "SINGLE_TENANT" });
    expect(policy.circuitBreakerTripped).toBe(true);
    expect(policy.approvedForExecution).toBe(false);
  });

  it("should block autonomous actions when Emergency Kill Switch is triggered", () => {
    const freshEngine = new AutonomousOperationsEngine();
    freshEngine.triggerKillSwitch("GLOBAL", "ALL_SERVICES");

    expect(() => {
      freshEngine.detectAndDiagnose({
        tenantId: "TENANT-001",
        branchId: "BRANCH-01",
        targetService: "Worker",
        failureClass: "Timeout",
        proposedRemediation: "Restart",
        maturityLevel: "LEVEL_3_GUARDED_AUTOMATION",
        blastRadiusScope: "SINGLE_INSTANCE",
        rollbackAvailable: true,
      });
    }).toThrow("Emergency Autonomous Kill Switch is ACTIVE.");
  });

  it("should pass 100% of the 56-Pillar Autonomous Operations certification campaign", () => {
    const cert = runAutonomousOperationsCertification();
    expect(cert.totalPillars).toBe(56);
    expect(cert.passedPillars).toBe(56);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
