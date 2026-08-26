import { parseConventionalCommit } from "../../packages/config/src/semverEngine.js";
import { execSync } from "child_process";

export function validateCommitMessage(message: string): { isValid: boolean; error?: string; commit?: any } {
  if (!message || message.trim().length === 0) {
    return { isValid: false, error: "COMMIT_VALIDATION_ERROR: Commit message cannot be empty." };
  }

  const firstLine = message.trim().split("\n")[0];
  const parsed = parseConventionalCommit(message);

  const allowedTypes = [
    "feat",
    "fix",
    "perf",
    "refactor",
    "docs",
    "security",
    "chore",
    "test",
    "ci",
    "revert",
    "build",
    "style",
  ];

  if (!allowedTypes.includes(parsed.type)) {
    return {
      isValid: false,
      error: `COMMIT_VALIDATION_ERROR: Invalid commit type "${parsed.type}". Allowed types: ${allowedTypes.join(", ")}`,
      commit: parsed,
    };
  }

  if (!parsed.subject || parsed.subject.length < 3) {
    return {
      isValid: false,
      error: `COMMIT_VALIDATION_ERROR: Subject is too short in "${firstLine}".`,
      commit: parsed,
    };
  }

  return { isValid: true, commit: parsed };
}

function runSelfTest() {
  const testCases = [
    { msg: "feat(inventory): add real-time stock reconciliation", valid: true },
    { msg: "fix(sync): preserve adjustment during delta replay", valid: true },
    { msg: "perf(pos): reduce cart query latency", valid: true },
    { msg: "security(auth): rotate refresh token securely", valid: true },
    { msg: "refactor(domain)!: isolate ledger mutation", valid: true },
    { msg: "docs: update API documentation", valid: true },
    { msg: "random commit without prefix", valid: false },
    { msg: "", valid: false },
  ];

  console.log("================================================================");
  console.log(" CONVENTIONAL COMMIT VALIDATOR SELF-TEST                        ");
  console.log("================================================================");

  let passed = 0;
  for (const tc of testCases) {
    const res = validateCommitMessage(tc.msg);
    const ok = res.isValid === tc.valid;
    if (ok) {
      passed++;
      console.log(` ✓ [PASS] "${tc.msg}" => valid: ${res.isValid}`);
    } else {
      console.error(` ✗ [FAIL] "${tc.msg}" => expected ${tc.valid}, got ${res.isValid} (${res.error})`);
    }
  }

  if (passed === testCases.length) {
    console.log(`\n🎉 All ${passed}/${testCases.length} commit validation tests passed!`);
  } else {
    console.error(`\n❌ Commit validation tests failed: ${passed}/${testCases.length}`);
    process.exit(1);
  }
}

if (process.argv.includes("--test")) {
  runSelfTest();
} else {
  // Validate latest git commit
  try {
    const latestCommit = execSync("git log -1 --pretty=%B", { encoding: "utf8" });
    const res = validateCommitMessage(latestCommit);
    if (!res.isValid) {
      console.warn(`[WARN] Commit does not follow standard conventional format: ${res.error}`);
    } else {
      console.log(`✓ Conventional Commit Validated: [${res.commit.type}${res.commit.scope ? `(${res.commit.scope})` : ""}${res.commit.isBreaking ? "!" : ""}] ${res.commit.subject}`);
    }
  } catch {
    console.log("✓ Git commit validation skipped (git not available or empty repo).");
  }
}