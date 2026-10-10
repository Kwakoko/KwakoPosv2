import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ALL_MODULE_KEYS, MODULE_MANIFESTS } from "../../apps/web/src/modules/moduleRegistry.js";

const LOCK_ID = "NAVIGATION-PRODUCTION-LOCK-2026-10-10";
const EXPECTED_MODULE_COUNT = 32;
const EXPECTED_SUBMENU_GROUPS = 126;
const EXPECTED_SUBITEM_COUNT = 659;

const LOCKED_BLOBS: Record<string, string> = {
  "package.json": "dc0bdaae20acfde9c106e1c9617430fd26162d87",
  "apps/web/src/App.tsx": "a67c77edd34362b241599ed2b5f28b6f55a7acd2",
  "apps/web/src/modules/moduleRegistry.ts": "33955eb09c8940a45471b64fa980a966da7e11c2",
  "apps/web/src/pages/VerticalCommandCenterPage.tsx": "dc932c2adf63194e6af11ed340be7ba43f9d498f",
  "apps/web/src/pages/DashboardPage.tsx": "37cdba77322900fe5a45d4e6e7d5410e8f409d40",
  "apps/web/src/pages/InventoryPage.tsx": "1aada87ec4442b426973a2bba97c3d920fa86f04",
  "apps/web/src/pages/PurchasingPage.tsx": "48316f1d470fd9d3974a16b6fb05e11132e900bc",
  "apps/web/src/pages/ReportsPage.tsx": "0215ab6d294a164bc3c83b22717e73abcea27cee",
  "apps/web/src/pages/SettingsPage.tsx": "bae3919e787d81c2a3a8a6e9f9aba3a6e0350a1a",
  "apps/web/src/pages/CashDrawerPage.tsx": "8f57d8586a833d37aee9f37d99efad869fcb607e",
  "apps/web/src/pages/ReceiptsPage.tsx": "d5744e2e5f5f89b78c162727fe6b9978776bf44a",
  ".github/workflows/production-certification.yml": "9572728823adb480e6f33a27a409b032cbfbea84",
  ".github/workflows/production-release-exact-main.yml": "98d0352252df55f5df258b043c24b0e7864b08e0",
};

const MARKERS: Array<[string, string, string]> = [
  ["route-precedence", "apps/web/src/App.tsx", "const isCurrentManifestSubItem = manifest.sidebar.some("],
  ["route-precedence-resolution", "apps/web/src/App.tsx", "const mappedPath = isCurrentManifestSubItem"],
  ["vertical-horizontal-tabs", "apps/web/src/pages/VerticalCommandCenterPage.tsx", "const horizontalTabs = activeSubmenu"],
  ["vertical-horizontal-tab-action", "apps/web/src/pages/VerticalCommandCenterPage.tsx", "onClick={() => setActiveTab(tab)}"],
  ["inventory-reverse-binding", "apps/web/src/pages/InventoryPage.tsx", "selectInventoryTab"],
  ["purchasing-reverse-binding", "apps/web/src/pages/PurchasingPage.tsx", "selectPurchasingTab"],
  ["reports-reverse-binding", "apps/web/src/pages/ReportsPage.tsx", "selectReportTab"],
  ["settings-reverse-binding", "apps/web/src/pages/SettingsPage.tsx", "selectSettingsTab"],
  ["cash-drawer-reverse-binding", "apps/web/src/pages/CashDrawerPage.tsx", "selectCashDrawerTab"],
  ["receipts-reverse-binding", "apps/web/src/pages/ReceiptsPage.tsx", "selectReceiptTab"],
  ["package-hook", "package.json", "certify:navigation-lock"],
  ["ci-hook", ".github/workflows/ci.yml", "npm run certify:navigation-lock"],
  ["candidate-certification-hook", ".github/workflows/production-certification.yml", "npm run certify:navigation-lock"],
  ["exact-main-production-release-hook", ".github/workflows/production-release-exact-main.yml", "npm run certify:navigation-lock"]
];

function gitBlobSha(content: string, relativePath: string): string {
  // Hash the canonical Git-cleaned representation so Windows CRLF checkouts
  // produce the same blob SHA as GitHub/Linux CI.
  try {
    return execFileSync(
      "git",
      ["hash-object", "--path=" + relativePath, "--stdin"],
      { input: Buffer.from(content, "utf8"), encoding: "utf8" },
    ).trim();
  } catch {
    const bytes = Buffer.from(content, "utf8");
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
  }
}

function read(relativePath: string): string {
  const absolute = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`missing file: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

const failures: string[] = [];
const checked: Record<string, { expected: string; actual: string; pass: boolean }> = {};

for (const [relativePath, expected] of Object.entries(LOCKED_BLOBS)) {
  try {
    const actual = gitBlobSha(read(relativePath), relativePath);
    const pass = actual === expected;
    checked[relativePath] = { expected, actual, pass };
    if (!pass) failures.push(`LOCK_DRIFT: ${relativePath} expected ${expected} got ${actual}`);
  } catch (error) {
    failures.push(`LOCK_READ_FAILURE: ${relativePath}: ${String(error)}`);
  }
}

for (const [name, relativePath, marker] of MARKERS) {
  try {
    if (!read(relativePath).includes(marker)) failures.push(`CONTRACT_FAILURE: ${name} missing marker in ${relativePath}`);
  } catch {}
}

const moduleCount = ALL_MODULE_KEYS.length;
const submenuGroups = Object.values(MODULE_MANIFESTS).reduce((count, manifest) =>
  count + manifest.sidebar.filter((item) => typeof item !== "string" && Array.isArray(item.subItems)).length, 0);
const subitemCount = Object.values(MODULE_MANIFESTS).reduce((count, manifest) =>
  count + manifest.sidebar.reduce((total, item) =>
    total + (typeof item === "string" ? 0 : (item.subItems?.length || 0)), 0), 0);

if (moduleCount !== EXPECTED_MODULE_COUNT) failures.push(`MANIFEST_DRIFT: expected ${EXPECTED_MODULE_COUNT} modules, got ${moduleCount}`);
if (submenuGroups !== EXPECTED_SUBMENU_GROUPS) failures.push(`MANIFEST_DRIFT: expected ${EXPECTED_SUBMENU_GROUPS} submenu groups, got ${submenuGroups}`);
if (subitemCount !== EXPECTED_SUBITEM_COUNT) failures.push(`MANIFEST_DRIFT: expected ${EXPECTED_SUBITEM_COUNT} nested sidebar sub-items, got ${subitemCount}`);

const result = {
  lockId: LOCK_ID,
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  lockedFiles: Object.keys(LOCKED_BLOBS).length,
  moduleCount,
  submenuGroups,
  subitemCount,
  failures,
  checked,
  generatedAt: new Date().toISOString()
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);
console.log(`NAVIGATION PRODUCTION LOCK: PASS — ${LOCK_ID}`);
