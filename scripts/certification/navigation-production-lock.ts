import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ALL_MODULE_KEYS, MODULE_MANIFESTS } from "../../apps/web/src/modules/moduleRegistry.js";

const LOCK_ID = "NAVIGATION-PRODUCTION-LOCK-2026-09-28";
const EXPECTED_MODULE_COUNT = 32;
const EXPECTED_SUBMENU_GROUPS = 126;
const EXPECTED_SUBITEM_COUNT = 657;

const LOCKED_BLOBS: Record<string, string> = {
  "package.json": "7872485194ed7be975b6c3659604795f88dca244",
  "apps/web/src/App.tsx": "c46e1d017062bd772c7a93091f098dac4c3fda31",
  "apps/web/src/modules/moduleRegistry.ts": "176d66bdd3ef031789ee41f9007cdadf2c6b735d",
  "apps/web/src/pages/VerticalCommandCenterPage.tsx": "a84cb792a6e58d57862481f6e7adda9f991f4ca3",
  "apps/web/src/pages/InventoryPage.tsx": "6ddee4fbcf44b747a8791248d95a7207cbeb949a",
  "apps/web/src/pages/PurchasingPage.tsx": "f1c593ec73ae9c7575c74089f15209f7107ce7d2",
  "apps/web/src/pages/ReportsPage.tsx": "b6f51960d14208eff7881c0110f031e6d912e833",
  "apps/web/src/pages/SettingsPage.tsx": "ba8b71090ff11b4c502d54defae8f3718b2d9a54",
  "apps/web/src/pages/CashDrawerPage.tsx": "43694902eabe22b60741b64ee871b3f42ed54cb7",
  "apps/web/src/pages/ReceiptsPage.tsx": "2b0c0e79245f6f2d5bf1acdfa26009f4d807c5ba",
  ".github/workflows/locked-release-engine.yml": "e44d5cdf16f0adddef66d784c675c5c062659eb9",
  ".github/workflows/production-certification.yml": "9034050784a1d88fe6c04348c1d9189e0a0e2ad8",
  ".github/workflows/production-release-certification.yml": "9ce19a43c1e35f22bf3b78536c747f9d78f4defa"
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
  ["locked-release-hook", ".github/workflows/locked-release-engine.yml", "npm run certify:navigation-lock"],
  ["candidate-certification-hook", ".github/workflows/production-certification.yml", "npm run certify:navigation-lock"],
  ["exact-production-release-hook", ".github/workflows/production-release-certification.yml", "npm run certify:navigation-lock"]
];

function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
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
    const actual = gitBlobSha(read(relativePath));
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
