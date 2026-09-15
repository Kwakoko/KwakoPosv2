import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { KWAKOPOS_UI_PARITY_MATRIX } from "../../apps/web/src/uiParityMatrix.js";

export interface PillarVerificationResult {
  pillarId: string;
  pillarName: string;
  passed: boolean;
  details: string;
}

interface BrowserEvidence {
  controlId: string;
  status: "PASS";
  gitSha: string;
  testId: string;
  browser: string;
  viewport: string;
  executedAt: string;
  evidence: string;
}

function currentGitSha(): string {
  const envSha = process.env.GITHUB_SHA?.trim();
  if (envSha) return envSha;
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

function readEvidence(controlId: string): BrowserEvidence | null {
  const root = process.env.KWAKOPOS_UI_EVIDENCE_DIR || path.resolve(process.cwd(), "artifacts/ui-certification");
  const file = path.join(root, `${controlId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as BrowserEvidence;
    if (parsed.controlId !== controlId || parsed.status !== "PASS") return null;
    if (!parsed.gitSha || parsed.gitSha !== currentGitSha()) return null;
    if (!parsed.testId || !parsed.browser || !parsed.viewport || !parsed.executedAt || !parsed.evidence) return null;
    return parsed;
  } catch { return null; }
}

export function runUiCertificationProgram(): {
  totalPillars: number;
  passedPillars: number;
  failedPillars: number;
  successRatePct: number;
  results: PillarVerificationResult[];
} {
  const results: PillarVerificationResult[] = [];
  const addResult = (id: string, name: string, passed: boolean, details: string) => results.push({ pillarId: id, pillarName: name, passed, details });

  const distDir = path.resolve(process.cwd(), "apps/web/dist");
  const hasDist = fs.existsSync(distDir) && fs.existsSync(path.join(distDir, "index.html"));
  const hasManifest = fs.existsSync(path.join(distDir, "manifest.json"));
  const hasSw = fs.existsSync(path.join(distDir, "sw.js"));
  const sha = currentGitSha();

  addResult("RUNTIME-01", "Compiled React/PWA application artifacts", hasDist && hasManifest && hasSw, `dist=${hasDist}, manifest=${hasManifest}, sw=${hasSw}, sha=${sha || "unknown"}`);
  addResult("RUNTIME-02", "Release identity available", Boolean(sha), `currentGitSha=${sha || "unavailable"}`);

  for (const control of KWAKOPOS_UI_PARITY_MATRIX) {
    if (control.status !== "PRODUCTION_CERTIFIED") {
      addResult(control.controlId, control.name, true, `Not certified; current declared state is ${control.status}.`);
      continue;
    }
    const evidence = readEvidence(control.controlId);
    addResult(
      control.controlId,
      control.name,
      Boolean(evidence),
      evidence
        ? `Executable browser evidence verified: ${evidence.testId} on ${evidence.browser} ${evidence.viewport}, gitSha=${evidence.gitSha}.`
        : `BLOCKED: no exact-commit executable browser evidence at ${process.env.KWAKOPOS_UI_EVIDENCE_DIR || "artifacts/ui-certification"}/${control.controlId}.json.`
    );
  }

  const passedPillars = results.filter((r) => r.passed).length;
  const totalPillars = results.length;
  return { totalPillars, passedPillars, failedPillars: totalPillars - passedPillars, successRatePct: Math.round((passedPillars / totalPillars) * 100), results };
}
