import { execSync } from "child_process";
import * as fs from "fs";

interface CommitInfo {
  hash: string;
  type: string;
  scope?: string;
  subject: string;
  breaking: boolean;
}

function parseConventionalCommit(line: string): CommitInfo | null {
  // Format: "<hash> <type>(<scope>): <subject>" or "<hash> <type>: <subject>"
  const match = line.match(/^([a-f0-9]{7})\s+(feat|fix|docs|style|refactor|perf|test|chore|ci)(\((.+?)\))?(!)?: (.+)$/);
  if (!match) return null;

  return {
    hash: match[1],
    type: match[2],
    scope: match[4],
    subject: match[6],
    breaking: !!match[5],
  };
}

function generateReleaseNotes(version: string): string {
  console.log(`\n📝 Generating release notes for v${version}...\n`);

  let previousTag = "v0.0.0";
  try {
    previousTag = execSync("git describe --tags --abbrev=0 2>/dev/null", { encoding: "utf8" }).trim();
  } catch (e) {
    // No previous tags
  }

  const commits = execSync(`git log ${previousTag}..HEAD --oneline`, { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(c => c)
    .map(parseConventionalCommit)
    .filter((c): c is CommitInfo => c !== null);

  let notes = `## [${version}] - ${new Date().toISOString().split("T")[0]}\n\n`;

  // Breaking changes
  const breaking = commits.filter(c => c.breaking);
  if (breaking.length > 0) {
    notes += `### 🚨 Breaking Changes\n`;
    for (const commit of breaking) {
      notes += `- **${commit.scope ? commit.scope : "core"}**: ${commit.subject} (${commit.hash})\n`;
    }
    notes += "\n";
  }

  // Features
  const features = commits.filter(c => c.type === "feat" && !c.breaking);
  if (features.length > 0) {
    notes += `### ✨ Features\n`;
    for (const commit of features) {
      notes += `- **${commit.scope ? commit.scope : "core"}**: ${commit.subject} (${commit.hash})\n`;
    }
    notes += "\n";
  }

  // Bug fixes
  const fixes = commits.filter(c => c.type === "fix");
  if (fixes.length > 0) {
    notes += `### 🐛 Bug Fixes\n`;
    for (const commit of fixes) {
      notes += `- **${commit.scope ? commit.scope : "core"}**: ${commit.subject} (${commit.hash})\n`;
    }
    notes += "\n";
  }

  // Other commits
  const other = commits.filter(c => !["feat", "fix"].includes(c.type));
  if (other.length > 0) {
    notes += `### 📋 Other Changes\n`;
    for (const commit of other) {
      const typeEmoji: { [key: string]: string } = {
        docs: "📚",
        style: "🎨",
        refactor: "♻️",
        perf: "⚡",
        test: "✅",
        chore: "🔧",
        ci: "👷",
      };
      notes += `- ${typeEmoji[commit.type] || "•"} **${commit.type}${commit.scope ? `(${commit.scope})` : ""}: ${commit.subject} (${commit.hash})\n`;
    }
    notes += "\n";
  }

  return notes;
}

if (require.main === module) {
  const version = process.argv[2];
  if (!version) {
    console.error("\n❌ Usage: tsx generate-release-notes.ts <version>\n");
    process.exit(1);
  }
  const notes = generateReleaseNotes(version);
  console.log(notes);
}

export { generateReleaseNotes };
