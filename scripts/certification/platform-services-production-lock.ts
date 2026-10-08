import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  PLATFORM_SERVICES_PRODUCTION_LOCK_ID,
  PLATFORM_SERVICES_PRODUCTION_LOCKS,
  PLATFORM_SERVICES_PRODUCTION_RELEASE_GATES,
} from "../../packages/config/src/platformServicesProductionLock.js";

const root = process.cwd();
const failures: string[] = [];
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push("MISSING_FILE:" + relative);
    return "";
  }
  return fs.readFileSync(file, "utf8");
};
const assert = (ok: boolean, message: string) => { if (!ok) failures.push(message); };

assert(PLATFORM_SERVICES_PRODUCTION_LOCKS.length === 11, "PLATFORM_SERVICES_LOCK must cover exactly C01-C11.");

const ids = PLATFORM_SERVICES_PRODUCTION_LOCKS.map((service) => service.id);
for (let i = 0; i < 11; i++) {
  assert(ids.includes("C" + String(i + 1).padStart(2, "0")), "Missing platform service id C" + String(i + 1).padStart(2, "0") + ".");
}

const packageJson = JSON.parse(read("package.json"));
assert(
  packageJson.scripts?.["certify:platform-services-lock"] === "tsx scripts/certification/platform-services-production-lock.ts",
  "Missing authoritative certify:platform-services-lock package script.",
);

for (const workflow of PLATFORM_SERVICES_PRODUCTION_RELEASE_GATES) {
  const source = read(workflow);
  assert(source.includes("npm run certify:platform-services-lock"), "Platform Services Production Lock is not wired into " + workflow + ".");
}

for (const service of PLATFORM_SERVICES_PRODUCTION_LOCKS) {
  for (const file of service.authorityFiles) read(file);
  for (const file of service.certificationFiles) read(file);
  for (const file of service.testFiles) read(file);

  for (const [file, marker] of service.requiredMarkers) {
    const source = read(file);
    assert(source.includes(marker), service.id + " " + service.name + " missing contract marker: " + file + " :: " + marker);
  }

  if (service.dedicatedLock) {
    const source = read(service.dedicatedLock);
    assert(source.includes("PASS"), service.id + " dedicated production lock has no PASS terminal contract: " + service.dedicatedLock);
  }

  for (const file of service.authorityFiles) {
    const source = read(file);
    assert(!/DEMO_[A-Z0-9_]+/.test(source), service.id + " contains a demo authority marker: " + file);
    assert(!/\bWorkforceStub\b/.test(source), service.id + " contains WorkforceStub: " + file);
  }
}

assert(exists("tests/unit/platform-services-production-lock.test.ts"), "Platform Services unit lock test is missing.");
assert(exists("docs/platform/PLATFORM_SERVICES_PRODUCTION_LOCK_V1.md"), "Platform Services production-lock contract document is missing.");

for (const file of ["scripts/certification/workforce-production-lock.ts","scripts/certification/notification-production-lock.ts","scripts/certification/super-admin-production-lock.ts"]) {
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, file)], { cwd: root, stdio: "ignore" });
  } catch {
    failures.push("Existing dedicated lock failed: " + file);
  }
}

const certificate = {
  certificate: "KWAKOKO-PLATFORM-SERVICES-PRODUCTION-LOCK-CERTIFICATE-v1.0",
  version: "1.0.0",
  lockId: PLATFORM_SERVICES_PRODUCTION_LOCK_ID,
  verdict: failures.length ? "FAIL" : "PASS",
  services: PLATFORM_SERVICES_PRODUCTION_LOCKS.map((service) => ({
    id: service.id,
    name: service.name,
    status: failures.some((f) => f.startsWith(service.id + " ")) ? "FAIL" : "PASS",
    authorityFiles: service.authorityFiles,
    certificationFiles: service.certificationFiles,
    testFiles: service.testFiles,
    dedicatedLock: service.dedicatedLock || null,
  })),
  releaseGates: PLATFORM_SERVICES_PRODUCTION_RELEASE_GATES,
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.join(root, "artifacts/governance"), { recursive: true });
fs.writeFileSync(path.join(root, "artifacts/governance/platform-services-production-lock-certificate.json"), JSON.stringify(certificate, null, 2) + "\n", "utf8");

if (failures.length) {
  console.error("PLATFORM SERVICES PRODUCTION LOCK: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("PLATFORM SERVICES PRODUCTION LOCK: PASS — " + PLATFORM_SERVICES_PRODUCTION_LOCK_ID);
console.log("Scope: C01 Tenant Onboarding, C02 Subscription / Billing, C03 Workforce, C04 Notifications, C05 Documents, C06 Integrations, C07 AI, C08 BI / Analytics, C09 Workflow / Automation, C10 Compliance, C11 Super Admin.");
