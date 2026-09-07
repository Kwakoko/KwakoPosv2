import * as fs from "fs";
import * as path from "path";
import { loadAuthoritativeRelease, detectVersionDrift } from "../../packages/config/src/authoritativeRelease.js";

export function runVersionDriftGate(cwd?: string): { passed: boolean; errors: string[] } {
  const root = cwd || process.cwd();
  const errors: string[] = [];

  console.log("========================================================================");
  console.log(" KWAKOPOS AUTHORITATIVE RELEASE VERSION DRIFT DETECTION GATE            ");
  console.log("========================================================================");

  const release = loadAuthoritativeRelease(root);
  const authoritativeVersion = release.appVersion;
  console.log(`[INFO] Authoritative Release Target: v${authoritativeVersion} (${release.releaseId})`);

  // 1. Structural drift check
  const drift = detectVersionDrift(root);
  if (drift.hasDrift) {
    for (const m of drift.mismatches) {
      errors.push(`Version drift in ${m.target}: expected v${m.expectedVersion}, found v${m.foundVersion}`);
    }
  }

  // 2. Service Worker cache validation
  const swPath = path.join(root, "apps/web/public/sw.js");
  const expectedCacheName = `kwakopos-runtime-v${authoritativeVersion}`;
  if (fs.existsSync(swPath)) {
    const swContent = fs.readFileSync(swPath, "utf8");
    if (!swContent.includes(expectedCacheName)) {
      errors.push(`Service Worker cache name in apps/web/public/sw.js does not match expected "${expectedCacheName}"`);
    }
  } else {
    errors.push("apps/web/public/sw.js does not exist");
  }

  // 3. Scan critical source files for stale hardcoded release versions
  const criticalFiles = [
    "apps/web/src/versionManager.ts",
    "apps/web/src/context/KwakoPosContexts.tsx",
    "apps/web/src/layouts/SystemAppShellLayout.tsx",
    "apps/web/buildPwaAssets.ts",
    "apps/web/public/manifest.json",
    "apps/web/public/asset-manifest.json",
    "packages/config/src/authoritativeRelease.ts",
    "packages/config/src/index.ts",
  ];

  const stalePatterns = ['"2.5.0"', '"2.2.0"', "'2.5.0'", "'2.2.0'"];
  for (const rel of criticalFiles) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) {
      const text = fs.readFileSync(full, "utf8");
      for (const pattern of stalePatterns) {
        if (text.includes(pattern)) {
          errors.push(`Stale hardcoded version pattern ${pattern} detected in ${rel}`);
        }
      }
    }
  }

  if (errors.length === 0) {
    console.log(` ✓ [PASS] Zero version drift detected. All packages, runtime, and assets bound to v${authoritativeVersion}`);
    console.log("========================================================================");
    return { passed: true, errors: [] };
  } else {
    console.error(` ✗ [FAIL] Version drift detected (${errors.length} errors):`);
    for (const err of errors) console.error(`   - ${err}`);
    console.log("========================================================================");
    return { passed: false, errors };
  }
}

if (process.argv[1]?.endsWith("version-drift-gate.ts")) {
  const res = runVersionDriftGate();
  process.exit(res.passed ? 0 : 1);
}
