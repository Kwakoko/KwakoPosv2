import { parseConventionalCommit, isValidSemVer, ParsedCommit } from "../../packages/config/src/semverEngine.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface ExtendedChangelogSection {
  version: string;
  releaseDate: string;
  features: ParsedCommit[];
  improvements: ParsedCommit[];
  bugFixes: ParsedCommit[];
  securityUpdates: ParsedCommit[];
  performanceEnhancements: ParsedCommit[];
  databaseChanges: ParsedCommit[];
  apiChanges: ParsedCommit[];
  uiUxChanges: ParsedCommit[];
  breakingChanges: ParsedCommit[];
  migrationNotes: string[];
  contributors: string[];
}

export function getLatestGitTag(): string | null {
  try {
    return (
      execSync("git tag --merged HEAD --sort=-v:refname", { encoding: "utf8" })
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean)
        .filter(isValidSemVer)[0] || null
    );
  } catch {
    return null;
  }
}

export function getRawCommitsSince(tag: string | null): Array<{ hash: string; author: string; message: string }> {
  try {
    const formatStr = "%H|||%an|||%B---END_COMMIT---";
    const cmd = tag
      ? `git log ${tag}..HEAD --pretty=format:"${formatStr}"`
      : `git log -20 --pretty=format:"${formatStr}"`;
    const output = execSync(cmd, { encoding: "utf8" });

    return output
      .split("---END_COMMIT---")
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const [hash, author, message] = block.split("|||");
        return {
          hash: hash?.trim() || "HEAD",
          author: author?.trim() || "CI/CD Automator",
          message: message?.trim() || "",
        };
      });
  } catch {
    return [];
  }
}

export function categorizeExtendedCommits(
  version: string,
  rawCommits: Array<{ hash: string; author: string; message: string }>
): ExtendedChangelogSection {
  const dateStr = new Date().toISOString().split("T")[0];
  const section: ExtendedChangelogSection = {
    version,
    releaseDate: dateStr,
    features: [],
    improvements: [],
    bugFixes: [],
    securityUpdates: [],
    performanceEnhancements: [],
    databaseChanges: [],
    apiChanges: [],
    uiUxChanges: [],
    breakingChanges: [],
    migrationNotes: [],
    contributors: Array.from(new Set(rawCommits.map((c) => c.author).filter(Boolean))),
  };

  for (const item of rawCommits) {
    if (!item.message) continue;
    const parsed = parseConventionalCommit(item.message);

    if (parsed.isBreaking) {
      section.breakingChanges.push(parsed);
      section.migrationNotes.push(`Breaking change in ${parsed.scope || "core"}: ${parsed.subject}. Please refer to migration documentation.`);
    }

    const type = parsed.type.toLowerCase();
    const scope = (parsed.scope || "").toLowerCase();

    if (type === "feat") {
      if (scope.includes("ui") || scope.includes("ux") || scope.includes("web")) {
        section.uiUxChanges.push(parsed);
      } else if (scope.includes("api") || scope.includes("route") || scope.includes("endpoint")) {
        section.apiChanges.push(parsed);
      } else if (scope.includes("db") || scope.includes("prisma") || scope.includes("migration")) {
        section.databaseChanges.push(parsed);
      } else {
        section.features.push(parsed);
      }
    } else if (type === "fix") {
      section.bugFixes.push(parsed);
    } else if (type === "perf") {
      section.performanceEnhancements.push(parsed);
    } else if (type === "security") {
      section.securityUpdates.push(parsed);
    } else if (type === "refactor" || type === "style" || type === "chore") {
      section.improvements.push(parsed);
    } else if (scope.includes("db") || scope.includes("migration")) {
      section.databaseChanges.push(parsed);
    } else if (scope.includes("api")) {
      section.apiChanges.push(parsed);
    } else {
      section.improvements.push(parsed);
    }
  }

  return section;
}

