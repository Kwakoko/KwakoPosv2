import { getReleaseIdentity, loadConfig } from "../../packages/config/src/index.js";
import { execSync } from "node:child_process";
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
  brand: {
    parentBrand: "Kwakoko";
    platform: "Kwakoko Business Operating System";
    pos: "KwakoPos";
  };
  certification: "PASS" | "FAIL";
  brand: { parentBrand: string; platform: string; posCapability: string; };
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
  if (!targetVersion) throw new Error("RELEASE_BLOCKED: application version is missing");
  const gitSha = options?.gitSha || identity.gitSha;
  if (!/^[0-9a-f]{40}$/i.test(gitSha)) throw new Error(`RELEASE_BLOCKED: invalid Git SHA: ${gitSha}`);
  const targetTag = `v${targetVersion}`;
  const certification = options?.certification || "FAIL";
  const containerDigest = options?.containerDigest ?? identity.containerDigest ?? null;
  const cloudRunRevision = options?.cloudRunRevision ?? identity.cloudRunRevision ?? null;
  const environment = options?.environment || identity.environment || "release-candidate";
  const releaseChannel = options?.releaseChannel || identity.releaseChannel || "stable";
  if (certification === "PASS") {
    if (!/^sha256:[0-9a-f]{64}$/i.test(containerDigest || "")) {
      throw new Error("RELEASE_BLOCKED: PASS certification requires a real immutable CONTAINER_DIGEST.");
    }
    if (!cloudRunRevision || /MOCK|SIMULATED/i.test(cloudRunRevision)) {
      throw new Error("RELEASE_BLOCKED: PASS certification requires a real CLOUD_RUN_REVISION.");
    }
  }

  const manifest: ReleaseManifest = {
    version: targetVersion,
    tag: targetTag,
    gitSha,
    containerDigest,
    cloudRunRevision,
    environment,
    releaseChannel,
    releasedAt: new Date().toISOString(),
    brand: {
      parentBrand: "Kwakoko",
      platform: "Kwakoko Business Operating System",
      pos: "KwakoPos",
    },
    certification,
    brand: { parentBrand: "Kwakoko", platform: "Kwakoko Business Operating System", posCapability: "KwakoPos" },
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
