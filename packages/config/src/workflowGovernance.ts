export const KWAKOKO_WORKFLOW_GOVERNANCE = {
  version: "1.0.0",
  layers: [
    "ui",
    "action",
    "route",
    "service",
    "persistence",
    "permission",
    "outcome",
  ],
  lifecycle: [
    "DISCOVERABLE",
    "WIRED",
    "AUTHORIZED",
    "EXECUTABLE",
    "PERSISTED",
    "VERIFIABLE",
  ],
  actionRules: {
    interactiveControlsRequireIntent: true,
    iconOnlyControlsRequireAccessibleName: true,
    mutationControlsRequireStableActionId: true,
    navigationControlsRequireKnownRoute: true,
  },
  routeRules: {
    sourceOfTruth: "apps/web/src/App.tsx",
    unknownRoutesAreErrors: true,
    standaloneRoutesRequireExplicitRegistration: true,
  },
  persistenceRules: {
    mutationActionsMustHaveServerOrAuthoritativeLocalPersistencePath: true,
    offlineFirstMutationsMustBeOutboxCapable: true,
    destructiveMutationsMustBeAuditable: true,
  },
  permissionRules: {
    privilegedActionsRequirePermissionBoundary: true,
    superAdminActionsRequirePlatformContext: true,
  },
  certification: {
    certificate: "KWAKOKO-WORKFLOW-CERTIFICATE-v1.0",
    explicitViolationsMustBeZero: true,
    unresolvedHeuristicFindingsRemainVisible: true,
  },
} as const;

export type KwakokoWorkflowGovernance = typeof KWAKOKO_WORKFLOW_GOVERNANCE;

export function getCanonicalWorkflowGovernance(): KwakokoWorkflowGovernance {
  return KWAKOKO_WORKFLOW_GOVERNANCE;
}
