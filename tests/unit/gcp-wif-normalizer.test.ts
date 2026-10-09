import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const python = spawnSync("python", ["--version"], { encoding: "utf8" });
const pythonAvailable = python.status === 0;
const script = path.resolve("scripts/release/normalize-gcp-wif-provider.py");
function run(value: string) {
  return spawnSync("python", [script, value], { encoding: "utf8" });
}

describe.skipIf(!pythonAvailable)("Google Workload Identity Provider normalizer", () => {
  const canonical = "projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider";
  it.each([
    canonical,
    "https://iam.googleapis.com/" + canonical,
    "http://iam.googleapis.com/" + canonical + "/",
    "//iam.googleapis.com/" + canonical,
    "iam.googleapis.com/" + canonical,
    "https://iam.googleapis.com/v1/" + canonical + "?project=kwakopos-prod#provider",
    "https://iam.googleapis.com/v1beta/" + canonical + "?alt=json",
    "https://iam.googleapis.com/v1beta1/" + canonical + "/",
    '  "' + canonical + '"  ',
  ])("normalizes supported IAM resource wrappers", (input) => {
    const result = run(input);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("provider=" + canonical);
    expect(result.stderr).not.toContain(input);
  });
  it.each([
    "projects/not-a-number/locations/global/workloadIdentityPools/github-pool/providers/github-provider",
    "projects/123/locations/global/workloadIdentityPools/ab/providers/cd",
    "https://attacker.example/projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider",
    canonical + "\nother=value",
    "projects/123456789/locations/global/workloadIdentityPools/github_pool/providers/github-provider",
  ])("rejects invalid provider resources", (input) => {
    const result = run(input);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});
