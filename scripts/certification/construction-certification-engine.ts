import * as fs from "fs";
import * as path from "path";
import { globalConstructionService } from "../../apps/api/src/services/constructionService.js";
import { globalConstructionEngine } from "@kwakopos2/domain";

export interface DomainCertificationResult {
  timestamp: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  overallPassed: boolean;
  checks: Array<{ id: string; passed: boolean; details: string }>;
}

export async function runConstructionCertification(): Promise<DomainCertificationResult> {
  const project = globalConstructionService.getProjects()[0];
  const checks: Array<{ id: string; passed: boolean; details: string }> = [];
  const add = (id: string, passed: boolean, details: string) => checks.push({ id, passed, details });

  const ev = globalConstructionService.getEarnedValue(project.id);
  add("CON-EVM-01", ev.plannedValuePvUsd === 490000, "PV is derived from BAC and planned progress.");
  add("CON-EVM-02", ev.earnedValueEvUsd === 470400, "EV is derived from BAC and actual progress.");
  add("CON-EVM-03", ev.costVarianceCvUsd === 50400, "CV reconciles EV minus actual cost.");
  add("CON-EVM-04", ev.scheduleVarianceSvUsd === -19600, "SV reconciles EV minus planned value.");
  add("CON-EVM-05", ev.cpi === 1.12 && ev.spi === 0.96, "CPI/SPI are calculated from authoritative EVM values.");

  const approved = globalConstructionEngine.applyVariationToProject(project, {
    id: "00000000-0000-0000-0000-000000000002",
    projectId: project.id,
    variationNumber: "VAR-001",
    title: "Approved variation",
    description: "Certified scope change",
    costImpactUsd: 10000,
    timeImpactDays: 5,
    approvalStatus: "APPROVED",
    requestedBy: project.projectManagerId,
    requestedAt: new Date().toISOString(),
  } as any);
  add("CON-VAR-01", approved.revisedBudgetUsd === project.revisedBudgetUsd + 10000, "Approved variations change the revised budget.");
  add("CON-VAR-02", approved.contractValueUsd === project.contractValueUsd + 10000, "Approved variations change contract value.");

  const ipc = globalConstructionEngine.generatePaymentCertificate(project.id, 100000, 5000, 5, 20000);
  add("CON-IPC-01", ipc.grossCertifiedValueUsd === 105000, "IPC gross value reconciles measured work and approved variations.");
  add("CON-IPC-02", ipc.lessRetentionDeductionUsd === 5250, "Retention is deducted at the configured rate.");
  add("CON-IPC-03", ipc.netBillableAmountUsd === 79750, "IPC net billable value reconciles prior payments and retention.");

  const summary = globalConstructionEngine.calculateProjectSummary([
    { budget: 1000, laborCost: 200, materialsCost: 300, progressPercent: 50 },
    { budget: 500, laborCost: 100, materialsCost: 100, progressPercent: 100 },
  ]);
  add("CON-SUM-01", summary.totalBudget === 1500, "Project summary aggregates budget.");
  add("CON-SUM-02", summary.totalActualCost === 700, "Project summary aggregates actual cost.");
  add("CON-SUM-03", summary.overallProgressPercent === 67, "Project summary computes weighted progress.");

  const report: DomainCertificationResult = {
    timestamp: new Date().toISOString(),
    totalChecks: checks.length,
    passedChecks: checks.filter((c) => c.passed).length,
    failedChecks: checks.filter((c) => !c.passed).length,
    overallPassed: checks.every((c) => c.passed),
    checks,
  };
  const artifactDir = path.resolve(process.cwd(), "artifacts", "construction-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "construction-certification.json"), JSON.stringify(report, null, 2), "utf8");
  if (!report.overallPassed) console.error("Construction certification failed:", report.checks.filter((c) => !c.passed));
  return report;
}

if (process.argv[1]?.endsWith("construction-certification-engine.ts")) {
  runConstructionCertification().then((r) => { if (!r.overallPassed) process.exit(1); });
}
