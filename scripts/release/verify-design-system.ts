import * as fs from "fs";
import * as path from "path";
import { KWAKOKO_DESIGN_SYSTEM } from "../../packages/config/src/designSystem.js";

const ROOT = process.cwd();
const CSS = path.resolve(ROOT, "apps/web/src/styles.css");
const requiredTokens = [
  "--kwakoko-forest", "--kwakoko-deep", "--koko-gold", "--koko-sand",
  "--kwakoko-cloud", "--kwakoko-ink", "--kwakoko-slate", "--kwakoko-signal-blue",
  "--kwakoko-success", "--kwakoko-warning", "--kwakoko-danger",
];
const requiredClasses = [".v2-card", ".v2-btn", ".v2-btn-primary", ".v2-btn-secondary", ".v2-btn-ghost", ".badge"];

function fail(message: string): never {
  console.error(`DESIGN_SYSTEM_FATAL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(CSS)) fail("canonical web stylesheet is missing");
const css = fs.readFileSync(CSS, "utf8");

for (const token of requiredTokens) if (!css.includes(token)) fail(`missing canonical token ${token}`);
for (const selector of requiredClasses) if (!css.includes(selector)) fail(`missing governed component selector ${selector}`);

if (!css.includes(":focus-visible")) fail("keyboard focus-visible rule is missing");
if (!css.includes("prefers-reduced-motion")) fail("reduced-motion accessibility rule is missing");
if (KWAKOKO_DESIGN_SYSTEM.foundations.minimumTouchTargetPx !== 44) fail("minimum touch target baseline drifted");
if (!KWAKOKO_DESIGN_SYSTEM.governance.designSystemIsSourceOfTruth) fail("design system source-of-truth flag is disabled");

console.log("====================================================================");
console.log(" KWAKOKO DESIGN SYSTEM & COMPONENT GOVERNANCE VERIFICATION");
console.log("====================================================================");
console.log(`Canonical Version:    ${KWAKOKO_DESIGN_SYSTEM.version}`);
console.log(`Required Tokens:      ${requiredTokens.length}`);
console.log(`Required Components:  ${KWAKOKO_DESIGN_SYSTEM.components.required.length}`);
console.log("Accessibility Gates:  PASS");
console.log("Status:               [PASS]");
console.log("Certificate:           KWAKOKO-DESIGN-SYSTEM-CERTIFICATE-v1.0");
console.log("====================================================================");
