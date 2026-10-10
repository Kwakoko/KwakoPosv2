import fs from "node:fs";
import path from "node:path";
import { createHash, execFileSync } from "node:crypto";
import { runRetailCertification } from "./runRetailCertification.js";

const LOCK_ID = "RETAIL-PRODUCTION-LOCK-2026-10-10";

// These pins freeze the implementation that was certified. Intentional changes to
// any locked retail surface require updating this manifest and rerunning the gate.
const LOCKED_BLOBS: Record<string, string> = {
  "apps/api/src/services/retailService.ts": "ff2e7c1fb7a708c8035a98ce4945e65f3ec0e012",
  "apps/api/src/services/retailAuthorization.ts": "6cfdb250467e19be381eafc69dd51befeafde178",
  "apps/api/src/server.ts": "7f12aa469897be1e93b4505d7cbb41e15e64be07",
  "packages/domain/src/retailEngine.ts": "9548845b617664c0b1693b2a3e8775dd3ee731f0",
  "packages/database/prisma/schema.prisma": "131cf914169681bdfb33f1dfeea2097e058b4042",
  "packages/database/prisma/migrations/202610100001_retail_promotion_source/migration.sql": "55df731e9512c9b93874f91a2fe4992c2dd19c31",
  "packages/database/prisma/migrations/202610100002_variant_barcode_uniqueness/migration.sql": "48514dd6b68f30475c4da73cb26604e285a5ebf3",
  "packages/database/src/atomicCommercialFinance.ts": "61a73fb17fc50306939e68ca1443356534c5b1f0",
  "packages/database/src/prismaProductionRepositories.ts": "b2cf81b306fca370b230e8554c60b33c920279eb",
  "packages/database/src/pricingAuthority.ts": "68667c2c355422681d9b8d59ec751ce2f51d74ab",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "0a14912d599d3e325c48759d4b25366e79f1453d",
  "apps/web/src/pages/PosPage.tsx": "35648f21f71204e65333582c33af9287a1a1edb1",
  "apps/web/src/pages/InventoryPage.tsx": "1aada87ec4442b426973a2bba97c3d920fa86f04",
  "packages/contracts/src/retailContracts.ts": "ad8593531302d739518d77170f717b40e35c0a94",
  "packages/contracts/src/index.ts": "27b80e50d9ee754721393adc6d858b1e71143cd2",
  "scripts/certification/retail-certification-engine.ts": "e71ba5ea3337cc6ce187fe0bc564c280fdddaae8",
  "scripts/certification/runRetailCertification.ts": "d8e783756de007a444fea60e75ad19f8f8906bc1",
  "tests/unit/industry-retail.test.ts": "6522b33670a21ec2c617e501cc5b6b3e9f6a819f",
  "tests/unit/retail-authorization.test.ts": "3f1dd25462a34ebce98b83bd82ce5b4d742458ad",
  "tests/integration/commercial-api.test.ts": "48147a6e0b6d649329093559d84e2b9b625f6633",
  "tests/integration/inventory-production-lock-lifecycle.test.ts": "c548f9983375a7ad745093e03b2ca29136cce726",
  "tests/integration/retail-persistence.test.ts": "1d89ead9cb77763e0b5e1114da689024a433fd0d",
};

function read(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) throw new Error("missing locked file: " + relativePath);
  return fs.readFileSync(fullPath, "utf8");
}

function blobSha(content: string, relativePath: string): string {
  return execFileSync("git", ["hash-object", "--path=" + relativePath, "--stdin"], {
    input: Buffer.from(content, "utf8"),
    encoding: "utf8",
  }).trim();
}

