import { describe, it, expect } from "vitest";
import {
  ReleaseStateMachine,
  ReleaseLineage,
  CanaryController,
  RollbackController,
  ProductionAuditStream,
  ReleaseGovernancePolicy,
  RunbookEngine,
} from "../../packages/observability/src/index.js";

describe("KwakoPos Continuous Production Operations & Release Governance Suite", () => {
  describe("1. Release State Machine Lifecycle", () => {
    it("follows strict lifecycle from DRAFT to RELEASE_STABLE", () => {
      let lineage: ReleaseLineage = {
        releaseId: "REL-TEST-01",
        appVersion: "2.1.0",
        gitTag: "v2.1.0",
        gitSha: "442fe44454192d8fc03a35629acbf9fb809a954e",
        containerDigest: "sha256:dcaa86bbc8c37ebb4606c3fd49ffa5436e96a9405ca00851768031a7cd4a1761",
        cloudRunRevision: "kwakopos-production-service-00036-qux",
        state: "DRAFT",
        trafficPercentage: 0,
        certificationStatus: "PENDING",
        healthStatus: "GREEN",
        createdAt: new Date().toISOString(),
        rollbackEligible: true,
        stateHistory: [{ state: "DRAFT", timestamp: new Date().toISOString() }],
      };

      lineage = ReleaseStateMachine.transition(lineage, "VERSIONED");
      expect(lineage.state).toBe("VERSIONED");

      lineage = ReleaseStateMachine.transition(lineage, "BUILT");
      expect(lineage.state).toBe("BUILT");

      lineage = ReleaseStateMachine.transition(lineage, "CANDIDATE_DEPLOYED");
      expect(lineage.state).toBe("CANDIDATE_DEPLOYED");

      lineage = ReleaseStateMachine.transition(lineage, "CERTIFICATION_PENDING");
      expect(lineage.state).toBe("CERTIFICATION_PENDING");

      lineage = ReleaseStateMachine.transition(lineage, "CERTIFIED");
      expect(lineage.state).toBe("CERTIFIED");

      lineage = ReleaseStateMachine.transition(lineage, "CANARY");
      expect(lineage.state).toBe("CANARY");

      lineage = ReleaseStateMachine.transition(lineage, "CANARY_HEALTHY");
      expect(lineage.state).toBe("CANARY_HEALTHY");

      lineage = ReleaseStateMachine.transition(lineage, "PRODUCTION_PROMOTION");
      expect(lineage.state).toBe("PRODUCTION_PROMOTION");
      expect(lineage.trafficPercentage).toBe(100);

      lineage = ReleaseStateMachine.transition(lineage, "LIVE");
      expect(lineage.state).toBe("LIVE");

      lineage = ReleaseStateMachine.transition(lineage, "MONITORING");
      expect(lineage.state).toBe("MONITORING");

      lineage = ReleaseStateMachine.transition(lineage, "RELEASE_HEALTHY");
      expect(lineage.state).toBe("RELEASE_HEALTHY");

      lineage = ReleaseStateMachine.transition(lineage, "RELEASE_STABLE");
      expect(lineage.state).toBe("RELEASE_STABLE");
      expect(lineage.stableAt).toBeDefined();
    });

    it("rejects invalid state skips", () => {
      const lineage: ReleaseLineage = {
        releaseId: "REL-TEST-02",
        appVersion: "2.1.0",
        gitTag: "v2.1.0",
        gitSha: "442fe44454192d8fc03a35629acbf9fb809a954e",
        containerDigest: "sha256:dcaa86bbc8c37ebb4606c3fd49ffa5436e96a9405ca00851768031a7cd4a1761",
        cloudRunRevision: "kwakopos-production-service-00036-qux",
        state: "DRAFT",
        trafficPercentage: 0,
        certificationStatus: "PENDING",
        healthStatus: "GREEN",
        createdAt: new Date().toISOString(),
        rollbackEligible: true,
        stateHistory: [],
      };

      expect(() => ReleaseStateMachine.transition(lineage, "LIVE")).toThrow(
        "INVALID_RELEASE_STATE_TRANSITION"
      );
    });
  });

  describe("2. Canary Progression & Metric Evaluation", () => {
    it("progresses through traffic stages and blocks on data integrity anomalies", () => {
      const canary = new CanaryController();
      expect(canary.getCurrentStage().trafficPercentage).toBe(0);

      const adv1 = canary.advanceStage();
      expect(adv1.advanced).toBe(true);
      expect(canary.getCurrentStage().trafficPercentage).toBe(1);

      // Evaluate stage with inventory anomaly
      const evalFail = canary.evaluateStageHealth({
        errorRate: 0.001,
        p95LatencyMs: 40,
        syncFailureRate: 0,
        inventoryAnomalies: 2, // VIOLATION
        syntheticFailures: 0,
      });
      expect(evalFail.passed).toBe(false);
      expect(evalFail.reason).toContain("CRITICAL_DATA_INTEGRITY");

      // Advance should be blocked
      const advBlocked = canary.advanceStage();
      expect(advBlocked.advanced).toBe(false);

      // Now pass evaluation
      const evalPass = canary.evaluateStageHealth({
        errorRate: 0.001,
        p95LatencyMs: 40,
        syncFailureRate: 0,
        inventoryAnomalies: 0,
        syntheticFailures: 0,
      });
      expect(evalPass.passed).toBe(true);

      const adv2 = canary.advanceStage();
      expect(adv2.advanced).toBe(true);
      expect(canary.getCurrentStage().trafficPercentage).toBe(5);
    });
  });

  describe("3. Safe Automated Rollback Controller", () => {
    it("validates schema and sync compatibility before allowing rollback", async () => {
      const result = await RollbackController.executeSafeRollback({
        failedRelease: {
          id: "REL-FAILED-01",
          appVersion: "2.1.0",
          cloudRunRevision: "revision-failed-001",
          databaseSchemaVersion: 2,
          syncProtocolVersion: 2,
          pwaSchemaVersion: 3,
        },
        targetStableRelease: {
          id: "REL-STABLE-01",
          appVersion: "2.0.0",
          cloudRunRevision: "revision-stable-000",
          databaseSchemaVersion: 2,
          syncProtocolVersion: 2,
          pwaSchemaVersion: 3,
        },
      });

      expect(result.success).toBe(true);
      expect(result.compatibilityCheck.isCompatible).toBe(true);
      expect(result.targetRevision).toBe("revision-stable-000");
    });

    it("blocks rollback if target has incompatible sync protocol", async () => {
      const result = await RollbackController.executeSafeRollback({
        failedRelease: {
          id: "REL-FAILED-02",
          appVersion: "3.0.0",
          cloudRunRevision: "revision-failed-002",
          databaseSchemaVersion: 3,
          syncProtocolVersion: 3,
          pwaSchemaVersion: 4,
        },
        targetStableRelease: {
          id: "REL-STABLE-01",
          appVersion: "2.0.0",
          cloudRunRevision: "revision-stable-000",
          databaseSchemaVersion: 2,
          syncProtocolVersion: 2, // PROTOCOL MISMATCH
          pwaSchemaVersion: 3,
        },
      });

      expect(result.success).toBe(false);
      expect(result.compatibilityCheck.isCompatible).toBe(false);
      expect(result.compatibilityCheck.reasons.length).toBeGreaterThan(0);
    });
  });

  describe("4. Operational Audit Stream & Governance Policies", () => {
    it("appends and filters operational audit events", () => {
      ProductionAuditStream.record({
        eventType: "TRAFFIC_PROMOTED",
        actor: { role: "SUPER_ADMIN", email: "admin@kwakopos.com" },
        releaseContext: {
          appVersion: "2.1.0",
          cloudRunRevision: "kwakopos-production-service-00036-qux",
          environment: "production",
        },
        details: { trafficPercentage: 100 },
      });

      const events = ProductionAuditStream.filterEvents({ eventType: "TRAFFIC_PROMOTED" });
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].eventType).toBe("TRAFFIC_PROMOTED");
      expect(events[0].actor.email).toBe("admin@kwakopos.com");
    });

    it("enforces release freeze states", () => {
      ReleaseGovernancePolicy.setFreezeState("NORMAL");
      expect(ReleaseGovernancePolicy.canDeployRelease(false).allowed).toBe(true);

      ReleaseGovernancePolicy.setFreezeState("RELEASE_FREEZE", "Quarter-end freeze");
      expect(ReleaseGovernancePolicy.canDeployRelease(false).allowed).toBe(false);
      expect(ReleaseGovernancePolicy.canDeployRelease(true).allowed).toBe(true); // Emergency allowed

      ReleaseGovernancePolicy.setFreezeState("FULL_LOCKDOWN", "Major security incident");
      expect(ReleaseGovernancePolicy.canDeployRelease(true).allowed).toBe(false); // Even emergency blocked

      // Reset
      ReleaseGovernancePolicy.setFreezeState("NORMAL");
    });

    it("serves all 14 interactive diagnostic runbooks", () => {
      const runbooks = RunbookEngine.getAllRunbooks();
      expect(runbooks.length).toBe(14);
      expect(runbooks.some((r) => r.id === "RB-004-STOCK-DIVERGENCE")).toBe(true);
      expect(runbooks.some((r) => r.id === "RB-010-ROLLBACK-PROCEDURE")).toBe(true);
    });
  });
});