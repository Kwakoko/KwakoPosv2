import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DIST_DIR = join(process.cwd(), "dist");
const BUDGET_FILE = join(process.cwd(), "..", "..", "scripts", "release", "bundle-budget.json");
const WARNING_KB = 500;
const REQUIRED_SPLIT_KB = 750;
const HARD_LIMIT_KB = 1024;

type BudgetConfig = { exemptions?: Record<string, { reason: string }> };
const config = JSON.parse(await readFile(BUDGET_FILE, "utf8")) as BudgetConfig;
const exemptions = config.exemptions ?? {};
const assets = await readdir(join(DIST_DIR, "assets"));
const rows = await Promise.all(assets.filter((name) => name.endsWith(".js")).map(async (name) => ({
  name,
  bytes: (await readFile(join(DIST_DIR, "assets", name))).byteLength,
})));
rows.sort((a, b) => b.bytes - a.bytes);
let failed = false;
for (const row of rows) {
  const kb = row.bytes / 1024;
  const label = kb > HARD_LIMIT_KB ? "RELEASE BLOCK" : kb > REQUIRED_SPLIT_KB ? "SPLIT REQUIRED" : kb > WARNING_KB ? "INVESTIGATE" : "OK";
  if (kb > REQUIRED_SPLIT_KB) {
    const logicalName = row.name.replace(/-[A-Za-z0-9_-]+(?=\.js$)/, "");
    const exemption = exemptions[row.name] ?? exemptions[logicalName];
    if (exemption?.reason) console.warn(`[bundle-budget] ${label} ${row.name}: ${kb.toFixed(1)} KB - EXEMPT: ${exemption.reason}`);
    else { console.error(`[bundle-budget] ${label} ${row.name}: ${kb.toFixed(1)} KB - no exemption recorded`); failed = true; }
  } else console.log(`[bundle-budget] ${label} ${row.name}: ${kb.toFixed(1)} KB`);
}
if (failed) {
  console.error(`Bundle budget failed. Chunks above ${REQUIRED_SPLIT_KB} KB must be split or explicitly justified in scripts/release/bundle-budget.json.`);
  process.exit(1);
}
console.log(`[bundle-budget] PASS - ${rows.length} JavaScript chunks evaluated.`);
