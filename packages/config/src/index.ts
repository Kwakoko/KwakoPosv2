import { z } from "zod";

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/kwakopos2?schema=public"),
  JWT_SECRET: z.string().default("kwakopos-super-secret-jwt-key-change-in-production-min32chars"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  GIT_SHA: z.string().default("df2a5cd188000000000000000000000000000000"),
  CONTAINER_DIGEST: z.string().default("sha256:efd6bc4300000000000000000000000000000000000000000000000000000000"),
  CLOUD_RUN_REVISION: z.string().default("kwakopos-production-rev-00001"),
  APP_VERSION: z.string().default("2.0.0"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(overrideEnv?: Partial<Record<string, string>>): Config {
  const env = {
    ...process.env,
    ...overrideEnv,
  };
  return ConfigSchema.parse(env);
}

export function getReleaseIdentity(config: Config) {
  return {
    gitSha: config.GIT_SHA,
    containerDigest: config.CONTAINER_DIGEST,
    cloudRunRevision: config.CLOUD_RUN_REVISION,
    appVersion: config.APP_VERSION,
  };
}
