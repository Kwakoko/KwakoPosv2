import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(command: string): string {
  return execSync(command, { encoding: "utf8" }).trim();
}

const root = path.resolve(process.cwd());
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lockJson = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

if (packageJson.version !== lockJson.version) {
  throw new Error(`VERSION_DRIFT: package.json=${packageJson.version} package-lock.json=${lockJson.version}`);
}

const tags = run("git tag --merged HEAD --sort=-v:refname")
  .split(/\r?\n/)
  .map((v) => v.trim())
  .filter((v) => /^v\d+\.\d+\.\d+$/.test(v));

if (tags.length === 0) throw new Error("RELEASE_RECOVERY_FAIL: no SemVer tag found on current history");

const latest = tags[0];
if (packageJson.version === latest.slice(1)) {
  const commits = Number(run(`git rev-list ${latest}..HEAD --count`));
  if (commits > 0) {
    throw new Error(`RELEASE_RECOVERY_FAIL: repository is ahead of ${latest} but package.json remains at ${packageJson.version}`);
  }
}

console.log(`RELEASE_RECOVERY_OK: authoritative version=${packageJson.version}, latestTag=${latest}`);
