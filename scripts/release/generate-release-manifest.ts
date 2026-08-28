import { getReleaseIdentity, loadConfig } from "../../packages/config/src/index.js";
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
  const identity = getReleaseIdentity(config);
  const targetVersion = options?.version || identity.appVersion;
  const targetTag = `v${targetVersion}`;

  const manifest: ReleaseManifest = {
    version: targetVersion,
    tag: targetTag,
    gitSha: identity.gitSha,
    containerDigest: identity.containerDigest,
    cloudRunRevision: identity.cloudRunRevision,
    environment: identity.environment,
    releaseChannel: identity.releaseChannel,
    releasedAt: identity.releaseTimestamp,
    certification: options?.certification || "PASS",
    compatibility: identity.compatibility,
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