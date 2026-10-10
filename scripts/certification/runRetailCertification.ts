import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadConfig } from "@kwakopos2/config";
import type { RetailEvidencePackage } from "@kwakopos2/contracts";
import { evaluateRetailCertification } from "./retail-certification-engine.js";

export async function runRetailCertification(): Promise<{
  passed: boolean;
  evidencePackage: RetailEvidencePackage;
  evidencePath: string;
}> {
  const config = loadConfig();
  const evaluation = await evaluateRetailCertification();
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as { version?: string };
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/i.test(gitSha)) throw new Error("RETAIL_CERTIFICATION_REQUIRES_FULL_GIT_SHA");
  const passedCount = evaluation.evaluations.filter((item) => item.passed).length;
  const exerciseId = "RETAIL-KWAKOPOS-" + new Date().toISOString().split("T")[0] + "-" + randomUUID().slice(0, 6).toUpperCase();

  const evidencePackage: RetailEvidencePackage = {
    exerciseId,
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV || "production",
    appVersion: config.APP_VERSION || packageJson.version || "UNKNOWN",
    gitSha,
    overallScore: evaluation.overallScore,
    status: evaluation.allPassed ? "CERTIFIED" : "FAILED",
    evaluations: evaluation.evaluations,
    digest: "",
  };
  const rawJson = JSON.stringify({ ...evidencePackage, digest: undefined }, null, 2);
  evidencePackage.digest = createHash("sha256").update(rawJson).digest("hex");

  const artifactsDir = path.resolve(process.cwd(), "artifacts", "retail-evidence");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const evidencePath = path.join(artifactsDir, exerciseId + ".json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidencePackage, null, 2), "utf8");

  console.log("");
  console.log("========================================================================");
  console.log(" KWAKOPOS ENTERPRISE RETAIL OPERATING SYSTEM CERTIFICATION ENGINE");
  console.log(" Standard: KwakoPos Retail Industry Operating System Standard (30 validators)");
  console.log(" Exercise ID: " + exerciseId);
  console.log(" Version: " + evidencePackage.appVersion + " | Git SHA: " + evidencePackage.gitSha);
  console.log(" Validators passed: " + passedCount + " / " + evaluation.evaluations.length);
  console.log("========================================================================");
  for (const item of evaluation.evaluations) {
    console.log((item.passed ? "✓ [PASS]" : "✗ [FAIL]") + " [PILLAR " + String(item.pillarId).padStart(2, "0") + "] " +
      item.pillarName.padEnd(42) + " : " + item.details);
  }
  console.log("");
  console.log("RETAIL CERTIFICATION RESULT: " + evidencePackage.status + " | Score: " + evidencePackage.overallScore + "%");
  console.log("Evidence Artifact: " + evidencePath);
  console.log("");

  return { passed: evaluation.allPassed, evidencePackage, evidencePath };
}

if (process.argv[1]?.endsWith("runRetailCertification.ts")) {
  runRetailCertification().then((result) => {
    if (!result.passed) process.exit(1);
  }).catch((error) => {
    console.error("RETAIL CERTIFICATION ERROR:", error);
    process.exit(1);
  });
}
