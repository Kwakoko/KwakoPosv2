import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const python = process.platform === "win32" ? "python" : "python3";
const script = path.resolve(process.cwd(), "scripts/release/normalize-gcp-wif-provider.py");

function run(value: string, fallback?: string): string {
  const args = fallback === undefined ? [script, value] : [script, value, fallback];
  return execFileSync(python, args, {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runFailure(value: string, fallback?: string): { status: number | null; stderr: string } {
  const args = fallback === undefined ? [script, value] : [script, value, fallback];
  const result = spawnSync(python, args, {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: result.status, stderr: result.stderr };
}

describe("Google Workload Identity Provider normalization", () => {
  const canonical =
    "projects/123456789012/locations/global/workloadIdentityPools/1234-pool/providers/5provider";

  it("accepts canonical resource names with digit-leading valid IDs", () => {
    expect(run(canonical)).toBe("provider=" + canonical);
  });

  it("normalizes supported HTTPS and scheme-less IAM URL forms", () => {
    expect(run("https://iam.googleapis.com/" + canonical)).toBe("provider=" + canonical);
    expect(run("//iam.googleapis.com/" + canonical + "/")).toBe("provider=" + canonical);
    expect(run("iam.googleapis.com/" + canonical)).toBe("provider=" + canonical);
  });

  it("normalizes API-versioned IAM URLs and removes query/fragment wrappers", () => {
    expect(run("https://iam.googleapis.com/v1/" + canonical + "?project=kwakopos-prod#provider")).toBe("provider=" + canonical);
    expect(run("https://iam.googleapis.com/v1beta/" + canonical + "?alt=json")).toBe("provider=" + canonical);
    expect(run("https://iam.googleapis.com/v1beta1/" + canonical + "/")).toBe("provider=" + canonical);
    expect(run("http://iam.googleapis.com/" + canonical + "/")).toBe("provider=" + canonical);
  });

  it("trims surrounding whitespace and one matching quote pair", () => {
    expect(run('  "' + canonical + '"  ')).toBe("provider=" + canonical);
  });

  it("normalizes line-wrapped resource values without relaxing shape validation", () => {
    const wrapped =
      "projects/123456789012/locations/global/\r\n  workloadIdentityPools/1234-pool/\n providers/5provider";
    expect(run(wrapped)).toBe("provider=" + canonical);
    expect(() => run(wrapped + "\nextra-content")).toThrow();
  });

  it("uses a valid legacy provider when the non-empty primary value is malformed", () => {
    expect(run("not-a-canonical-provider", canonical)).toBe("provider=" + canonical);
  });

  it("prefers a valid primary provider when both candidates are valid", () => {
    const fallback = canonical.replace("5provider", "other-provider");
    expect(run(canonical, fallback)).toBe("provider=" + canonical);
  });

  it("rejects a project ID where Google requires a project number", () => {
    expect(() => run(canonical.replace("projects/123456789012/", "projects/kwakopos-prod/"))).toThrow();
  });

  it("rejects malformed paths and IDs below the minimum length", () => {
    expect(() => run("projects/123456789012/locations/global/other/pool/providers/test")).toThrow();
    expect(() => run(canonical.replace("1234-pool", "abc"))).toThrow();
  });

  it("reports malformed path shape without exposing provider or pool identifiers", () => {
    const privatePoolMarker = "private-pool-value";
    const malformed = "projects/123456789012/locations/global/pools/" + privatePoolMarker + "/providers/5provider";
    const result = runFailure(malformed);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("safe_shape_diagnostic");
    expect(result.stderr).toContain("has_global_location=true");
    expect(result.stderr).not.toContain(privatePoolMarker);
    expect(result.stderr).not.toContain("123456789012");
  });

  it("reports both safe errors if both provider candidates are malformed", () => {
    const primaryMarker = "private-primary-pool";
    const fallbackMarker = "private-legacy-pool";
    const primary = "projects/123456789012/locations/global/pools/" + primaryMarker + "/providers/5provider";
    const fallback = "projects/123456789012/locations/global/pools/" + fallbackMarker + "/providers/5provider";
    const result = runFailure(primary, fallback);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GCP_WIF_PROVIDER rejected");
    expect(result.stderr).toContain("GCP_WORKLOAD_IDENTITY_PROVIDER rejected");
    expect(result.stderr).not.toContain(primaryMarker);
    expect(result.stderr).not.toContain(fallbackMarker);
    expect(result.stderr).not.toContain("123456789012");
  });

  it("rejects reserved provider ID prefixes and output injection", () => {
    expect(() => run(canonical.replace("1234-pool", "gcp-pool"))).toThrow();
    expect(() => run(canonical + "\nother=value")).toThrow();
  });
});