async function main(): Promise<void> {
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/i.test(gitSha)) throw new Error("RETAIL_LOCK_REQUIRES_FULL_GIT_SHA");

  const failures: string[] = [];
  const checked: Record<string, { expected: string; actual: string; pass: boolean }> = {};

  // Protect the enforcement wiring without byte-pinning shared workflows.
  const requiredHooks: Array<[string, string]> = [
    ["package.json", '"certify:retail-lock": "tsx scripts/certification/retail-production-lock.ts"'],
    [".github/workflows/ci.yml", "npm run certify:retail-lock"],
    [".github/workflows/production-certification.yml", "npm run certify:retail-lock"],
    [".github/workflows/production-release-exact-main.yml", "npm run certify:retail-lock"],
  ];
  for (const [relativePath, marker] of requiredHooks) {
    try {
      if (!read(relativePath).includes(marker)) failures.push("LOCK_HOOK_MISSING: " + relativePath + " marker " + marker);
    } catch (error) {
      failures.push("LOCK_HOOK_READ_FAILURE: " + relativePath + ": " + String(error));
    }
  }
  for (const [relativePath, expected] of Object.entries(LOCKED_BLOBS)) {
    try {
      const actual = blobSha(read(relativePath), relativePath);
      checked[relativePath] = { expected, actual, pass: actual === expected };
      if (actual !== expected) failures.push("LOCK_DRIFT: " + relativePath + " expected " + expected + " got " + actual);
    } catch (error) {
      failures.push("LOCK_READ_FAILURE: " + relativePath + ": " + String(error));
    }
  }

  let evidence: Awaited<ReturnType<typeof runRetailCertification>> | undefined;
  try {
    evidence = await runRetailCertification();
    if (evidence.evidencePackage.gitSha !== gitSha) failures.push("EVIDENCE_SHA_MISMATCH");
    if (evidence.evidencePackage.evaluations.length !== 30) failures.push("RETAIL_PILLAR_COUNT_MISMATCH");
    const duplicateIds = evidence.evidencePackage.evaluations
      .map((item) => item.pillarId)
      .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length) failures.push("DUPLICATE_RETAIL_PILLAR_IDS: " + duplicateIds.join(","));
    const failedPillars = evidence.evidencePackage.evaluations.filter((item) => !item.passed);
    for (const item of failedPillars) failures.push("PILLAR_FAILED_" + item.pillarId + ": " + item.details);
    if (!evidence.passed || evidence.evidencePackage.status !== "CERTIFIED" || evidence.evidencePackage.overallScore !== 100) {
      failures.push("RETAIL_CERTIFICATION_NOT_FULLY_PASSED");
    }
  } catch (error) {
    failures.push("RETAIL_CERTIFICATION_EXCEPTION: " + String(error));
  }

  const result = {
    lockId: LOCK_ID,
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    gitSha,
    lockedFiles: Object.keys(LOCKED_BLOBS).length,
    retailPillars: evidence?.evidencePackage.evaluations.length ?? 0,
    retailScore: evidence?.evidencePackage.overallScore ?? 0,
    retailStatus: evidence?.evidencePackage.status ?? "FAILED",
    retailEvidencePath: evidence?.evidencePath ?? null,
    failures,
    checked,
    generatedAt: new Date().toISOString(),
  };

  const artifactsDir = path.resolve(process.cwd(), "artifacts", "retail-evidence");
  fs.mkdirSync(artifactsDir, { recursive: true });
  const evidenceJson = JSON.stringify(result, null, 2);
  const evidencePath = path.join(artifactsDir, "retail-production-lock-" + gitSha.slice(0, 12) + ".json");
  fs.writeFileSync(evidencePath, evidenceJson, "utf8");
  result.failures.length
    ? console.error(JSON.stringify(result, null, 2))
    : console.log(JSON.stringify(result, null, 2));
  if (failures.length) {
    process.exit(1);
  }
  const digest = createHash("sha256").update(evidenceJson).digest("hex");
  console.log("RETAIL PRODUCTION LOCK: PASS — " + LOCK_ID + " — SHA " + gitSha + " — evidence digest " + digest);
}

main().catch((error) => {
  console.error("RETAIL PRODUCTION LOCK: FAIL", String(error));
  process.exit(1);
});
