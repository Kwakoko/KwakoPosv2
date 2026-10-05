import * as fs from "fs";
import * as path from "path";
import { globalGarageService } from "../../apps/api/src/services/garageService.js";
import { globalGarageEngine } from "@kwakopos2/domain";

export interface GarageCertificationResult {
  timestamp: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  overallPassed: boolean;
  checks: Array<{ id: string; passed: boolean; details: string }>;
}

export async function runGarageCertification(): Promise<GarageCertificationResult> {
  const vehicle = globalGarageService.getVehicles()[0];
  const job = globalGarageService.getJobCards()[0];
  const checks: Array<{ id: string; passed: boolean; details: string }> = [];
  const add = (id: string, passed: boolean, details: string) => checks.push({ id, passed, details });

  const transferred = globalGarageEngine.transferVehicleOwnership(vehicle, "customer-002", "T999 XYZ");
  add("GAR-VEH-01", transferred.id === vehicle.id, "Vehicle UUID is immutable during ownership transfer.");
  add("GAR-VEH-02", transferred.customerId === "customer-002", "Ownership changes to the new customer.");
  add("GAR-VEH-03", transferred.registrationNumber === "T999 XYZ", "Optional registration transfer is applied.");

  const labor = globalGarageEngine.calculateLaborCostAndRevenue(8, 20, 35);
  add("GAR-LAB-01", labor.laborCostUsd === 160, "Labor cost is hours multiplied by cost rate.");
  add("GAR-LAB-02", labor.laborRevenueUsd === 280, "Labor revenue is hours multiplied by billing rate.");
  add("GAR-LAB-03", labor.grossProfitUsd === 120, "Labor gross profit reconciles revenue minus cost.");

  const cost = globalGarageEngine.calculateWorkOrderCost(500, 10, 30, 50);
  add("GAR-COST-01", cost.partsCostTotal === 500, "Parts cost is preserved.");
  add("GAR-COST-02", cost.laborCostTotal === 300, "Labor cost is calculated from hours and rate.");
  add("GAR-COST-03", cost.grandTotal === 750, "Work order total reconciles parts, labor and discount.");

  const estimate = { grandTotalUsd: 1000, approvalStatus: "APPROVED" } as any;
  add("GAR-EST-01", globalGarageEngine.isEstimateOverrun(estimate, 1000) === false, "Approved estimate within tolerance is accepted.");
  add("GAR-EST-02", globalGarageEngine.isEstimateOverrun(estimate, 1200) === true, "Approved estimate exceeding tolerance is flagged.");
  add("GAR-EST-03", globalGarageEngine.isEstimateOverrun({ ...estimate, approvalStatus: "DRAFT" }, 1) === true, "Unapproved work is always blocked.");

  const alert = globalGarageEngine.generatePredictiveMaintenanceAlert(vehicle);
  add("GAR-PM-01", alert !== null, "Maintenance alert is generated near service interval.");
  add("GAR-PM-02", alert?.vehicleId === vehicle.id, "Maintenance alert identifies the correct vehicle.");

  add("GAR-QA-01", globalGarageEngine.assertQaSignoffAllowed({ status: "QA_REVIEW" }) === true, "QA review status permits signoff.");
  let qaBlocked = false;
  try { globalGarageEngine.assertQaSignoffAllowed({ status: "IN_PROGRESS" }); } catch { qaBlocked = true; }
  add("GAR-QA-02", qaBlocked, "In-progress work cannot be QA-signed.");

  const reconciled = globalGarageEngine.reconcileJobCardFinancials(500, 300, 80, 30, 850);
  add("GAR-FIN-01", reconciled.isReconciled && reconciled.varianceUsd === 0, "Job card invoice reconciles to its components.");
  const unreconciled = globalGarageEngine.reconcileJobCardFinancials(500, 300, 80, 30, 851);
  add("GAR-FIN-02", !unreconciled.isReconciled && unreconciled.varianceUsd === 1, "Financial variance is detected.");

  const summary = globalGarageService.getFinancialSummary();
  add("GAR-SUM-01", summary.totalJobCardsCount === 1, "Garage summary reflects active job cards.");
  add("GAR-SUM-02", summary.grossMarginUsd === 21500, "Garage gross margin is authoritative.");
  add("GAR-SUM-03", summary.marginPct === 50, "Garage margin percentage is authoritative.");
  add("GAR-STATE-01", job.isReleased === false, "Vehicle release remains blocked before completion.");
  add("GAR-STATE-02", vehicle.currentMileageKm === 45000, "Vehicle mileage is retained as source state.");

  const report: GarageCertificationResult = {
    timestamp: new Date().toISOString(),
    totalChecks: checks.length,
    passedChecks: checks.filter((c) => c.passed).length,
    failedChecks: checks.filter((c) => !c.passed).length,
    overallPassed: checks.every((c) => c.passed),
    checks,
  };
  const artifactDir = path.resolve(process.cwd(), "artifacts", "garage-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "garage-certification.json"), JSON.stringify(report, null, 2), "utf8");
  if (!report.overallPassed) console.error("Garage certification failed:", report.checks.filter((c) => !c.passed));
  return report;
}

if (process.argv[1]?.endsWith("garage-certification-engine.ts")) {
  runGarageCertification().then((r) => { if (!r.overallPassed) process.exit(1); });
}
