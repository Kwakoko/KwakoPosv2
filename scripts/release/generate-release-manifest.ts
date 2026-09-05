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
  gitSha?: string;
  containerDigest?: string | null;
  cloudRunRevision?: string | null;
  environment?: string;
  releaseChannel?: string;
}): ReleaseManifest {
  const config = loadConfig();
  const identity = getReleaseIdentity(config);

  const targetVersion = options?.version || identity.appVersion;
  const targetTag = `v${targetVersion}`;
  const gitSha = options?.gitSha || identity.gitSha;
  const containerDigest = options?.containerDigest ?? identity.containerDigest ?? null;
  const cloudRunRevision = options?.cloudRunRevision ?? identity.cloudRunRevision ?? null;
  const environment = options?.environment || identity.environment || "production";
  const releaseChannel = options?.releaseChannel || identity.releaseChannel || (environment === "production" ? "production" : "development");

  const manifest: ReleaseManifest = {
    version: targetVersion,
    tag: targetTag,
    gitSha: gitSha,
    containerDigest,
    cloudRunRevision,
    environment,
    releaseChannel,
    releasedAt: new Date().toISOString(),
    certification: options?.certification || "PASS",
    compatibility: identity.compatibility || {
      databaseSchemaVersion: 1,
      syncProtocolVersion: 1,
      pwaSchemaVersion: 1,
      minSupportedClientVersion: "1.0.0",
      recommendedClientVersion: "1.0.0",
    },
    evidencePath: options?.evidencePath,
  };

  const outDir = path.resolve(process.cwd(), "artifacts/release-evidence");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const manifestPath = path.join(outDir, "release-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  // Also write to root for fast lookup (this is the manifest the web bundle imports as a static fallback)
  fs.writeFileSync(path.resolve(process.cwd(), "release-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`✓ Release Manifest Generated: version=${manifest.version}, tag=${manifest.tag}, sha=${String(manifest.gitSha).slice(0, 8)}, env=${manifest.environment}`);
  return manifest;
}

// Simple CLI allowing CI to call this script directly with overrides.
if (process.argv[1]?.endsWith("generate-release-manifest.ts") || process.argv[1]?.endsWith("generate-release-manifest.js")) {
  const args = process.argv.slice(2);
  const opts: any = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--version":
        opts.version = args[++i];
        break;
      case "--gitSha":
        opts.gitSha = args[++i];
        break;
      case "--containerDigest":
        opts.containerDigest = args[++i];
        break;
      case "--cloudRunRevision":
        opts.cloudRunRevision = args[++i];
        break;
      case "--environment":
        opts.environment = args[++i];
        break;
      case "--releaseChannel":
        opts.releaseChannel = args[++i];
        break;
      case "--certification":
        opts.certification = args[++i] === "FAIL" ? "FAIL" : "PASS";
        break;
      case "--evidencePath":
        opts.evidencePath = args[++i];
        break;
      default:
        // ignore unknown
        break;
    }
  }

  try {
    generateReleaseManifest(opts);
  } catch (err: any) {
    console.error("Failed to generate release manifest:", err?.message || err);
    process.exit(1);
  }
}
