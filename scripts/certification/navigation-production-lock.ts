import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ALL_MODULE_KEYS, MODULE_MANIFESTS } from "../../apps/web/src/modules/moduleRegistry.js";

const LOCK_ID = "NAVIGATION-PRODUCTION-LOCK-2026-10-03";
const EXPECTED_MODULE_COUNT = 32;
const EXPECTED_SUBMENU_GROUPS = 126;
const EXPECTED_SUBITEM_COUNT = 659;

const LOCKED_BLOBS: Record<string, string> = {
  "package.json": "490b7fd6ec428e77f1e2f48c8375856b1bac0eec",
  "apps/web/src/App.tsx": "863d4a8c295bc1ef9659e77723ee3d311729311c",
  "apps/web/src/modules/moduleRegistry.ts": "33955eb09c8940a45471b64fa980a966da7e11c2",
  "apps/web/src/pages/VerticalCommandCenterPage.tsx": "dc932c2adf63194e6af11ed340be7ba43f9d498f",
  "apps/web/src/pages/DashboardPage.tsx": "ff7cb0795e1684016c8960245c0737c61e2271dd",
  "apps/web/src/pages/InventoryPage.tsx": "a0d3c963e73dca1ccf63ce23c73ac30112be5b16",
  "apps/web/src/pages/PurchasingPage.tsx": "07e34d92a282c0172a7a9b3cf8e7f20b2a321d39",
  "apps/web/src/pages/ReportsPage.tsx": "4c66a81a465479ddd35cad56005002d73b99772b",
  "apps/web/src/pages/SettingsPage.tsx": "ce3542534d5b4f7db09ad5b29aa75483cbb28975",
  "apps/web/src/pages/CashDrawerPage.tsx": "71439a29b8c2ae894f3fe6a7ca97c44f2c1795a2",
  "apps/web/src/pages/ReceiptsPage.tsx": "406a4daffd312c1a418dec0cb9f35e6bda88be52",
  ".github/workflows/production-certification.yml": "b2975b7a3331cd0687531e623b57e80bba233850",
  ".github/workflows/production-release-exact-main.yml": "b7760cbb879d6fd829836066bb34e4542abea225",
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
