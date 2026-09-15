import fs from "node:fs";
import path from "node:path";
import { AI_OPERATING_LAYER_GOVERNANCE as G } from "@kwakopos2/config";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const checks: Array<[string, boolean]> = [];
const has = (p: string, patterns: string[]) => {
  const s = read(p);
  return patterns.every((x) => s.includes(x));
};
const pass = (name: string, ok: boolean) => { checks.push([name, ok]); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };

const authorities = [
  "packages/contracts/src/aiOperatingLayerContracts.ts", "packages/contracts/src/aiNativeContracts.ts",
  "packages/domain/src/aiOperatingLayerEngine.ts", "packages/domain/src/aiNativeEngine.ts",
  "apps/api/src/services/aiOperatingLayerService.ts", "scripts/certification/ai-operating-layer-certification-engine.ts",
  "tests/unit/ai-operating-layer.test.ts", "packages/config/src/aiAgentGovernance.ts",
  "packages/config/src/securityTrustGovernance.ts", "packages/config/src/privacyDataGovernance.ts",
  "packages/config/src/dataLifecycleDrGovernance.ts", "packages/config/src/biAnalyticsGovernance.ts",
];
for (const p of authorities) pass(`authority:${p}`, fs.existsSync(path.join(root, p)));

pass("governance-version", G.version === "1.0.0");
pass("autonomy-policy", Object.values(G.autonomy).length === 5 && G.autonomy.restricted === "PROHIBITED");
pass("tenant-boundary", has("packages/domain/src/aiNativeEngine.ts", ["tenantId", "branchId", "TenantIsolationPolicy"]));
pass("evidence-boundary", has("packages/contracts/src/aiOperatingLayerContracts.ts", ["evidence", "confidenceScore"]));
pass("human-approval", has("packages/domain/src/aiNativeEngine.ts", ["PENDING_HUMAN_APPROVAL", "requiresHumanApproval", "approval.approved"]));
pass("restricted-actions", has("packages/domain/src/aiNativeEngine.ts", ["LEVEL_4_RESTRICTED", "PROHIBITED", "blocked execution"]));
pass("tool-permissions", has("packages/contracts/src/aiOperatingLayerContracts.ts", ["permission", "riskLevel", "owner"]));
pass("kill-switch", has("packages/domain/src/aiOperatingLayerEngine.ts", ["killSwitchStatus", "toggleKillSwitch"]));
pass("action-ledger", has("packages/domain/src/aiNativeEngine.ts", ["ledgerEntries", "executionVerified"]));
pass("cost-governance", has("packages/domain/src/aiNativeEngine.ts", ["monthlyTokenBudget", "monthlyUsdBudget", "isThrottled"]));
pass("semantic-boundary", has("packages/domain/src/aiOperatingLayerEngine.ts", ["globalBiAnalyticsEngine", "executeSemanticQuery"]));
pass("prompt-injection-boundary", G.requiredControls.promptInjectionBoundary === true);
pass("data-minimization", has("packages/config/src/privacyDataGovernance.ts", ["dataMinimization"]));
pass("rollback-verification", G.requiredControls.rollbackVerification === true && fs.existsSync(path.join(root, "packages/config/src/dataLifecycleDrGovernance.ts")));
pass("provider-boundary", G.requiredControls.modelProviderBoundary === true);
pass("truthful-claims", has("packages/config/src/aiAgentGovernance.ts", ["AI-generated customer-facing claims", "supportable"]));
pass("prior-convergence", G.priorAuthorities.every((p) => fs.existsSync(path.join(root, `packages/config/src/${p}.ts`))));
pass("75-pillar-certification", has("scripts/certification/ai-operating-layer-certification-engine.ts", ["75", "AI-75"]));
pass("runtime-tests", fs.existsSync(path.join(root, "tests/unit/ai-operating-layer.test.ts")));
pass("service-boundary", has("apps/api/src/services/aiOperatingLayerService.ts", ["globalAiOperatingLayerEngine", "executeAction"]));
pass("certificate-id", G.certificateId === "KWAKOKO-AI-OPERATING-LAYER-CERTIFICATE-v1.0");
pass("fail-closed", G.requiredControls.restrictedActionsProhibited && G.requiredControls.humanApprovalForHighImpact && G.requiredControls.killSwitch);

const failed = checks.filter(([, ok]) => !ok).length;
const certPath = path.join(root, "artifacts", "governance", "ai-operating-layer-certificate.json");
fs.mkdirSync(path.dirname(certPath), { recursive: true });
fs.writeFileSync(certPath, JSON.stringify({ certificateId: G.certificateId, version: G.version, passed: failed === 0, checks: checks.length, failures: failed, evidenceBoundary: "Repository governance and controlled certification; not proof of external model/vendor production outcomes." }, null, 2));
console.log(`Kwakoko AI Operating Layer Governance: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
