import * as fs from "fs";
import * as path from "path";

interface VersionCheckResult {
  file: string;
  version: string;
  expected: string;
  valid: boolean;
}

function certifyVersionSync(expectedVersion: string): boolean {
  console.log("\n========================================================================");
  console.log(" VERSION SYNCHRONIZATION CERTIFICATION                                ");
  console.log("========================================================================\n");

  const results: VersionCheckResult[] = [];
  let allValid = true;

  // Check root package.json
  const rootPkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
  const rootVersion = rootPkg.version;
  const rootValid = rootVersion === expectedVersion;
  results.push({ file: "package.json (root)", version: rootVersion, expected: expectedVersion, valid: rootValid });
  if (!rootValid) allValid = false;

  // Check all workspace packages
  const workspaceDirs = ["apps", "packages"];
  for (const dir of workspaceDirs) {
    const fullDir = path.resolve(process.cwd(), dir);
    if (fs.existsSync(fullDir)) {
      const subdirs = fs.readdirSync(fullDir);
      for (const sub of subdirs) {
        const pkgFile = path.resolve(fullDir, sub, "package.json");
        if (fs.existsSync(pkgFile)) {
          const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
          const version = pkg.version;
          const valid = version === expectedVersion;
          results.push({
            file: `${dir}/${sub}/package.json`,
            version,
            expected: expectedVersion,
            valid,
          });
          if (!valid) allValid = false;

          // Check internal dependencies
          const depsToCheck = [
            ...(pkg.dependencies ? Object.entries(pkg.dependencies).filter(([k]) => k.startsWith("@kwakopos2/")) : []),
            ...(pkg.devDependencies ? Object.entries(pkg.devDependencies).filter(([k]) => k.startsWith("@kwakopos2/")) : []),
          ];

          for (const [depName, depVersion] of depsToCheck) {
            const depValid = depVersion === expectedVersion;
            results.push({
              file: `${dir}/${sub}/package.json → ${depName}`,
              version: String(depVersion),
              expected: expectedVersion,
              valid: depValid,
            });
            if (!depValid) allValid = false;
          }
        }
      }
    }
  }

  // Print results
  console.log(`Expected Version: ${expectedVersion}\n`);
  for (const result of results) {
    const icon = result.valid ? "✅" : "❌";
    const status = result.valid ? "PASS" : "FAIL";
    console.log(`${icon} [${status}] ${result.file}`);
    if (!result.valid) {
      console.log(`        Expected: ${result.expected}, Got: ${result.version}`);
    }
  }

  console.log("\n========================================================================");
  const passCount = results.filter(r => r.valid).length;
  const totalCount = results.length;

  if (allValid) {
    console.log(` ✅ VERSION CERTIFICATION PASSED: ${passCount}/${totalCount} checks passed`);
    console.log("========================================================================\n");
    return true;
  } else {
    console.log(` ❌ VERSION CERTIFICATION FAILED: ${passCount}/${totalCount} checks passed`);
    console.log("\n 🔧 FIX: Run 'npm run release:sync-versions' to synchronize all packages");
    console.log("========================================================================\n");
    return false;
  }
}

if (require.main === module) {
  const expectedVersion = process.argv[2];
  if (!expectedVersion) {
    console.error("\n❌ Usage: tsx certify-version-sync.ts <expected-version>\n");
    process.exit(1);
  }
  const passed = certifyVersionSync(expectedVersion);
  process.exit(passed ? 0 : 1);
}

export { certifyVersionSync };
