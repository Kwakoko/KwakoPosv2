import { loadConfig, getReleaseIdentity, isValidSemVer } from "../../packages/config/src/index.js";
import * as fs from "fs";
import * as path from "path";

export interface VersionConsistencyCheckResult {
  passed: boolean;
  targetVersion: string;
  targetTag: string;
  checks: {
    packageJsonVersionValid: "PASS" | "FAIL";
    releaseManifestSynchronized: "PASS" | "FAIL";
    runtimeConfigSynchronized: "PASS" | "FAIL";
    liveEndpointSynchronized?: "PASS" | "FAIL";
  };
  errors: string[];
}

export async function runVersionConsistencyGate(targetUrl?: string): Promise<VersionConsistencyCheckResult> {
  console.log("========================================================================");
  console.log(" KWAKOPOS 2.0 VERSION CONSISTENCY & IDENTITY ENFORCEMENT GATE          ");
  console.log("========================================================================");

  const errors: string[] = [];
  const rootPkgPath = path.resolve(process.cwd(), "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const targetVersion = rootPkg.version;
  const targetTag = `v${targetVersion}`;

  console.log(`[TARGET] Target Authoritative Version: ${targetVersion} (Tag: ${targetTag})`);

  // 1. Validate package.json SemVer format
  const isSemVer = isValidSemVer(targetVersion);
  if (!isSemVer) {
    errors.push(`package.json version "${targetVersion}" is not valid SemVer.`);
  }

  // 2. Check release-manifest.json synchronization
  let manifestSync = false;
  const manifestPath = path.resolve(process.cwd(), "release-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.version === targetVersion && manifest.tag === targetTag) {
      manifestSync = true;
    } else {
      errors.push(
        `release-manifest.json drift: expected version ${targetVersion}, got ${manifest.version}`
      );
    }
  } else {
    // If not existing yet, create or warn
    errors.push("release-manifest.json does not exist. Must be generated before promotion.");
  }

  // 3. Check runtime config
  const config = loadConfig();
  const identity = getReleaseIdentity(config);
  const runtimeSync = identity.appVersion === targetVersion;
  if (!runtimeSync) {
    errors.push(`Runtime config drift: expected ${targetVersion}, got ${identity.appVersion}`);
  }

  // 4. Live endpoint check if URL provided
  let liveSync: "PASS" | "FAIL" | undefined = undefined;
  if (targetUrl) {
    try {
      const res = await fetch(`${targetUrl}/api/system/version`);
      if (res.ok) {
        const liveInfo: any = await res.json();
        if (liveInfo.appVersion === targetVersion || liveInfo.version === targetVersion) {
          liveSync = "PASS";
          console.log(` ✓ [4/4] Live Service /api/system/version matches ${targetVersion}: PASS`);
        } else {
          liveSync = "FAIL";
          errors.push(
            `Live service version drift: expected ${targetVersion}, got ${liveInfo.appVersion || liveInfo.version}`
          );
        }
      } else {
        liveSync = "FAIL";
        errors.push(`Failed to reach ${targetUrl}/api/system/version: HTTP ${res.status}`);
      }
    } catch (err: any) {
      liveSync = "FAIL";
      errors.push(`Error connecting to live endpoint ${targetUrl}: ${err.message}`);
    }
  }

  const checks: VersionConsistencyCheckResult["checks"] = {
    packageJsonVersionValid: isSemVer ? "PASS" : "FAIL",
    releaseManifestSynchronized: manifestSync ? "PASS" : "FAIL",
    runtimeConfigSynchronized: runtimeSync ? "PASS" : "FAIL",
  };
  if (liveSync) checks.liveEndpointSynchronized = liveSync;

  const passed = errors.length === 0;

  console.log(` [1/3] package.json valid SemVer: ${checks.packageJsonVersionValid}`);
  console.log(` [2/3] release-manifest.json synchronized: ${checks.releaseManifestSynchronized}`);
  console.log(` [3/3] Runtime config synchronized: ${checks.runtimeConfigSynchronized}`);

  if (passed) {
    console.log("========================================================================");
    console.log(` 🎉 VERSION CONSISTENCY GATE: 100% SUCCESS (${targetVersion})`);
    console.log("========================================================================");
  } else {
    console.error("========================================================================");
    console.error(` ❌ VERSION CONSISTENCY GATE FAILED:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error("========================================================================");
    if (!process.argv.includes("--test")) {
      process.exit(1);
    }
  }

  return { passed, targetVersion, targetTag, checks, errors };
}

if (process.argv[1]?.endsWith("version-consistency-gate.ts")) {
  const urlArg = process.argv.find((a) => a.startsWith("http"));
  runVersionConsistencyGate(urlArg);
}