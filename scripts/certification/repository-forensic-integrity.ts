import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { createHash } from "node:crypto";

const root = process.cwd();
const evidenceDir = path.resolve(root, "artifacts", "release-evidence");
const output = path.join(evidenceDir, "kwakopos-repository-forensic-integrity.json");
const textExt = /\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|sql|css|scss|html|md|txt|env|example)$/i;
const codeExt = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const jsonExt = /\.json$/i;
const suspicious = [
  /5900414000000000000000000000000000000000/i,
  /efd6bc4300000000000000000000000000000000000000000000000000000000/i,
  /kwakopos-prod-001/i,
  /kwakopos-production-rev-00001/i,
  /admin123|password123|changeme/i,
];
const intentionalFixturePath = /(^|\\)(tests|scripts[\\/]certification)[\\/]/i;
const provenanceEnforcementPath = /scripts[\\/]release[\\/]releaseIdentity\.ts$/i;

function actionableSuspiciousMatches(relative: string, matches: string[]) {
  if (!matches.length) return matches;
  if (intentionalFixturePath.test(relative) || provenanceEnforcementPath.test(relative)) return [];
  return matches;
}

function gitFiles(): string[] {
  const raw = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return [...new Set(raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
}

function scanFile(relative: string) {
  const absolute = path.resolve(root, relative);
  const bytes = fs.readFileSync(absolute);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const text = bytes.toString("utf8");
  const isText = textExt.test(relative);
  let parseStatus: "NOT_APPLICABLE" | "PASS" | "FAIL" = "NOT_APPLICABLE";
  let parseError = "";

  if (isText && codeExt.test(relative)) {
    const sf = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    parseStatus = sf.parseDiagnostics.length === 0 ? "PASS" : "FAIL";
    parseError = sf.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, " ")).join(" | ");
  } else if (isText && jsonExt.test(relative)) {
    try { JSON.parse(text); parseStatus = "PASS"; } catch (err: any) { parseStatus = "FAIL"; parseError = err.message; }
  }

  const lines = text.split(/\r?\n/).length;
  const controlChars = isText && /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  const suspiciousMatches = actionableSuspiciousMatches(relative, suspicious.filter(rx => rx.test(text)).map(String));
  return { relative, sha256, lines, isText, parseStatus, parseError, controlChars, suspiciousMatches };
}

export function runRepositoryForensicIntegrityCertification() {
  const files = gitFiles();
  const results = files.map(scanFile);
  const parseFailures = results.filter(r => r.parseStatus === "FAIL");
  const controlFailures = results.filter(r => r.controlChars);
  const suspiciousHits = results.filter(r => r.suspiciousMatches.length > 0);
  const scannedLines = results.filter(r => r.isText).reduce((sum, r) => sum + r.lines, 0);
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const verdict = parseFailures.length === 0 && controlFailures.length === 0 && suspiciousHits.length === 0 ? "PASS" : "FAIL";
  const evidence = {
    schema: "kwakopos.repository-forensic-integrity.v1", generatedAt: new Date().toISOString(), gitSha, verdict,
    files: { tracked: files.length, text: results.filter(r => r.isText).length, parseFailures: parseFailures.length, controlFailures: controlFailures.length, suspiciousFiles: suspiciousHits.length },
    lines: { scanned: scannedLines },
    failures: { parse: parseFailures.map(r => ({ file: r.relative, error: r.parseError })), control: controlFailures.map(r => r.relative), suspicious: suspiciousHits.map(r => ({ file: r.relative, matches: r.suspiciousMatches })) },
    fileInventory: results,
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2), "utf8");
  if (verdict !== "PASS") throw new Error(`REPOSITORY_FORENSIC_CERTIFICATION_FAILED:${output}`);
  console.log(`REPOSITORY_FORENSIC_CERTIFICATION=${verdict}`);
  console.log(`TRACKED_FILES=${files.length}`);
  console.log(`TEXT_FILES=${results.filter(r => r.isText).length}`);
  console.log(`LINES_SCANNED=${scannedLines}`);
  console.log(`EVIDENCE=${output}`);
  return evidence;
}

if (process.argv[1]?.endsWith("repository-forensic-integrity.ts")) runRepositoryForensicIntegrityCertification();
