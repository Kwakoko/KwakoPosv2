import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { KWAKOKO_AI_AGENT_GOVERNANCE, resolveRepoRoot } from "../../packages/config/src/aiAgentGovernance.js";

const root = resolveRepoRoot();
const findings: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "coverage"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function rel(file: string): string { return path.relative(root, file).replaceAll("\\", "/"); }

function assertFile(relative: string): void {
  if (!fs.existsSync(path.join(root, relative))) findings.push(`Missing governance authority: ${relative}`);
}

for (const authority of Object.values(KWAKOKO_AI_AGENT_GOVERNANCE.canonicalAuthorities)) assertFile(authority);
for (const requiredScript of [
  "scripts/release/verify-brand-integrity.ts",
  "scripts/release/verify-design-system.ts",
  "scripts/release/verify-experience-integrity.ts",
  "scripts/release/verify-workflow-integrity.ts",
  "scripts/release/verify-ai-agent-governance.ts",
]) assertFile(requiredScript);

const webRoot = path.join(root, "apps", "web", "src");
const browserFiles = walk(webRoot).filter((f) => /\.(ts|tsx)$/.test(f));
const nodeImport = /(?:from\s*["']|import\s*["'])(node:(?:fs|path|crypto|child_process)|(?:fs|path|crypto|child_process))["']/g;
for (const file of browserFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(nodeImport)) findings.push(`Browser boundary violation in ${rel(file)}: ${match[1]}`);
}

const sourceFiles = walk(path.join(root, "apps"), []).concat(walk(path.join(root, "packages"), [])).filter((f) => !f.endsWith("aiAgentGovernance.ts"));
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const marker of KWAKOKO_AI_AGENT_GOVERNANCE.prohibitedGovernanceBypasses) {
    if (source.includes(marker)) findings.push(`Governance bypass marker '${marker}' in ${rel(file)}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const gate of KWAKOKO_AI_AGENT_GOVERNANCE.requiredReleaseGates) {
  if (!packageJson.scripts?.[gate]) findings.push(`Required package gate missing: ${gate}`);
}

const pkgText = fs.readFileSync(path.join(root, "package.json"), "utf8");
if (!pkgText.includes('"ai-governance:verify"')) findings.push("package.json does not expose ai-governance:verify");

if (findings.length > 0) {
  console.error(`❌ Kwakoko AI Agent Governance: FAIL (${findings.length} finding(s))`);
  for (const finding of findings) console.error(` - ${finding}`);
  process.exit(1);
}

const delegated = [
  ["brand-integrity", "scripts/release/verify-brand-integrity.ts"],
  ["design-system", "scripts/release/verify-design-system.ts"],
  ["experience-integrity", "scripts/release/verify-experience-integrity.ts"],
  ["workflow-integrity", "scripts/release/verify-workflow-integrity.ts"],
] as const;
for (const [label, script] of delegated) {
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, script)], { cwd: root, stdio: "pipe", encoding: "utf8" });
    console.log(`✅ delegated gate: ${label}`);
  } catch (error: any) {
    const output = `${error.stdout || ""}${error.stderr || ""}`.trim();
    console.error(`❌ delegated gate: ${label}`);
    if (output) console.error(output);
    process.exit(1);
  }
}

const certificate = {
  id: KWAKOKO_AI_AGENT_GOVERNANCE.certification.certificate,
  version: KWAKOKO_AI_AGENT_GOVERNANCE.version,
  status: "PASS",
  checkedBrowserFiles: browserFiles.length,
  requiredAuthorities: Object.keys(KWAKOKO_AI_AGENT_GOVERNANCE.canonicalAuthorities).length,
  delegatedGates: delegated.map(([label]) => label),
  generatedAt: new Date().toISOString(),
};
const artifactDir = path.join(root, "artifacts", "governance");
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, "ai-agent-governance-certificate.json"), JSON.stringify(certificate, null, 2) + "\n");
console.log("✅ Kwakoko AI Agent Governance: PASS");
console.log(`   certificate: ${certificate.id}`);
console.log(`   authorities: ${certificate.requiredAuthorities}`);
console.log(`   browser files checked: ${certificate.checkedBrowserFiles}`);
console.log(`   governance convergence: ${certificate.delegatedGates.join(", ")}`);



