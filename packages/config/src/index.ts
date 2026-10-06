import { z } from "zod";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { loadAuthoritativeRelease } from "./authoritativeRelease.js";

function normalizeDatabaseUrlValue(raw: string): string {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }

  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error("SECURITY_FATAL: DATABASE_URL must use the PostgreSQL protocol (postgresql:// or postgres://).");
  }

  try {
    const parsed = new URL(value);
    if (!/^postgres(?:ql):$/i.test(parsed.protocol) || !parsed.hostname) {
      throw new Error("database hostname is missing or the PostgreSQL URL is invalid");
    }
  } catch (error) {
    throw new Error(`SECURITY_FATAL: DATABASE_URL is not a valid PostgreSQL connection URL: ${error instanceof Error ? error.message : String(error)}`);
  }

  return value;
}

// Normalize deployment-provided Secret Manager values before downstream modules
// (including Prisma) are evaluated. This safely fixes whitespace or one pair of
// accidental surrounding quotes without changing connection credentials.
if (typeof process !== "undefined" && process?.env?.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrlValue(process.env.DATABASE_URL);
}

function resolvePackageVersion(): string {
  if (
    typeof window !== "undefined" ||
    typeof process === "undefined" ||
    !process ||
    !process.versions?.node ||
    typeof path?.resolve !== "function" ||
    typeof fs?.readFileSync !== "function" ||
    typeof process.cwd !== "function"
  ) {
    return "2.13.0";
  }
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync && fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (typeof pkg.version === "string" && pkg.version.length > 0) return pkg.version;
    }
  } catch {
    // Runtime may not include repository metadata; APP_VERSION can provide the value explicitly.
  }
  return "2.13.0";
}
if (typeof process !== "undefined" && typeof (process as any)?.loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile();
  } catch {
    // .env not present or already supplied via runtime environment
  }
}

const developmentJwtSecret = (typeof process !== "undefined" && process?.env?.JWT_SECRET) || (typeof crypto !== "undefined" && typeof crypto.randomBytes === "function" ? crypto.randomBytes(48).toString("hex") : "dev-jwt-secret-placeholder");

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production-certification", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/kwakopos2?schema=public").transform(normalizeDatabaseUrlValue),
  JWT_SECRET: z.string().min(32).default(developmentJwtSecret),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  GIT_SHA: z.string().optional(),
  BUILD_NUMBER: z.coerce.number().default(584),
  CONTAINER_DIGEST: z.string().optional(),
  CLOUD_RUN_REVISION: z.string().optional(),
  APP_VERSION: z.string().default(resolvePackageVersion()),
});

export type Config = z.infer<typeof ConfigSchema>;

export function resolveRealBuildNumber(): number {
  if (typeof window !== "undefined" || typeof execSync !== "function") return 584;
  const envBuild = process.env.BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || process.env.CI_BUILD_NUMBER;
  if (envBuild && /^\d+$/.test(envBuild)) return parseInt(envBuild, 10);
  try {
    const count = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
    if (/^\d+$/.test(count)) return parseInt(count, 10);
  } catch {
    // Git may be unavailable inside the runtime container.
  }
  return 584;
}

export function resolveRealGitSha(): string {
  if (typeof window !== "undefined" || typeof execSync !== "function") return "";
  const envSha = process.env.GIT_SHA || process.env.COMMIT_SHA || process.env.CONTAINER_SOURCE_SHA || process.env.GITHUB_SHA || process.env.GIT_COMMIT;
  if (envSha && /^[0-9a-f]{40}$/i.test(envSha)) return envSha;
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    if (/^[0-9a-f]{40}$/i.test(sha)) return sha;
  } catch {
    // Git may be unavailable inside the runtime container.
  }
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification") {
    throw new Error("RELEASE_BLOCKED: Unable to resolve authentic 40-character Git SHA from repository checkout or GIT_SHA.");
  }
  return "UNRESOLVED";
}

export function loadConfig(overrideEnv?: Partial<Record<string, string>>): Config {
  const gitSha = resolveRealGitSha();
  const buildNumber = resolveRealBuildNumber();
  const env = {
    GIT_SHA: gitSha,
    BUILD_NUMBER: buildNumber,
    ...process.env,
    ...overrideEnv,
  };
  const parsed = ConfigSchema.parse(env);
  if (parsed.NODE_ENV === "production" || parsed.NODE_ENV === "production-certification") {
    if (!process.env.DATABASE_URL) throw new Error("SECURITY_FATAL: DATABASE_URL environment variable is MANDATORY in production!");
    if (!process.env.JWT_SECRET) throw new Error("SECURITY_FATAL: JWT_SECRET environment variable is MANDATORY in production!");
    if (!/^[0-9a-f]{40}$/i.test(parsed.GIT_SHA || "")) throw new Error("RELEASE_BLOCKED: authentic GIT_SHA is mandatory in production!");
  }
  return parsed;
}

