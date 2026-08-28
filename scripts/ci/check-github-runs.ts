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

export async function inspectJobFailures(runId: string = "33170882298") {
  const token = getGithubToken();
  const res = await fetch(`https://api.github.com/repos/Kwakoko/KwakoPosv2/actions/runs/${runId}/jobs`, {
    headers: {
      "User-Agent": "KwakoPos-CI-Checker",
      Authorization: `token ${token}`,
    },
  });
  const data = (await res.json()) as any;
  if (!data.jobs) {
    console.error("Error fetching jobs:", data);
    return;
  }

  for (const job of data.jobs) {
    console.log(`Job: ${job.name} (Status: ${job.status}, Conclusion: ${job.conclusion})`);
    for (const step of job.steps) {
      if (step.conclusion === "failure") {
        console.log(`  ❌ Failed Step: ${step.name} (Number: ${step.number})`);
      }
    }
  }
}

if (process.argv[1]?.endsWith("check-github-runs.ts")) {
  inspectJobFailures(process.argv[2] || "33170882298");
}
