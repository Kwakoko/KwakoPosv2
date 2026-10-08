import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { compareSemVer, isValidSemVer } from "../../packages/config/src/semverEngine.js";

const LOCK_ID = "SEMVER-PRODUCTION-LOCK-V1-2026-10-08";
const root = process.cwd();
const failures: string[] = [];
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const json = (p: string) => JSON.parse(read(p));
const assert = (ok: boolean, msg: string) => { if (!ok) failures.push(msg); };

const packageJson = json("package.json");
const packageLock = json("package-lock.json");
const manifest = json("release-manifest.json");
const autoSemverWorkflow = read(".github/workflows/auto-semver.yml");
const productionWorkflow = read(".github/workflows/production-release-exact-main.yml");
const ciWorkflow = read(".github/workflows/ci.yml");

let latestTag = "";
try {
  latestTag = execSync(
    "git tag --merged HEAD --sort=-v:refname",
    { cwd: root, encoding: "utf8" }
  )
    .split(/\r?\n/)
    .map((v) => v.trim())
    .find((v) => /^v\d+\.\d+\.\d+$/.test(v)) || "";
} catch {
  latestTag = "";
}

assert(Boolean(latestTag), "No authoritative stable SemVer tag is reachable from HEAD.");
if (latestTag) {
  const latestVersion = latestTag.slice(1);
  assert(isValidSemVer(latestVersion), `Authoritative stable tag is not valid SemVer: ${latestTag}`);
}

const semverValidatorSource = read("scripts/release/validate-semver.ts");
assert(
  semverValidatorSource.includes('if (report.status === "FAILED")'),
  "Conventional-commit SemVer validator must fail closed on invalid results."
);
assert(
  !semverValidatorSource.includes("STRICT_SEMVER_VALIDATION"),
  "Conventional-commit SemVer validator must not depend on an optional strictness environment variable."
);

const semverRuntimeChecks: Array<[string, boolean]> = [
  ["numeric prerelease ordering alpha.2 < alpha.10", compareSemVer("1.0.0-alpha.2", "1.0.0-alpha.10") < 0],
  ["numeric prerelease identifiers precede lexical identifiers", compareSemVer("1.0.0-1", "1.0.0-alpha") < 0],
  ["lexical prerelease comparison alpha < beta", compareSemVer("1.0.0-alpha", "1.0.0-beta") < 0],
  ["shorter prerelease chain has lower precedence", compareSemVer("1.0.0-alpha", "1.0.0-alpha.1") < 0],
  ["stable release has higher precedence than prerelease", compareSemVer("1.0.0-rc.1", "1.0.0") < 0],
  ["leading-zero numeric core versions are rejected", !isValidSemVer("01.2.3") && !isValidSemVer("1.02.3") && !isValidSemVer("1.2.03")],
  ["standard release version is valid", isValidSemVer("2.13.0")],
];

for (const [name, passed] of semverRuntimeChecks) {
  assert(passed, `SemVer runtime invariant failed: ${name}`);
}

const version = String(packageJson.version || "");
assert(isValidSemVer(version) && !version.startsWith("v"), `package.json version must be strict SemVer without a v prefix: ${version}`);
assert(packageLock.version === version, `package-lock.json version drift: expected ${version}, found ${packageLock.version}`);
assert(manifest.version === version, `release-manifest.json version drift: expected ${version}, found ${manifest.version}`);
assert(manifest.tag === `v${version}`, `release-manifest.json tag drift: expected v${version}, found ${manifest.tag}`);

if (manifest.environment === "development" || manifest.releaseChannel === "development") {
  assert(manifest.certification !== "PASS", "Development source manifest must never advertise production certification PASS.");
  assert(manifest.gitSha === null, "Development source manifest Git SHA must remain null until an exact release candidate exists.");
  assert(manifest.containerDigest === null, "Development source manifest container digest must remain null.");
  assert(manifest.cloudRunRevision === null, "Development source manifest Cloud Run revision must remain null.");
}

assert(
  autoSemverWorkflow.includes("scripts/certification/semver-production-lock.ts"),
  "Automatic SemVer workflow must execute the SemVer Production Lock."
);
assert(
  productionWorkflow.includes("scripts/certification/semver-production-lock.ts"),
  "Exact-main production certification must execute the SemVer Production Lock."
);
assert(
  ciWorkflow.includes("scripts/certification/semver-production-lock.ts"),
  "CI must execute the SemVer Production Lock."
);
assert(
  !autoSemverWorkflow.includes('^\\d+\\.\\d+\\.\\d+([-.+].*)?$'),
  "Automatic SemVer workflow must not use the previously loose SemVer regex."
);

const artifactDir = path.join(root, "artifacts", "release-evidence");
fs.mkdirSync(artifactDir, { recursive: true });
const evidence = {
  lockId: LOCK_ID,
  status: failures.length ? "FAIL" : "PASS",
  version,
  tag: manifest.tag,
  latestStableTag: latestTag || null,
  checkedAt: new Date().toISOString(),
  failures,
};
fs.writeFileSync(
  path.join(artifactDir, "semver-production-lock.json"),
  JSON.stringify(evidence, null, 2),
  "utf8"
);

if (failures.length) {
  console.error(`SEMVER PRODUCTION LOCK: FAIL — ${LOCK_ID}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SEMVER PRODUCTION LOCK: PASS — ${LOCK_ID}`);
console.log(`Authoritative SemVer: v${version}`);
console.log(`Latest stable tag: ${latestTag || "none"}`);
