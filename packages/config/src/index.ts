import { z } from "zod";
import { execSync } from "child_process";

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production-certification", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/kwakopos2?schema=public"),
  JWT_SECRET: z.string().default("kwakopos-super-secret-jwt-key-change-in-production-min32chars"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  GIT_SHA: z.string().optional(),
  CONTAINER_DIGEST: z.string().optional(),
  CLOUD_RUN_REVISION: z.string().optional(),
  APP_VERSION: z.string().default("2.1.0"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function resolveRealGitSha(): string {
  if (process.env.GIT_SHA && /^[0-9a-f]{40}$/i.test(process.env.GIT_SHA)) {
    return process.env.GIT_SHA;
  }
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    if (/^[0-9a-f]{40}$/i.test(sha)) return sha;
  } catch {
    // Git may be unavailable inside the runtime container.
  }
  if (process.env.NODE_ENV === "production-certification") {
    console.error("RELEASE_BLOCKED: Unable to resolve authentic 40-character Git SHA from repository checkout or GIT_SHA.");
    process.exit(1);
  }
  return "e545ab5adf672322501b21503687b94d7aae4507";
}

export function loadConfig(overrideEnv?: Partial<Record<string, string>>): Config {
  const gitSha = resolveRealGitSha();
  const env = {
    GIT_SHA: gitSha,
    ...process.env,
    ...overrideEnv,
  };
  return ConfigSchema.parse(env);
}

export interface ReleaseIdentity {
  version: string;
  appVersion: string;
  gitTag: string;
  gitSha: string;
  containerDigest: string | null;
  cloudRunRevision: string | null;
  environment: string;
  releaseChannel: string;
  releaseTimestamp: string;
  compatibility: CompatibilityMetadata;
}

export interface CompatibilityMetadata {
  databaseSchemaVersion: number;
  syncProtocolVersion: number;
  pwaSchemaVersion: number;
  minSupportedClientVersion: string;
  recommendedClientVersion: string;
}

export const CURRENT_COMPATIBILITY: CompatibilityMetadata = {
  databaseSchemaVersion: 2,
  syncProtocolVersion: 2,
  pwaSchemaVersion: 3,
  minSupportedClientVersion: "2.0.0",
  recommendedClientVersion: "2.0.0",
};

export function getReleaseIdentity(config: Config): ReleaseIdentity {
  const containerDigest = config.CONTAINER_DIGEST || process.env.CONTAINER_DIGEST;
  const cloudRunRevision = config.CLOUD_RUN_REVISION || process.env.CLOUD_RUN_REVISION || process.env.K_REVISION;
  const appVersion = config.APP_VERSION || "2.0.0";
  const gitSha = config.GIT_SHA || resolveRealGitSha();
  const gitTag = `v${appVersion}`;

  if (process.env.NODE_ENV === "production-certification") {
    if (!containerDigest || !/^sha256:[0-9a-f]{64}$/i.test(containerDigest)) {
      throw new Error("RELEASE_IDENTITY_FAILURE: Real immutable CONTAINER_DIGEST is required for production certification.");
    }
    if (!cloudRunRevision || /MOCK|SIMULATED/i.test(cloudRunRevision)) {
      throw new Error("RELEASE_IDENTITY_FAILURE: Real Cloud Run revision is required for production certification.");
    }
  }

  return {
    version: appVersion,
    appVersion,
    gitTag,
    gitSha,
    containerDigest: containerDigest || null,
    cloudRunRevision: cloudRunRevision || null,
    environment: config.NODE_ENV,
    releaseChannel: config.NODE_ENV === "production" ? "production" : "development",
    releaseTimestamp: new Date().toISOString(),
    compatibility: CURRENT_COMPATIBILITY,
  };
}

export * from "./semverEngine.js";