export function formatChangelogSection(sec: ExtendedChangelogSection): string {
  let md = `## [${sec.version}] - ${sec.releaseDate}\n\n`;

  if (sec.breakingChanges.length > 0) {
    md += `### 🚨 Breaking Changes\n`;
    sec.breakingChanges.forEach((c) => {
      md += `- **${c.scope || "core"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.features.length > 0) {
    md += `### ✨ New Features\n`;
    sec.features.forEach((c) => {
      md += `- **${c.scope || "core"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.improvements.length > 0) {
    md += `### ⚡ Improvements & Enhancements\n`;
    sec.improvements.forEach((c) => {
      md += `- **${c.scope || "core"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.bugFixes.length > 0) {
    md += `### 🐛 Bug Fixes\n`;
    sec.bugFixes.forEach((c) => {
      md += `- **${c.scope || "core"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.securityUpdates.length > 0) {
    md += `### 🛡️ Security Updates\n`;
    sec.securityUpdates.forEach((c) => {
      md += `- **${c.scope || "security"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.performanceEnhancements.length > 0) {
    md += `### 🚀 Performance Enhancements\n`;
    sec.performanceEnhancements.forEach((c) => {
      md += `- **${c.scope || "perf"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.databaseChanges.length > 0) {
    md += `### 🗄️ Database Changes\n`;
    sec.databaseChanges.forEach((c) => {
      md += `- **${c.scope || "db"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.apiChanges.length > 0) {
    md += `### 🔌 API Changes\n`;
    sec.apiChanges.forEach((c) => {
      md += `- **${c.scope || "api"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.uiUxChanges.length > 0) {
    md += `### 🎨 UI/UX Changes\n`;
    sec.uiUxChanges.forEach((c) => {
      md += `- **${c.scope || "ui"}**: ${c.subject}\n`;
    });
    md += `\n`;
  }

  if (sec.migrationNotes.length > 0) {
    md += `### 📋 Migration Notes\n`;
    sec.migrationNotes.forEach((n) => {
      md += `- ${n}\n`;
    });
    md += `\n`;
  }

  if (sec.contributors.length > 0) {
    md += `### 👥 Contributors\n`;
    md += `Credit to: ${sec.contributors.join(", ")}\n\n`;
  }

  return md;
}

export function updateChangelog(version: string): string {
  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  const tag = getLatestGitTag();
  const rawCommits = getRawCommitsSince(tag);
  const structured = categorizeExtendedCommits(version, rawCommits);
  const formattedSection = formatChangelogSection(structured);

  let existing = "";
  if (fs.existsSync(changelogPath)) {
    existing = fs.readFileSync(changelogPath, "utf8");
  } else {
    existing = `# KwakoPos SaaS — Official Changelog\n\nAll notable changes to KwakoPos will be documented in this file.\n\n---\n\n`;
  }

  // Check if header exists
  if (!existing.startsWith("# KwakoPos SaaS")) {
    existing = `# KwakoPos SaaS — Official Changelog\n\nAll notable changes to KwakoPos will be documented in this file.\n\n---\n\n` + existing;
  }

  // If section already exists, replace it, otherwise prepend right after header divider
  const versionHeaderRegex = new RegExp(`## \\[${version}\\][\\s\\S]*?(?=\\n## \\[|$)`);
  let updatedContent = "";

  if (versionHeaderRegex.test(existing)) {
    updatedContent = existing.replace(versionHeaderRegex, formattedSection.trim());
  } else {
    const dividerIndex = existing.indexOf("---\n");
    if (dividerIndex !== -1) {
      const insertPos = dividerIndex + 4;
      updatedContent = existing.slice(0, insertPos) + "\n" + formattedSection + existing.slice(insertPos);
    } else {
      updatedContent = existing + "\n\n" + formattedSection;
    }
  }

  fs.writeFileSync(changelogPath, updatedContent, "utf8");
  console.log(`✓ Automatically updated CHANGELOG.md for version ${version}`);
  return formattedSection;
}

if (process.argv[1]?.endsWith("generate-changelog.ts")) {
  const rootPkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
  updateChangelog(rootPkg.version || "2.2.0");
}
