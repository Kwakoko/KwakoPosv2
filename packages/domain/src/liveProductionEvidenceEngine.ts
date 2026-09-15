import { LIVE_PRODUCTION_EVIDENCE_GOVERNANCE, isRealLiveEvidence } from "@kwakopos2/config";

export interface LiveProductionEvidenceInput {
  certificationDecision: "PASS" | "BLOCK" | "HOLD";
  evidenceClass: string;
  productionCertificationMode: boolean;
  gitSha: string;
  containerDigest: string;
  cloudRunRevision: string;
  liveRevisionVerified: boolean;
  liveHealth: boolean;
  liveReadiness: boolean;
  liveIdentity: boolean;
  browserRuntime: boolean;
  syncConvergence: boolean;
  databaseReconciliation: boolean;
  tenantIsolation: boolean;
  observability: boolean;
  trafficMeasured: boolean;
  rollbackReady: boolean;
  postReleaseReconciliation: boolean;
}

export interface LiveProductionDecision {
  decision: "PASS" | "BLOCK" | "HOLD";
  failedGates: string[];
  evidenceClass: string;
  reason: string;
}

export function assessLiveProductionEvidence(input: LiveProductionEvidenceInput): LiveProductionDecision {
  const failedGates: string[] = [];
  const required = [
    ["step25ProductionAuthority", input.certificationDecision === "PASS"],
    ["productionCertificationMode", input.productionCertificationMode],
    ["realEvidenceClass", isRealLiveEvidence(input.evidenceClass)],
    ["realGitSha", /^[0-9a-f]{40}$/i.test(input.gitSha)],
    ["realContainerDigest", /^sha256:[0-9a-f]{64}$/i.test(input.containerDigest)],
    ["realCloudRunRevision", /^kwakopos-[a-z0-9-]{1,58}$/i.test(input.cloudRunRevision)],
    ["liveRevisionVerified", input.liveRevisionVerified],
    ["liveHttpsHealth", input.liveHealth],
    ["liveHttpsReadiness", input.liveReadiness],
    ["liveHttpsIdentity", input.liveIdentity],
    ["browserRuntimeEvidence", input.browserRuntime],
    ["syncConvergenceEvidence", input.syncConvergence],
    ["databaseReconciliationEvidence", input.databaseReconciliation],
    ["tenantIsolationEvidence", input.tenantIsolation],
    ["observabilityEvidence", input.observability],
    ["progressiveTrafficEvidence", input.trafficMeasured],
    ["rollbackReadinessEvidence", input.rollbackReady],
    ["postReleaseReconciliation", input.postReleaseReconciliation],
  ] as const;
  for (const [gate, passed] of required) if (!passed) failedGates.push(gate);

  if (failedGates.length === 0) {
    return { decision: "PASS", failedGates, evidenceClass: input.evidenceClass, reason: "All live production evidence gates passed." };
  }

  const hold = !input.productionCertificationMode;
  return {
    decision: hold ? "HOLD" : "BLOCK",
    failedGates,
    evidenceClass: input.evidenceClass,
    reason: hold ? "Live production evidence is not yet available." : `Production release blocked by ${failedGates.length} failed live evidence gate(s).`,
  };
}

export function getLiveEvidenceAuthorityVersion(): string {
  return LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.version;
}
