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
  /kwakopos-production-rev-00001/i,
  /admin123|password123|changeme/i,
];
const intentionalFixturePath = /(^|\\)(tests|scripts[\\/]certification|scripts[\\/]retired-certification)[\\/]/i;
const provenanceEnforcementPath = /scripts[\\/]release[\\/]releaseIdentity\.ts$/i;
const retiredArtifactPath = /scripts[\\/]retired-certification[\\/].*\.disabled$/i;

function actionableSuspiciousMatches(relative: string, matches: string[]) {
  if (!matches.length) return matches;
  if (intentionalFixturePath.test(relative) || provenanceEnforcementPath.test(relative) || retiredArtifactPath.test(relative)) return [];
  return matches;
}

function decodeText(bytes: Buffer): { text: string; encoding: string } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: bytes.toString("utf16le"), encoding: "utf16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.length - 2);
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      swapped[i - 2] = bytes[i + 1];
      swapped[i - 1] = bytes[i];
    }
    return { text: swapped.toString("utf16le"), encoding: "utf16be" };
  }
  // Windows tooling can emit UTF-16LE text without a BOM. Detect the characteristic
  // alternating NUL-byte pattern so the scanner does not mistake encoding bytes for
  // control characters in otherwise valid SQL/configuration text.
  const sample = bytes.subarray(0, Math.min(bytes.length, 1024));
  let oddNuls = 0;
  let evenNuls = 0;
  for (let i = 0; i < sample.length; i += 2) if (sample[i] === 0) evenNuls++;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0) oddNuls++;
  if (oddNuls > 16 && oddNuls > evenNuls * 4) {
    return { text: bytes.toString("utf16le"), encoding: "utf16le-no-bom" };
  }
  return { text: bytes.toString("utf8"), encoding: "utf8" };
}

function gitFiles(): string[] {
  const raw = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return [...new Set(raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
}

function scanFile(relative: string) {
  const absolute = path.resolve(root, relative);
  const bytes = fs.readFileSync(absolute);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const decoded = decodeText(bytes);
  const text = decoded.text;
  const isText = textExt.test(relative);
  let parseStatus: "NOT_APPLICABLE" | "PASS" | "FAIL" = "NOT_APPLICABLE";
  let parseError = "";

  if (isText && codeExt.test(relative)) {
    const sf = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const diagnostics: any[] = (sf as any).parseDiagnostics || [];
    parseStatus = diagnostics.length === 0 ? "PASS" : "FAIL";
    parseError = diagnostics.map((d: any) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join(" | ");
  } else if (isText && jsonExt.test(relative)) {
    try { JSON.parse(text); parseStatus = "PASS"; } catch (err: any) { parseStatus = "FAIL"; parseError = err.message; }
  }

  const lines = text.split(/\r?\n/).length;
  const controlChars = isText && /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  const suspiciousMatches = actionableSuspiciousMatches(relative, suspicious.filter(rx => rx.test(text)).map(String));
  return { relative, sha256, lines, isText, encoding: decoded.encoding, parseStatus, parseError, controlChars, suspiciousMatches };
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
