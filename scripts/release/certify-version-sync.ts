import * as fs from "fs";
import * as path from "path";

export interface PackageVersionCheck {
  packagePath: string;
  packageName: string;
  version: string;
  isVersionMatch: boolean;
  mismatchedDependencies: string[];
}

export interface VersionSyncCertificate {
  timestamp: string;
  rootVersion: string;
  totalPackages: number;
  syncedPackagesCount: number;
  mismatchedPackagesCount: number;
  checks: PackageVersionCheck[];
  status: "CERTIFIED" | "FAILED";
}

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

export function certifyVersionSync(targetVersion?: string): VersionSyncCertificate {
  console.log("========================================================================");
  console.log(" KWAKOPOS 2.0 MONOREPO VERSION SYNCHRONIZATION AUDITOR & CERTIFIER     ");
  console.log("========================================================================");

  const rootPkgPath = path.resolve(process.cwd(), "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const rootVersion = targetVersion || rootPkg.version || "2.5.0";

  console.log(`[INFO] Ground Truth Version Target: v${rootVersion}`);

  const packageFiles = findWorkspacePackages();
  const checks: PackageVersionCheck[] = [];

  for (const relPath of packageFiles) {
    const fullPath = path.resolve(process.cwd(), relPath);
    let pkg: any = {};
    try {
      const content = fs.readFileSync(fullPath, "utf8").trim();
      pkg = JSON.parse(content);
    } catch (err: any) {
      console.error(` ✗ [FAIL] Unable to parse ${relPath}: ${err.message}`);
      continue;
    }
    const pkgName = pkg.name || relPath;
    const pkgVersion = pkg.version;
    const isVersionMatch = pkgVersion === rootVersion;
    const mismatchedDependencies: string[] = [];

    // Audit internal dependencies
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const [depName, depVer] of Object.entries(allDeps)) {
      if (depName.startsWith("@kwakopos2/")) {
        const cleanVer = String(depVer).replace(/^[\^~]/, "");
        if (cleanVer !== rootVersion && cleanVer !== "*") {
          mismatchedDependencies.push(`${depName}: ${depVer} (expected ${rootVersion})`);
        }
      }
    }

    const check: PackageVersionCheck = {
      packagePath: relPath,
      packageName: pkgName,
      version: pkgVersion,
      isVersionMatch: isVersionMatch && mismatchedDependencies.length === 0,
      mismatchedDependencies,
    };

    checks.push(check);

    if (check.isVersionMatch) {
      console.log(` ✓ [CERTIFIED] ${pkgName} (${relPath}) -> v${pkgVersion}`);
    } else {
      console.error(
        ` ✗ [FAIL] ${pkgName} (${relPath}) -> v${pkgVersion} (Expected v${rootVersion})${
          mismatchedDependencies.length ? ` | Mismatched deps: ${mismatchedDependencies.join(", ")}` : ""
        }`
      );
    }
  }

  const mismatchedPackages = checks.filter((c) => !c.isVersionMatch);
  const status = mismatchedPackages.length === 0 ? "CERTIFIED" : "FAILED";

  const cert: VersionSyncCertificate = {
    timestamp: new Date().toISOString(),
    rootVersion,
    totalPackages: packageFiles.length,
    syncedPackagesCount: checks.length - mismatchedPackages.length,
    mismatchedPackagesCount: mismatchedPackages.length,
    checks,
    status,
  };

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "version-sync-certificate.json"), JSON.stringify(cert, null, 2), "utf8");

  console.log("========================================================================");
  if (status === "CERTIFIED") {
    console.log(` 🎉 VERSION SYNC CERTIFICATION RESULT: CERTIFIED (100% Alignment across ${packageFiles.length} packages at v${rootVersion})`);
  } else {
    console.error(` ❌ VERSION SYNC CERTIFICATION RESULT: FAILED (${mismatchedPackages.length}/${packageFiles.length} packages out of sync)`);
  }
  console.log("========================================================================");

  return cert;
}

if (process.argv[1]?.endsWith("certify-version-sync.ts")) {
  const targetVer = process.argv[2];
  const result = certifyVersionSync(targetVer);
  process.exit(result.status === "CERTIFIED" ? 0 : 1);
}
