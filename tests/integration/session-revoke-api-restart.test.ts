import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { once } from "node:events";
import { hashPassword } from "@kwakopos2/auth";
import { prisma } from "@kwakopos2/database";

const ROOT = process.cwd();
const API_PORT = 3011;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const STARTUP_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 60_000;

describe("session revoke survives API restart", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const email = `session-restart-${tenantId.slice(0, 8)}@kwakopos.test`;
  const password = "SessionProof!123";
  let api: ChildProcess | null = null;
  let apiPidBeforeRestart: number | null = null;

  const startApi = async (): Promise<void> => {
    const tsxCli = resolve(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
    api = spawn(process.execPath, [tsxCli, "apps/api/src/testServerFixed.ts"], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: String(API_PORT),
        KWAKOPOS_MOCK_AUTH: "false",
        KWAKOPOS_DISABLE_SUPPORT_AUTOMATION: "true",
        JWT_SECRET: process.env.JWT_SECRET || "kwakopos-ci-session-restart-test-secret-20261004",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let output = "";
    const capture = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8000);
    };
    api.stdout?.on("data", capture);
    api.stderr?.on("data", capture);

    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (api.exitCode !== null) {
        throw new Error(`API exited during startup with code ${api.exitCode}. Output: ${output}`);
      }
      try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) return;
      } catch {
        // Server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`API did not become healthy within ${STARTUP_TIMEOUT_MS}ms. Output: ${output}`);
  };

  const stopApi = async (): Promise<void> => {
    if (!api || api.exitCode !== null) return;
    const currentPid = api.pid;
    if (process.platform === "win32" && currentPid) {
      const killer = spawn("taskkill.exe", ["/PID", String(currentPid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      await once(killer, "exit");
    } else {
      api.kill("SIGTERM");
      await Promise.race([
        once(api, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (api.exitCode === null) api.kill("SIGKILL");
    }
    api = null;
  };

  beforeAll(async () => {
    const passwordHash = await hashPassword(password);
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "Session Restart Proof",
        slug: `session-restart-${tenantId.slice(0, 8)}`,
        branches: {
          create: { id: branchId, name: "Proof Branch", code: `SRP-${branchId.slice(0, 8)}` },
        },
        roles: {
          create: { id: roleId, name: "ADMIN", permissions: ["users.manage", "roles.manage"] },
        },
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        branchId,
        roleId,
        email,
        name: "Session Restart Proof",
        passwordHash,
        status: "ACTIVE",
      },
    });
    await startApi();
    apiPidBeforeRestart = api?.pid ?? null;
  }, 60_000);

  afterAll(async () => {
    await stopApi();
    await prisma.tenant.delete({ where: { id: tenantId } });
  }, 60_000);

  it("persists revocation in PostgreSQL and rejects the same token after a fresh API process starts", async () => {
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, deviceId: "SESSION-RESTART-PROOF" }),
    });
    expect(loginResponse.ok).toBe(true);
    const login = await loginResponse.json() as any;
    const accessToken = String(login?.data?.accessToken || "");
    const sessionId = String(login?.data?.sessionId || "");
    expect(accessToken).not.toBe("");
    expect(sessionId).not.toBe("");

    const acceptance = await fetch(`${API_URL}/api/legal/acceptance/accept-all`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(acceptance.ok).toBe(true);

    const authorized = await fetch(`${API_URL}/sync/delta?since=rev:0`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(authorized.status).toBe(200);

    const revokeResponse = await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    expect(revokeResponse.status).toBe(200);

    const persisted = await prisma.deviceSession.findUnique({ where: { id: sessionId } });
    expect(persisted?.revokedAt).toBeTruthy();

    const deniedBeforeRestart = await fetch(`${API_URL}/sync/delta?since=rev:0`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(deniedBeforeRestart.status).toBe(401);

    await stopApi();
    await startApi();
    const apiPidAfterRestart = api?.pid ?? null;
    expect(apiPidBeforeRestart).toBeTruthy();
    expect(apiPidAfterRestart).toBeTruthy();
    expect(apiPidAfterRestart).not.toBe(apiPidBeforeRestart);

    const deniedAfterRestart = await fetch(`${API_URL}/sync/delta?since=rev:0`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(deniedAfterRestart.status).toBe(401);

    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sessionId, refreshToken: "intentionally-invalid" }),
    });
    expect(refreshed.status).toBe(401);
  }, TEST_TIMEOUT_MS);
});
