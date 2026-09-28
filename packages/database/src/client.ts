import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

if (typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile();
  } catch {
    // Search parent directories for monorepo root .env
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../../.env"),
      path.resolve(process.cwd(), "../.env"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          (process as any).loadEnvFile(candidate);
          break;
        } catch {
          // ignore
        }
      }
    }
  }
}

export const prisma = new PrismaClient();
