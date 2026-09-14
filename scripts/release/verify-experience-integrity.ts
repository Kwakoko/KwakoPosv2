import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { KWAKOKO_EXPERIENCE_GOVERNANCE } from "../../packages/config/src/experienceGovernance.js";

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, "apps/web/src");
const TSX = /\.tsx$/i;

export interface ExperienceVerificationResult {
  passed: boolean;
  filesScanned: number;
  explicitViolations: number;
  heuristicFindings: number;
  findings: Array<{ file: string; line: number; rule: string; detail: string }>;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "artifacts"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (TSX.test(entry.name)) out.push(full);
  }
  return out;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

export function runExperienceIntegrityVerification(): ExperienceVerificationResult {
  const findings: ExperienceVerificationResult["findings"] = [];
  const files = walk(SOURCE_ROOT);
  let explicitViolations = 0;
  let heuristicFindings = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const source = fs.readFileSync(file, "utf8");

    const governedActions = /<button\b[^>]*data-governance=["']action["'][^>]*>/gi;
    for (const match of source.matchAll(governedActions)) {
      const tag = match[0];
      const hasAction = /onClick\s*=|type=["']submit["']|formAction\s*=|disabled\s*=/.test(tag);
      if (!hasAction) {
        explicitViolations++;
        findings.push({
          file: rel,
          line: lineOf(source, match.index ?? 0),
          rule: "button_without_governed_action",
          detail: "An explicitly governed action button must expose a handler, submit behavior, form action, or disabled state.",
        });
      }
    }

    const governedCapabilities = /data-governance=["']capability["'][^>]*data-capability=["'][^"']+["']/gi;
    for (const match of source.matchAll(governedCapabilities)) {
      const tag = match[0];
      if (!/data-capability-route=|data-capability-internal=["']true["']/.test(tag)) {
        explicitViolations++;
        findings.push({
          file: rel,
          line: lineOf(source, match.index ?? 0),
          rule: "capability_without_path_classification",
          detail: "A governed capability must declare a UI/API path or be explicitly classified internal-only.",
        });
      }
    }

    const bareButtons = /<button\b[\s\S]*?>/gi;
    for (const match of source.matchAll(bareButtons)) {
      const tag = match[0];
      const hasPointerIntent = /onClick\s*=|onMouseDown\s*=|onPointerDown\s*=|onKeyDown\s*=|type=["']submit["']|formAction\s*=/.test(tag);
      const explicitClassification = /data-governance=/.test(tag);
      if (!hasPointerIntent && !explicitClassification) {
        heuristicFindings++;
        findings.push({
          file: rel,
          line: lineOf(source, match.index ?? 0),
          rule: "button_without_classification",
          detail: "Legacy heuristic finding: classify the control as an action or an approved non-action control.",
        });
      }
    }
  }

  return {
    passed: explicitViolations === 0,
    filesScanned: files.length,
    explicitViolations,
    heuristicFindings,
    findings,
  };
}

if (process.argv[1]?.endsWith("verify-experience-integrity.ts")) {
  const result = runExperienceIntegrityVerification();
  const certificate = {
    certificateId: KWAKOKO_EXPERIENCE_GOVERNANCE.releaseCertificate.id,
    governanceVersion: KWAKOKO_EXPERIENCE_GOVERNANCE.version,
    status: result.passed ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    filesScanned: result.filesScanned,
    explicitViolations: result.explicitViolations,
    heuristicFindings: result.heuristicFindings,
    gates: KWAKOKO_EXPERIENCE_GOVERNANCE.releaseCertificate.requiredGates,
  };
  const artifactDir = path.join(ROOT, "artifacts", "release");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "KWAKOKO-EXPERIENCE-CERTIFICATE-v1.0.json"), JSON.stringify(certificate, null, 2));

  console.log("========================================================================");
  console.log(" KWAKOKO EXPERIENCE INTEGRITY VERIFICATION                              ");
  console.log("========================================================================");
  console.log(`Files Scanned:        ${result.filesScanned}`);
  console.log(`Explicit Violations:  ${result.explicitViolations}`);
  console.log(`Heuristic Findings:   ${result.heuristicFindings}`);
  console.log(`Certificate:           ${certificate.certificateId}`);
  console.log(`Status:               [${result.passed ? "PASS" : "FAIL"}]`);
  console.log("========================================================================");

  if (!result.passed) {
    for (const finding of result.findings.filter((item) => ["button_without_governed_action", "capability_without_path_classification"].includes(item.rule))) {
      console.error(`  - ${finding.file}:${finding.line} ${finding.rule} — ${finding.detail}`);
    }
    process.exit(1);
  }
}
