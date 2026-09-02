import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface CategorizedCommits {
  breaking: string[];
  features: string[];
  fixes: string[];
  perf: string[];
  refactor: string[];
  docs: string[];
  chore: string[];
}

export function generateReleaseNotes(targetVersion?: string): { markdown: string; version: string; releaseDate: string } {
  console.log("========================================================================");
  console.log(" KWAKOPOS 2.0 AUTOMATED RELEASE NOTES & CHANGELOG GENERATOR             ");
  console.log("========================================================================");

  const rootPkgPath = path.resolve(process.cwd(), "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const version = targetVersion || rootPkg.version || "2.5.1";
  const releaseDate = new Date().toISOString().split("T")[0];

  let baselineTag = "";
  let commitMessages: string[] = [];

  try {
    baselineTag = execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
  } catch {
    baselineTag = "";
  }

  const range = baselineTag ? `${baselineTag}..HEAD` : "HEAD~30..HEAD";
  console.log(`[INFO] Generating release notes for v${version} (${range})`);

  try {
    const rawLog = execSync(`git log ${range} --pretty=format:"%s"`, { encoding: "utf8" });
    commitMessages = rawLog
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    commitMessages = [];
  }

  const categories: CategorizedCommits = {
    breaking: [],
    features: [],
    fixes: [],
    perf: [],
    refactor: [],
    docs: [],
    chore: [],
  };

  for (const msg of commitMessages) {
    if (msg.includes("!") || msg.includes("BREAKING CHANGE")) {
      categories.breaking.push(msg);
    } else if (/^feat/i.test(msg)) {
      categories.features.push(msg);
    } else if (/^fix/i.test(msg)) {
      categories.fixes.push(msg);
    } else if (/^perf/i.test(msg)) {
      categories.perf.push(msg);
    } else if (/^refactor/i.test(msg)) {
      categories.refactor.push(msg);
    } else if (/^docs/i.test(msg)) {
      categories.docs.push(msg);
    } else {
      categories.chore.push(msg);
    }
  }

  const lines: string[] = [];
  lines.push(`# Release Notes - KwakoPos v${version} (${releaseDate})\n`);

  if (categories.breaking.length > 0) {
    lines.push("### 💥 Breaking Changes");
    categories.breaking.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (categories.features.length > 0) {
    lines.push("### 🚀 Features");
    categories.features.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (categories.fixes.length > 0) {
    lines.push("### 🐛 Bug Fixes");
    categories.fixes.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (categories.perf.length > 0) {
    lines.push("### ⚡ Performance Improvements");
    categories.perf.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (categories.refactor.length > 0) {
    lines.push("### 🛠 Refactoring & Architecture");
    categories.refactor.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (categories.docs.length > 0) {
    lines.push("### 📚 Documentation");
    categories.docs.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (categories.chore.length > 0) {
    lines.push("### 🔧 Maintenance & Chores");
    categories.chore.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  const markdown = lines.join("\n");

  // Save to artifacts
  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "RELEASE_NOTES.md"), markdown, "utf8");

  // Prepend to root CHANGELOG.md
  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  let existingChangelog = "";
  if (fs.existsSync(changelogPath)) {
    existingChangelog = fs.readFileSync(changelogPath, "utf8");
  }

  const updatedChangelog = `${markdown}\n---\n\n${existingChangelog}`;
  fs.writeFileSync(changelogPath, updatedChangelog, "utf8");

  console.log(` ✓ Release notes generated for v${version} (${commitMessages.length} commits)`);
  console.log(` ✓ Updated ${changelogPath}`);
  console.log(` ✓ Wrote ${path.join(artifactDir, "RELEASE_NOTES.md")}`);
  console.log("========================================================================");

  return { markdown, version, releaseDate };
}

if (process.argv[1]?.endsWith("generate-release-notes.ts")) {
  const targetVer = process.argv[2];
  generateReleaseNotes(targetVer);
}
