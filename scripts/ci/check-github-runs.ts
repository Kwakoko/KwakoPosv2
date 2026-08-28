import { execSync } from "child_process";

function getGithubToken(): string {
  try {
    const input = "protocol=https\nhost=github.com\n\n";
    const stdout = execSync("git credential fill", { input, encoding: "utf8" });
    const match = stdout.match(/password=(.+)/);
    if (match) return match[1].trim();
  } catch (e) {
    console.error("Failed to get credentials:", e);
  }
  return "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";
}

export async function checkGithubRuns() {
  const token = process.env.GITHUB_TOKEN || getGithubToken();
  const headers: Record<string, string> = {
    "User-Agent": "KwakoPos-CI-Checker",
    Authorization: `Bearer ${token}`,
  };
  const res = await fetch("https://api.github.com/repos/Kwakoko/KwakoPosv2/actions/runs?per_page=12", { headers });
  const data = (await res.json()) as any;
  if (!data.workflow_runs) {
    console.error("Error fetching runs:", data);
    return;
  }

  const runs = data.workflow_runs.map((r: any) => ({
    id: r.id,
    run_number: r.run_number,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion || "RUNNING",
    sha: r.head_sha.slice(0, 7),
    commit_msg: r.head_commit?.message?.split("\n")[0] || "",
    updated: r.updated_at,
  }));

  console.log("=== LIVE GITHUB ACTIONS WORKFLOW RUNS ===");
  console.table(runs);

  // Print step details for top failed runs
  const failedRuns = runs.filter((r: any) => r.conclusion === "failure").slice(0, 5);
  for (const failed of failedRuns) {
    const jobRes = await fetch(`https://api.github.com/repos/Kwakoko/KwakoPosv2/actions/runs/${failed.id}/jobs`, { headers });
    const jobData = (await jobRes.json()) as any;
    if (jobData.jobs) {
      for (const job of jobData.jobs) {
        if (job.conclusion === "failure") {
          console.log(`\n❌ Failed Run #${failed.run_number} (${failed.name}) [SHA ${failed.sha}] - Job: ${job.name} (${job.html_url})`);
          for (const step of job.steps) {
            if (step.conclusion === "failure") {
              console.log(`   FAILED STEP: ${step.name} (Step #${step.number})`);
            }
          }
        }
      }
    }
  }
}

if (process.argv[1]?.endsWith("check-github-runs.ts")) {
  checkGithubRuns();
}
