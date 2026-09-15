import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  AUTHORITATIVE_BRAND_HIERARCHY,
  validateBrandIntegrity,
  getAuthoritativeBrandIdentity,
} from "../../packages/config/src/brandHierarchy.js";
import { KWAKOKO_BRAND_POSITIONING } from "../../packages/config/src/brandPositioning.js";
import { KWAKOKO_BRAND_VOICE } from "../../packages/config/src/brandVoice.js";

export interface BrandVerificationResult {
  passed: boolean;
  totalFilesScanned: number;
  violationsFound: number;
  filesWithViolations: string[];
  details: Array<{
    file: string;
    line?: number;
    prohibitedTerm: string;
    correction: string;
    reason: string;
  }>;
}

const CRITICAL_FILES_TO_SCAN = [
  "apps/web/index.html",
  "apps/web/public/manifest.json",
  "apps/web/buildPwaAssets.ts",
  "release-manifest.json",
  "README.md",
  "apps/web/src/components/WorkspaceLoadingScreen.tsx",
  "apps/web/src/pages/LoginPage.tsx",
  "apps/web/src/i18n/locales/en/index.ts",
  "apps/web/src/i18n/locales/sw/index.ts",
  "apps/web/src/i18n/locales/fr/index.ts",
  "packages/domain/src/legalGovernanceEngine.ts",
  "packages/database/src/legalRepositories.ts",
];

const REPOSITORY_EXCLUSIONS = new Set([
  "CHANGELOG.md",
  "AI-CODE-AUDIT-REPORT.md",
  "packages/config/src/brandHierarchy.ts",
  "tests/unit/brand-hierarchy-governance.test.ts",
  "tests/unit/koko-brand-governance.test.ts",
]);

const ACTIVE_EXTENSIONS = /\.(ts|tsx|js|jsx|json|md|html|css|yml|yaml)$/i;

