import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const python = process.platform === "win32" ? "python" : "python3";
const script = path.resolve(process.cwd(), "scripts/release/normalize-gcp-wif-provider.py");

function run(value: string): string {
  return execFileSync(python, [script, value], {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe("Google Workload Identity Provider normalization", () => {
  const canonical =
    "projects/123456789012/locations/global/workloadIdentityPools/1234-pool/providers/5provider";

  it("accepts canonical resource names with digit-leading valid IDs", () => {
    expect(run(canonical)).toBe(`provider=${canonical}`);
  });

  it("normalizes supported HTTPS and scheme-less IAM URL forms", () => {
    expect(run(`https://iam.googleapis.com/${canonical}`)).toBe(`provider=${canonical}`);
    expect(run(`//iam.googleapis.com/${canonical}/`)).toBe(`provider=${canonical}`);
    expect(run(`iam.googleapis.com/${canonical}`)).toBe(`provider=${canonical}`);
  });

  it("trims surrounding whitespace and one matching quote pair", () => {
    expect(run(`  "${canonical}"  `)).toBe(`provider=${canonical}`);
  });

  it("rejects a project ID where Google requires a project number", () => {
    expect(() => run(canonical.replace("projects/123456789012/", "projects/kwakopos-prod/"))).toThrow();
  });

  it("rejects malformed paths and IDs below the minimum length", () => {
    expect(() => run("projects/123456789012/locations/global/other/pool/providers/test")).toThrow();
    expect(() => run(canonical.replace("1234-pool", "abc"))).toThrow();
  });

  it("rejects reserved provider ID prefixes and output injection", () => {
    expect(() => run(canonical.replace("1234-pool", "gcp-pool"))).toThrow();
    expect(() => run(`${canonical}\nother=value`)).toThrow();
  });
});
