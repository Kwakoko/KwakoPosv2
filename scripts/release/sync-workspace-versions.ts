import * as fs from "fs";
import * as path from "path";
import { globSync } from "glob";

export interface VersionSyncResult {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  targetVersion: string;
  totalFiles: number;
  updated: string[];
  skipped: string[];
  errors: string[];
  timestamp: string;
}

export function syncWorkspaceVersions(targetVersion?: string): VersionSyncResult {
  console.log("========================================================================");
  console.log(" KWAKOPOS 2.0 WORKSPACE VERSION SYNCHRONIZATION TOOL                   ");
  console.log("========================================================================");

  const errors: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  // Resolve target version from root package.json
  let version = targetVersion;
  try {
    const rootPkgPath = path.resolve(process.cwd(), "package.json");
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
    version = version || rootPkg.version;

    if (!version) {
      errors.push("No version found in root package.json and no target version provided.");
      return { status: "FAILED", targetVersion: version || "unknown", totalFiles: 0, updated, skipped, errors, timestamp: new Date().toISOString() };
    }

    console.log(`[TARGET] Target Version: ${version}`);
    console.log(`[INFO] Scanning workspace packages...`);

    // Find all package.json files in apps/* and packages/* directories
    const patterns = ["apps/*/package.json", "packages/*/package.json"];
    const packageFiles = patterns.flatMap((pattern) => globSync(pattern, { cwd: process.cwd() }));

    console.log(`[INFO] Found ${packageFiles.length} workspace package.json files`);

    for (const relPath of packageFiles) {
      try {
        const fullPath = path.resolve(process.cwd(), relPath);
        const pkg = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        const currentVersion = pkg.version;

        if (currentVersion === version) {
          skipped.push(`${relPath} (already v${version})`);
          console.log(` ✓ [SKIP] ${relPath}: already v${version}`);
          continue;
        }

        // Update version
        pkg.version = version;

        // Update workspace dependency versions
        if (pkg.dependencies) {
          for (const depName in pkg.dependencies) {
            if (depName.startsWith("@kwakopos2/")) {
              // Check if this is a workspace internal dependency
              if (pkg.dependencies[depName] === currentVersion || pkg.dependencies[depName].startsWith(currentVersion.split(".")[0])) {
                pkg.dependencies[depName] = version;
              }
            }
          }
        }

        // Update devDependencies
        if (pkg.devDependencies) {
          for (const depName in pkg.devDependencies) {
            if (depName.startsWith("@kwakopos2/")) {
              if (pkg.devDependencies[depName] === currentVersion || pkg.devDependencies[depName].startsWith(currentVersion.split(".")[0])) {
                pkg.devDependencies[depName] = version;
              }
            }
          }
        }

        // Write back
        fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
        updated.push(`${relPath} (${currentVersion} → ${version})`);
        console.log(` ✓ [UPDATE] ${relPath}: ${currentVersion} → ${version}`);
      } catch (err: any) {
        const errorMsg = `Failed to process ${relPath}: ${err.message}`;
        errors.push(errorMsg);
        console.error(` ✗ [ERROR] ${errorMsg}`);
      }
    }

    // Also update package-lock.json if it exists
    const lockPath = path.resolve(process.cwd(), "package-lock.json");
    if (fs.existsSync(lockPath)) {
      try {
        const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        lock.version = version;

        // Update all packages in lockfile
        if (lock.packages) {
          for (const pkgKey in lock.packages) {
            const lockPkg = lock.packages[pkgKey];
            if (lockPkg.name?.startsWith("@kwakopos2/") || pkgKey === "") {
              lockPkg.version = version;
            }
          }
        }

        fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");
        updated.push("package-lock.json");
        console.log(` ✓ [UPDATE] package-lock.json: ${version}`);
      } catch (err: any) {
        errors.push(`Failed to update package-lock.json: ${err.message}`);
        console.error(` ✗ [ERROR] Failed to update package-lock.json: ${err.message}`);
      }
    }

    const status = errors.length === 0 ? "SUCCESS" : errors.length < packageFiles.length / 2 ? "PARTIAL" : "FAILED";

    console.log("========================================================================");
    if (status === "SUCCESS") {
      console.log(` 🎉 VERSION SYNC COMPLETE: ${updated.length} packages updated to ${version}`);
    } else if (status === "PARTIAL") {
      console.log(` ⚠️  VERSION SYNC PARTIAL: ${updated.length}/${packageFiles.length} updated (${errors.length} errors)`);
    } else {
      console.log(` ❌ VERSION SYNC FAILED: ${errors.length} errors`);
    }
    console.log("========================================================================");

    return {
      status,
      targetVersion: version,
      totalFiles: packageFiles.length,
      updated,
      skipped,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    const msg = `FATAL: ${err.message}`;
    errors.push(msg);
    console.error(`\n ❌ ${msg}\n`);
    return { status: "FAILED", targetVersion: version || "unknown", totalFiles: 0, updated, skipped, errors, timestamp: new Date().toISOString() };
  }
}

if (process.argv[1]?.endsWith("sync-workspace-versions.ts")) {
  const targetVersion = process.argv[2];
  const result = syncWorkspaceVersions(targetVersion);
  process.exit(result.status === "SUCCESS" ? 0 : 1);
}
