import { execSync } from "child_process";

const CONVENTIONAL_COMMIT_REGEX = /^[a-f0-9]{7} (feat|fix|docs|style|refactor|perf|test|chore|ci)(\(.+\))?!?: .+/;

function validateCommits(): boolean {
  try {
    console.log("\n========================================================================");
    console.log(" CONVENTIONAL COMMIT VALIDATION                                       ");
    console.log("========================================================================\n");

    let lastTag = "HEAD~10";
    try {
      lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null", { encoding: "utf8" }).trim();
    } catch (e) {
      console.log("ℹ️  No tags found, validating last 10 commits...");
    }

    const commits = execSync(`git log ${lastTag}..HEAD --oneline`, { encoding: "utf8" }).trim().split("\n").filter(c => c);

    if (commits.length === 0) {
      console.log("ℹ️  No new commits since last tag");
      return true;
    }

    console.log(`Validating ${commits.length} commit(s) since ${lastTag}:\n`);

    let allValid = true;
    for (const commit of commits) {
      if (!CONVENTIONAL_COMMIT_REGEX.test(commit)) {
        console.log(`  ❌ INVALID: ${commit}`);
        allValid = false;
      } else {
        console.log(`  ✅ VALID:   ${commit}`);
      }
    }

    console.log("\n========================================================================");
    if (allValid) {
      console.log(" ✅ All commits follow conventional format\n");
      console.log(" Format: <type>(<scope>): <subject>");
      console.log(" Types:  feat, fix, docs, style, refactor, perf, test, chore, ci");
      console.log(" Use '!' for breaking changes: feat!: subject\n");
    } else {
      console.log(" ❌ Some commits do NOT follow conventional format\n");
      console.log(" See: https://www.conventionalcommits.org/\n");
      console.log(" Examples:");
      console.log("   feat: add new feature");
      console.log("   fix: resolve bug in module");
      console.log("   feat!: breaking change in API\n");
      process.exit(1);
    }
    console.log("========================================================================\n");

    return allValid;
  } catch (err: any) {
    console.error(`\n❌ Validation error: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  validateCommits();
}

export { validateCommits };
