import { loadConfig } from "../../packages/config/src/index.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface ReleaseManifest {
  version: string;
  tag: string;
  gitSha: string;
  containerDigest: string | null;
  cloudRunRevision: string | null;
  environment: string;
  releaseChannel: string;
  releasedAt: string;
  certification: "PASS" | "FAIL";
  compatibility: {
    databaseSchemaVersion: number;
    syncProtocolVersion: number;
    pwaSchemaVersion: number;
    minSupportedClientVersion: string;
    recommendedClientVersion: string;
  };
  evidencePath?: string;
}

export function generateReleaseManifest(options?: {
  version?: string;
  certification?: "PASS" | "FAIL";
  evidencePath?: string;
}): ReleaseManifest {
  const config = loadConfig();
  const targetVersion = options?.version || config.APP_VERSION;
  if (!targetVersion) throw new Error("RELEASE_BLOCKED: application version is missing");
  const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/i.test(gitSha)) throw new Error(`RELEASE_BLOCKED: invalid Git SHA: ${gitSha}`);
  const targetTag = `v${targetVersion}`;

  const manifest: ReleaseManifest = {
    version: targetVersion,
    tag: targetTag,
    gitSha,
    containerDigest: process.env.CONTAINER_DIGEST || null,
    cloudRunRevision: process.env.CLOUD_RUN_REVISION || null,
    environment: process.env.RELEASE_ENVIRONMENT || "release-candidate",
    releaseChannel: process.env.RELEASE_CHANNEL || "stable",
    releasedAt: new Date().toISOString(),
    certification: options?.certification || "PASS",
    compatibility: {
      databaseSchemaVersion: 4,
      syncProtocolVersion: 2,
      pwaSchemaVersion: 4,
      minSupportedClientVersion: "2.0.0",
      recommendedClientVersion: targetVersion,
    },
    evidencePath: options?.evidencePath,
  };

  const outDir = path.resolve(process.cwd(), "artifacts/release-evidence");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const manifestPath = path.join(outDir, "release-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  // Also write to root for fast lookup
  fs.writeFileSync(path.resolve(process.cwd(), "release-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`✓ Release Manifest Generated: version=${manifest.version}, tag=${manifest.tag}, sha=${manifest.gitSha.slice(0, 8)}`);
  return manifest;
}

if (process.argv[1]?.endsWith("generate-release-manifest.ts")) {
  generateReleaseManifest();
}