export interface ReleaseIdentity {
  version: string;
  appVersion: string;
  gitTag: string;
  gitSha: string;
  buildNumber: number;
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
  databaseSchemaVersion: 4,
  syncProtocolVersion: 2,
  pwaSchemaVersion: 6,
  minSupportedClientVersion: "2.0.0",
  recommendedClientVersion: "2.13.0",
};

export function getReleaseIdentity(config: Config): ReleaseIdentity & Record<string, any> {
  const auth = loadAuthoritativeRelease();
  const containerDigest = config.CONTAINER_DIGEST || process.env.CONTAINER_DIGEST || auth.containerDigest;
  const cloudRunRevision = config.CLOUD_RUN_REVISION || process.env.CLOUD_RUN_REVISION || process.env.K_REVISION || auth.cloudRunRevision;
  const appVersion = config.APP_VERSION || auth.appVersion || "2.13.0";
  const gitSha = config.GIT_SHA && /^[0-9a-f]{40}$/i.test(config.GIT_SHA) ? config.GIT_SHA : auth.gitSha || resolveRealGitSha();
  const gitTag = config.APP_VERSION ? `v${config.APP_VERSION}` : (auth.gitTag || `v${appVersion}`);

  if (process.env.NODE_ENV === "production-certification") {
    if (!containerDigest || !/^sha256:[0-9a-f]{64}$/i.test(containerDigest)) throw new Error("RELEASE_IDENTITY_FAILURE: Real immutable CONTAINER_DIGEST is required for production certification.");
    if (!cloudRunRevision || /MOCK|SIMULATED/i.test(cloudRunRevision)) throw new Error("RELEASE_IDENTITY_FAILURE: Real Cloud Run revision is required for production certification.");
  }

  return {
    ...auth,
    version: appVersion,
    appVersion,
    gitTag,
    gitSha,
    releaseId: auth.releaseId || `kwakopos-rel-${appVersion}-${gitSha.slice(0, 7)}`,
    buildId: auth.buildId || gitSha.slice(0, 8),
    buildNumber: Number(config.BUILD_NUMBER || auth.buildNumber || resolveRealBuildNumber()),
    pwaVersion: auth.pwaVersion,
    pwaSchemaVersion: auth.pwaSchemaVersion,
    syncProtocolVersion: auth.syncProtocolVersion,
    databaseSchemaVersion: auth.databaseSchemaVersion,
    minimumSupportedClientVersion: auth.minimumSupportedClientVersion,
    maximumSupportedClientVersion: auth.maximumSupportedClientVersion,
    containerDigest: containerDigest || null,
    cloudRunRevision: cloudRunRevision || null,
    environment: config.NODE_ENV || auth.environment,
    releaseChannel: config.NODE_ENV === "production" ? "production" : auth.releaseChannel,
    releaseTimestamp: auth.releaseTimestamp || new Date().toISOString(),
    compatibility: auth.compatibility,
  };
}

export * from "./semverEngine.js";
export * from "./authoritativeRelease.js";
export * from "./brandHierarchy.js";
export * from "./kokoAmbassador.js";
export * from "./brandPositioning.js";

export * from './visualIdentity.js';
export * from "./brandVoice.js";
export * from "./experienceGovernance.js";
export * from "./designSystem.js";

export * from "./performanceScaleGovernance.js";
export * from './integrationApiEcosystemGovernance.js';
export * from './productionReliabilityGovernance.js';
export * from './performanceScaleGovernance.js';
export * from './commercialProductReadinessGovernance.js';
export * from './enterpriseCustomerReadinessGovernance.js';
export * from "./marketplacePartnerGovernance.js";
export * from "./biAnalyticsGovernance.js";

export * from "./aiOperatingLayerGovernance.js";
export * from "./autonomousOperationsGovernance.js";
export * from "./platformGovernanceControlPlane.js";
export * from "./platformGovernanceControlPlane.js";
export * from "./releaseCertificationGovernance.js";
export * from "./productionReleaseAuthority.js";
export * from "./securityTrustGovernance.js";
export * from "./privacyDataGovernance.js";
export * from "./dataLifecycleDrGovernance.js";
export * from "./workflowGovernance.js";
export * from "./aiAgentGovernance.js";
export * from "./liveProductionEvidenceGovernance.js";

export * from "./visualAssetLibrary.js";
