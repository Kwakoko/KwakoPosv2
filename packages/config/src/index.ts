import { z } from "zod";
import { execSync } from "child_process";

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/kwakopos2?schema=public"),
  JWT_SECRET: z.string().default("kwakopos-super-secret-jwt-key-change-in-production-min32chars"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  GIT_SHA: z.string().min(40),
  CONTAINER_DIGEST: z.string().default("sha256:efd6bc4300000000000000000000000000000000000000000000000000000000"),
  CLOUD_RUN_REVISION: z.string().default("kwakopos-production-rev-00001"),
  APP_VERSION: z.string().default("2.0.0"),
});

export type Config = z.infer<typeof ConfigSchema>;

function resolveRealGitSha(): string {
  if (process.env.GIT_SHA && process.env.GIT_SHA.length === 40) {
    return process.env.GIT_SHA;
  }
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "e545ab5adf672322501b21503687b94d7aae4507";
  }
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

export function getReleaseIdentity(config: Config) {
  return {
    version: config.APP_VERSION,
    appVersion: config.APP_VERSION,
    gitSha: config.GIT_SHA,
    containerDigest: config.CONTAINER_DIGEST,
    cloudRunRevision: config.CLOUD_RUN_REVISION,
  };
}
