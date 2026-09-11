import { runSystemUiCertification } from "./system-ui-certification-engine.js";

console.log("========================================================================");
console.log(" KWAKOPOS PHASE 25 SYSTEM UI & EXPERIENCE CERTIFICATION ENGINE         ");
console.log(" Standard: KwakoPos System UI Architecture Standard (SUI v1.0.0)       ");
console.log("========================================================================\n");

const cert = runSystemUiCertification();

for (const res of cert.results) {
  const icon = res.passed ? "✓" : "✗";
  console.log(` ${icon} [${res.pillarId}] ${res.pillarName}: ${res.details}`);
}

console.log("\n========================================================================");
console.log(` TOTAL PILLARS: ${cert.totalPillars}`);
console.log(` PASSED       : ${cert.passedPillars}`);
console.log(` FAILED       : ${cert.failedPillars}`);
console.log(` SUCCESS RATE : ${cert.successRatePct}%`);
console.log("========================================================================\n");

// Compile and persist immutable certification evidence
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { execFileSync } from "child_process";

const pkgPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = String(pkg.version || "2.12.5");
let gitSha = "clean";
try {
  gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {}

const rawContent = JSON.stringify(cert.results);
const sha256Digest = createHash("sha256").update(rawContent).digest("hex");

const evidenceDir = path.resolve(process.cwd(), "artifacts/ui-evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
const evidenceFile = path.join(evidenceDir, "kwakopos-system-ui-certification-evidence.json");

const evidenceManifest = {
  $schema: "https://kwakopos.com/schemas/system-ui-certification.v1.json",
  certificateId: `CERT-KWAKOPOS-UI-v${version}-${gitSha.slice(0, 7)}`,
  standard: "KwakoPos System UI Architecture Standard (SUI v1.0.0)",
  generatedAt: new Date().toISOString(),
  packageVersion: version,
  gitCommitSha: gitSha,
  totalPillars: cert.totalPillars,
  passedPillars: cert.passedPillars,
  failedPillars: cert.failedPillars,
  successRatePct: cert.successRatePct,
  verdict: cert.failedPillars === 0 ? "CERTIFIED_PRODUCTION_READY" : "CERTIFICATION_FAILED",
  sha256Digest,
  pillarResults: cert.results,
};

fs.writeFileSync(evidenceFile, JSON.stringify(evidenceManifest, null, 2), "utf8");
console.log(` ✓ [PASS] System UI Certification Evidence generated: ${evidenceFile}\n`);

if (cert.failedPillars > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
