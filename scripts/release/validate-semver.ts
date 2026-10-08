import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface CommitValidationResult {
  commit: string;
  isValid: boolean;
  type?: string;
  scope?: string;
  isBreaking: boolean;
  subject?: string;
  error?: string;
}

export interface SemverValidationReport {
  timestamp: string;
  totalCommits: number;
  validCommits: number;
  invalidCommits: number;
  results: CommitValidationResult[];
  status: "PASSED" | "FAILED";
}

const CONVENTIONAL_COMMIT_REGEX =
  /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s(?<subject>.+)$/i;

const SCOPE_ONLY_COMMIT_REGEX = /^(?<type>[a-z][a-z0-9-]*):\s(?<subject>.+)$/i;

export function validateCommitMessage(commitMsg: string): CommitValidationResult {
  const trimmed = commitMsg.trim();
  if (!trimmed) {
    return { commit: commitMsg, isValid: false, isBreaking: false, error: "Empty commit message" };
  }

  // Ignore merge commits
  if (trimmed.startsWith("Merge branch") || trimmed.startsWith("Merge pull request")) {
    return { commit: commitMsg, isValid: true, type: "chore", scope: "merge", isBreaking: false, subject: trimmed };
  }

  const conventionalMatch = trimmed.match(CONVENTIONAL_COMMIT_REGEX);
  if (conventionalMatch && conventionalMatch.groups) {
    const { type, scope, breaking, subject } = conventionalMatch.groups;
    const isBreaking = Boolean(breaking) || trimmed.includes("BREAKING CHANGE:");

    return {
      commit: commitMsg,
      isValid: true,
      type: type.toLowerCase(),
      scope: scope || undefined,
      isBreaking,
      subject,
    };
  }

  const scopeOnlyMatch = trimmed.match(SCOPE_ONLY_COMMIT_REGEX);
  if (scopeOnlyMatch && scopeOnlyMatch.groups) {
    const { type, subject } = scopeOnlyMatch.groups;
    return {
      commit: commitMsg,
      isValid: true,
      type: type.toLowerCase(),
      scope: type.toLowerCase(),
      isBreaking: false,
      subject,
    };
  }

  return {
    commit: commitMsg,
    isValid: false,
    isBreaking: false,
    error:
      "Commit does not follow the project release format. Expected 'type(scope): subject' or 'scope: subject'. Example: 'feat(pos): add barcode scanner support'",
  };
}

export function validateGitCommits(range?: string): SemverValidationReport {
  console.log("========================================================================");
  console.log(" KWAKOPOS 2.0 CONVENTIONAL COMMITS & SEMVER VALIDATOR                   ");
  console.log("========================================================================");

  let commitMessages: string[] = [];
  let commitRange = range;

  if (!commitRange) {
    try {
      const latestTag = execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
      commitRange = `${latestTag}..HEAD`;
    } catch {
      commitRange = "HEAD~20..HEAD";
    }
  }

  console.log(`[INFO] Evaluating commits in range: ${commitRange}`);

  try {
    const rawLog = execSync(`git log ${commitRange} --pretty=format:"%s"`, { encoding: "utf8" });
    commitMessages = rawLog
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    console.log(" [WARN] Unable to read git log for range. Validating current HEAD commit...");
    try {
      const headMsg = execSync('git log -1 --pretty=format:"%s"', { encoding: "utf8" }).trim();
      if (headMsg) commitMessages = [headMsg];
    } catch {
      commitMessages = [];
    }
  }

  if (commitMessages.length === 0) {
    console.log(" [INFO] No commits found in range to validate.");
  }

  const results: CommitValidationResult[] = commitMessages.map(validateCommitMessage);
  const invalidCommits = results.filter((r) => !r.isValid);
  const validCommits = results.filter((r) => r.isValid);

  results.forEach((r, idx) => {
    if (r.isValid) {
      console.log(` ✓ [VALID] [${r.type}${r.scope ? `(${r.scope})` : ""}${r.isBreaking ? "!" : ""}] ${r.subject}`);
    } else {
      console.error(` ✗ [INVALID] Commit #${idx + 1}: "${r.commit}" -> ${r.error}`);
    }
  });

  const status = invalidCommits.length === 0 ? "PASSED" : "FAILED";
  const report: SemverValidationReport = {
    timestamp: new Date().toISOString(),
    totalCommits: commitMessages.length,
    validCommits: validCommits.length,
    invalidCommits: invalidCommits.length,
    results,
    status,
  };

  const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "kwakopos-semver-validation.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("========================================================================");
  if (status === "PASSED") {
    console.log(` 🎉 COMMIT VALIDATION PASSED: ${validCommits.length}/${commitMessages.length} commits compliant.`);
  } else {
    console.error(` ❌ COMMIT VALIDATION FAILED: ${invalidCommits.length}/${commitMessages.length} non-compliant commits.`);
  }
  console.log("========================================================================");

  return report;
}

if (process.argv[1]?.endsWith("validate-semver.ts")) {
  const report = validateGitCommits(process.argv[2]);
  if (report.status === "FAILED" && process.env.STRICT_SEMVER_VALIDATION === "true") {
    process.exit(1);
  }
}