export function runBrandIntegrityVerification(cwd?: string): BrandVerificationResult {
  const root = cwd || process.cwd();
  const violations: BrandVerificationResult["details"] = [];
  const filesWithViolations = new Set<string>();
  let filesScanned = 0;

  const brand = getAuthoritativeBrandIdentity();
  if (brand.masterBrand !== "Kwakoko") {
    throw new Error(`BRAND_FATAL: Master brand must be Kwakoko, got: ${brand.masterBrand}`);
  }
  if (brand.flagshipPlatform !== "Kwakoko Business Operating System") {
    throw new Error(`BRAND_FATAL: Flagship platform must be Kwakoko Business Operating System, got: ${brand.flagshipPlatform}`);
  }
  if (brand.posCapability !== "KwakoPos") {
    throw new Error(`BRAND_FATAL: POS capability must be KwakoPos, got: ${brand.posCapability}`);
  }

  if (KWAKOKO_BRAND_POSITIONING.category !== "Business Operating System") {
    throw new Error("BRAND_FATAL: canonical positioning category drift detected");
  }
  if (KWAKOKO_BRAND_POSITIONING.masterBrand !== "Kwakoko") {
    throw new Error("BRAND_FATAL: positioning master brand drift detected");
  }
  if (KWAKOKO_BRAND_POSITIONING.platform !== "Kwakoko Business Operating System") {
    throw new Error("BRAND_FATAL: positioning platform drift detected");
  }

  if (KWAKOKO_BRAND_VOICE.version !== "1.0.0") {
    throw new Error(`BRAND_FATAL: voice specification version drift detected: ${KWAKOKO_BRAND_VOICE.version}`);
  }
  if (!KWAKOKO_BRAND_VOICE.voice.core.includes("professional") || !KWAKOKO_BRAND_VOICE.voice.core.includes("clear")) {
    throw new Error("BRAND_FATAL: canonical professional voice characteristics are incomplete");
  }
  if (KWAKOKO_BRAND_VOICE.localization.sourceLanguage !== "en" || JSON.stringify(KWAKOKO_BRAND_VOICE.localization.supportedLanguages) !== JSON.stringify(["en", "sw", "fr"])) {
    throw new Error("BRAND_FATAL: supported voice localization languages drift detected");
  }
  if (KWAKOKO_BRAND_VOICE.terminology.preferred.platform !== "Kwakoko Business Operating System" || KWAKOKO_BRAND_VOICE.terminology.preferred.pos !== "KwakoPos") {
    throw new Error("BRAND_FATAL: canonical customer-facing terminology drift detected");
  }
  if (!KWAKOKO_BRAND_VOICE.prohibitedClaims.includes("100% secure") || !KWAKOKO_BRAND_VOICE.prohibitedClaims.includes("zero downtime")) {
    throw new Error("BRAND_FATAL: prohibited-claims safety baseline is incomplete");
  }
  if (!KWAKOKO_BRAND_VOICE.governance.noOverclaimRule.toLowerCase().includes("verified capabilities")) {
    throw new Error("BRAND_FATAL: voice no-overclaim governance rule missing");
  }

  function scanFile(relPath: string): void {
    const fullPath = path.resolve(root, relPath);
    if (!fs.existsSync(fullPath)) return;
    filesScanned++;
    const result = validateBrandIntegrity(fs.readFileSync(fullPath, "utf8"), relPath);
    if (!result.valid) {
      filesWithViolations.add(relPath);
      violations.push(...result.violations.map((v) => ({
        file: relPath,
        line: v.line,
        prohibitedTerm: v.prohibitedTerm,
        correction: v.correction,
        reason: v.reason,
      })));
    }
  }

  for (const relPath of CRITICAL_FILES_TO_SCAN) scanFile(relPath);

  const manifestPath = path.resolve(root, "apps/web/public/manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.name !== AUTHORITATIVE_BRAND_HIERARCHY.flagshipPlatform.name) {
      filesWithViolations.add("apps/web/public/manifest.json");
      violations.push({
        file: "apps/web/public/manifest.json",
        prohibitedTerm: manifest.name,
        correction: AUTHORITATIVE_BRAND_HIERARCHY.flagshipPlatform.name,
        reason: "manifest.json name must match flagship platform name",
      });
    }
    if (manifest.short_name !== AUTHORITATIVE_BRAND_HIERARCHY.flagshipPlatform.shortName) {
      filesWithViolations.add("apps/web/public/manifest.json");
      violations.push({
        file: "apps/web/public/manifest.json",
        prohibitedTerm: manifest.short_name,
        correction: AUTHORITATIVE_BRAND_HIERARCHY.flagshipPlatform.shortName,
        reason: "manifest.json short_name must match flagship platform shortName",
      });
    }
  }

  const releaseManifestPath = path.resolve(root, "release-manifest.json");
  if (fs.existsSync(releaseManifestPath)) {
    const rm = JSON.parse(fs.readFileSync(releaseManifestPath, "utf8"));
    if (rm.brand?.parentBrand !== "Kwakoko" || rm.brand?.platform !== "Kwakoko Business Operating System") {
      filesWithViolations.add("release-manifest.json");
      violations.push({
        file: "release-manifest.json",
        prohibitedTerm: JSON.stringify(rm.brand),
        correction: "parentBrand: Kwakoko, platform: Kwakoko Business Operating System",
        reason: "release-manifest.json brand metadata does not conform to authoritative hierarchy",
      });
    }
  }

  const trackedOutput = execSync("git ls-files -z", { cwd: root, encoding: "utf8" });
  for (const relPath of trackedOutput.split("\0").filter(Boolean)) {
    if (REPOSITORY_EXCLUSIONS.has(relPath)) continue;
    if (/^(dist|artifacts)\//.test(relPath)) continue;
    if (!ACTIVE_EXTENSIONS.test(relPath)) continue;
    const fullPath = path.resolve(root, relPath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    filesScanned++;
    const result = validateBrandIntegrity(fs.readFileSync(fullPath, "utf8"), relPath);
    if (!result.valid) {
      filesWithViolations.add(relPath);
      violations.push(...result.violations.map((v) => ({
        file: relPath,
        line: v.line,
        prohibitedTerm: v.prohibitedTerm,
        correction: v.correction,
        reason: v.reason,
      })));
    }
  }

  return {
    passed: violations.length === 0,
    totalFilesScanned: filesScanned,
    violationsFound: violations.length,
    filesWithViolations: Array.from(filesWithViolations),
    details: violations,
  };
}
if (process.argv[1]?.endsWith("verify-brand-integrity.ts")) {
  console.log("========================================================================");
  console.log(" KWAKOKO BRAND ARCHITECTURE & INTEGRITY VERIFICATION                    ");
  console.log("========================================================================");
  const result = runBrandIntegrityVerification();
  console.log(`Files Scanned:        ${result.totalFilesScanned}`);
  console.log(`Violations Detected:  ${result.violationsFound}`);
  if (result.passed) {
    console.log("Status:               [PASS] Brand Hierarchy Fully Verified");
    console.log("========================================================================");
    process.exit(0);
  }
  console.error("Status:               [FAIL] Conflicting or Obsolete Brand Terms Found!");
  for (const detail of result.details) {
    console.error(`  - [${detail.file}:${detail.line || "?"}] ${detail.prohibitedTerm} -> ${detail.correction}`);
  }
  console.log("========================================================================");
  process.exit(1);
}
