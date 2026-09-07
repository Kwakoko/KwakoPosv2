import * as fs from "fs";
import * as path from "path";

function findWorkspacePackages(): string[] {
  const results: string[] = [];
  const root = process.cwd();
  for (const dir of ["apps", "packages"]) {
    const fullDir = path.join(root, dir);
    if (fs.existsSync(fullDir)) {
      const subdirs = fs.readdirSync(fullDir);
      for (const sub of subdirs) {
        const pkgFile = path.join(dir, sub, "package.json");
        if (fs.existsSync(path.join(root, pkgFile))) {
          results.push(pkgFile);
        }
      }
    }
  }
  return results;
}

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

  // Resolve target version from authoritative release-manifest.json, falling back to root package.json
  let version = targetVersion;
  try {
    const releaseManifestPath = path.resolve(process.cwd(), "release-manifest.json");
    let releaseManifest: any = null;
    if (fs.existsSync(releaseManifestPath)) {
      try {
        releaseManifest = JSON.parse(fs.readFileSync(releaseManifestPath, "utf8"));
        version = version || releaseManifest?.appVersion || releaseManifest?.version;
      } catch { /* ignore */ }
    }

    const rootPkgPath = path.resolve(process.cwd(), "package.json");
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
    version = version || rootPkg.version;

    if (!version) {
      errors.push("No version found in release-manifest.json or root package.json and no target version provided.");
      return { status: "FAILED", targetVersion: version || "unknown", totalFiles: 0, updated, skipped, errors, timestamp: new Date().toISOString() };
    }

    if (rootPkg.version !== version) {
      const prev = rootPkg.version;
      rootPkg.version = version;
      fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n", "utf8");
      updated.push(`package.json (${prev} → ${version})`);
      console.log(` ✓ [UPDATE] package.json: ${prev} → ${version}`);
    }

    if (releaseManifest && releaseManifest.version !== version) {
      releaseManifest.version = version;
      releaseManifest.tag = `v${version}`;
      fs.writeFileSync(releaseManifestPath, JSON.stringify(releaseManifest, null, 2) + "\n", "utf8");
      updated.push(`release-manifest.json (${releaseManifest.version} → ${version})`);
      console.log(` ✓ [UPDATE] release-manifest.json: ${version}`);
    }

    console.log(`[TARGET] Target Version: ${version}`);
    console.log(`[INFO] Scanning workspace packages...`);

    // Find all package.json files in apps/* and packages/* directories
    const packageFiles = findWorkspacePackages();

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
              if (pkg.dependencies[depName] === currentVersion || /^(2\.[0-9]+\.[0-9]+|\^2\..*|~2\..*)/.test(pkg.dependencies[depName])) {
                pkg.dependencies[depName] = version;
              }
            }
          }
        }

        // Update devDependencies
        if (pkg.devDependencies) {
          for (const depName in pkg.devDependencies) {
            if (depName.startsWith("@kwakopos2/")) {
              if (pkg.devDependencies[depName] === currentVersion || /^(2\.[0-9]+\.[0-9]+|\^2\..*|~2\..*)/.test(pkg.devDependencies[depName])) {
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
  if (result.status !== "SUCCESS") {
    console.error("Release version synchronization failed; refusing to continue.");
    process.exit(1);
  }
  process.exit(0);
}
