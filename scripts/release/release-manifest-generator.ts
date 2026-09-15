import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

export interface ReleaseManifest {
  product: string;
  version: string;
  gitSha: string;
  buildId: string;
  artifactDigest: string;
  schemaVersion: string;
  sbomReference: string;
  provenanceReference: string;
  releaseRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  deploymentStrategy: "CANARY" | "BLUE_GREEN" | "ROLLING" | "IMMEDIATE";
  createdAt: string;
  builderIdentity: string;
  targetEnvironment: string;
}

export function generateReleaseManifest(options?: {
  version?: string;
  gitSha?: string;
  buildId?: string;
  releaseRisk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}): ReleaseManifest {
  const pkgPath = path.resolve(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = options?.version || pkg.version;
  if (!version) throw new Error("RELEASE_BLOCKED: package version is missing");
  const gitSha = options?.gitSha || process.env.GITHUB_SHA || execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/i.test(gitSha)) throw new Error(`RELEASE_BLOCKED: invalid Git SHA: ${gitSha}`);
  const buildId = options?.buildId || `build-${Date.now()}`;

  const manifestContent = JSON.stringify({ product: "KwakoPos", version, gitSha, buildId });
  const artifactDigest = `sha256:${createHash("sha256").update(manifestContent).digest("hex")}`;

  const manifest: ReleaseManifest = {
    product: "KwakoPos SaaS",
    version,
    gitSha,
    buildId,
    artifactDigest,
    schemaVersion: version,
    sbomReference: `artifacts/releases/${version}/sbom.spdx.json`,
    provenanceReference: `artifacts/releases/${version}/provenance.json`,
    releaseRisk: options?.releaseRisk || "LOW",
    deploymentStrategy: "CANARY",
    createdAt: new Date().toISOString(),
    builderIdentity: "github-actions[bot]",
    targetEnvironment: "production",
  };

  const targetDir = path.resolve(process.cwd(), `artifacts/releases/${version}`);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const manifestPath = path.join(targetDir, "release-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(` ✓ [PASS] Release Manifest generated: ${manifestPath}`);
  return manifest;
}

if (process.argv[1]?.endsWith("release-manifest-generator.ts")) {
  generateReleaseManifest();
}
