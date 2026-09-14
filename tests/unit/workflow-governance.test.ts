import { describe, expect, it } from "vitest";
import { KWAKOKO_WORKFLOW_GOVERNANCE } from "../../packages/config/src/workflowGovernance.js";

describe("Kwakoko workflow governance", () => {
  it("defines the complete experience lifecycle", () => {
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.layers).toEqual([
      "ui", "action", "route", "service", "persistence", "permission", "outcome",
    ]);
  });

  it("requires interactive controls to have action intent", () => {
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.actionRules.interactiveControlsRequireIntent).toBe(true);
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.actionRules.navigationControlsRequireKnownRoute).toBe(true);
  });

  it("requires mutation persistence and offline outbox capability", () => {
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.persistenceRules.mutationActionsMustHaveServerOrAuthoritativeLocalPersistencePath).toBe(true);
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.persistenceRules.offlineFirstMutationsMustBeOutboxCapable).toBe(true);
  });

  it("protects privileged operations", () => {
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.permissionRules.privilegedActionsRequirePermissionBoundary).toBe(true);
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.permissionRules.superAdminActionsRequirePlatformContext).toBe(true);
  });

  it("keeps unresolved findings visible rather than suppressing them", () => {
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.certification.unresolvedHeuristicFindingsRemainVisible).toBe(true);
  });

  it("defines the Step 9 release certificate", () => {
    expect(KWAKOKO_WORKFLOW_GOVERNANCE.certification.certificate).toBe("KWAKOKO-WORKFLOW-CERTIFICATE-v1.0");
  });
});
