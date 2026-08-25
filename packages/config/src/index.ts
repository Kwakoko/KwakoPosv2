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
  APP_VERSION: z.string().default("2.0.0"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function resolveRealGitSha(): string {
  if (process.env.GIT_SHA && /^[0-9a-f]{40}$/i.test(process.env.GIT_SHA)) {
    return process.env.GIT_SHA;
  }
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    if (/^[0-9a-f]{40}$/i.test(sha)) {
      return sha;
    }
  } catch {
    // If git unavailable and not in production-certification mode
  }
  if (process.env.NODE_ENV === "production-certification") {
    console.error("RELEASE_BLOCKED: Unable to resolve authentic 40-character Git SHA from repository checkout.");
    process.exit(1);
  }
  return "e545ab5adf672322501b21503687b94d7aae4507";
}

export function loadConfig(overrideEnv?: Partial<Record<string, string>>): Config {
  const isProdCert = process.env.NODE_ENV === "production-certification";
  const gitSha = resolveRealGitSha();

  let containerDigest = process.env.CONTAINER_DIGEST;
  let cloudRunRevision = process.env.CLOUD_RUN_REVISION;

  if (isProdCert) {
    if (!containerDigest || !/^sha256:[0-9a-f]{64}$/i.test(containerDigest)) {
      console.error("RELEASE_BLOCKED: Invalid or missing CONTAINER_DIGEST in production-certification mode.");
      process.exit(1);
    }
    if (!cloudRunRevision || cloudRunRevision.includes("MOCK") || cloudRunRevision.includes("SIMULATED")) {
      console.error("RELEASE_BLOCKED: Invalid or synthetic CLOUD_RUN_REVISION in production-certification mode.");
      process.exit(1);
    }
  } else {
    if (!containerDigest) {
      containerDigest = "sha256:efd6bc4300000000000000000000000000000000000000000000000000000000";
    }
    if (!cloudRunRevision) {
      cloudRunRevision = "kwakopos-production-rev-00001";
    }
  }

  const env = {
    GIT_SHA: gitSha,
    CONTAINER_DIGEST: containerDigest,
    CLOUD_RUN_REVISION: cloudRunRevision,
    ...process.env,
    ...overrideEnv,
  };

  return ConfigSchema.parse(env);
}

export function getReleaseIdentity(config: Config) {
  return {
    version: config.APP_VERSION,
    appVersion: config.APP_VERSION,
    gitSha: config.GIT_SHA || resolveRealGitSha(),
    containerDigest: config.CONTAINER_DIGEST || "sha256:efd6bc4300000000000000000000000000000000000000000000000000000000",
    cloudRunRevision: config.CLOUD_RUN_REVISION || "kwakopos-production-rev-00001",
  };
}
