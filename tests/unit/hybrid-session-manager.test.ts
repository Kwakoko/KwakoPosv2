import { describe, expect, it } from "vitest";
import { DEFAULT_SESSION_POLICY, SessionManager, type SessionRecord, type SessionStoreProvider } from "@kwakopos2/auth";

function createStore(): SessionStoreProvider & { records: Map<string, SessionRecord> } {
  const records = new Map<string, SessionRecord>();
  return {
    records,
    async create(record) { records.set(record.id, structuredClone(record)); },
    async get(id) { return records.get(id) ? structuredClone(records.get(id)!) : null; },
    async update(record) { records.set(record.id, structuredClone(record)); },
    async revokeAllForUser(tenantId, userId, reason = "TEST") {
      let count = 0;
      for (const record of records.values()) {
        if (record.tenantId === tenantId && record.userId === userId && !record.revokedAt) {
          record.revokedAt = new Date();
          record.status = "REVOKED";
          record.revokeReason = reason;
          records.set(record.id, record);
          count++;
        }
      }
      return count;
    },
    async revokeTokenFamily(tokenFamilyId, reason, at = new Date()) {
      let count = 0;
      for (const record of records.values()) {
        if (record.tokenFamilyId === tokenFamilyId && !record.revokedAt) {
          record.revokedAt = at;
          record.status = "REVOKED";
          record.revokeReason = reason;
          records.set(record.id, record);
          count++;
        }
      }
      return count;
    },
  };
}

describe("Hybrid Session Manager", () => {
  it("uses the merged production defaults", () => {
    expect(DEFAULT_SESSION_POLICY.idleTimeoutMs).toBe(30 * 60_000);
    expect(DEFAULT_SESSION_POLICY.warningDurationMs).toBe(2 * 60_000);
    expect(DEFAULT_SESSION_POLICY.absoluteTimeoutMs).toBe(8 * 60 * 60_000);
    expect(DEFAULT_SESSION_POLICY.offlineGracePeriodMs).toBe(24 * 60 * 60_000);
    expect(DEFAULT_SESSION_POLICY.heartbeatIntervalMs).toBe(5 * 60_000);
  });

  it("creates a tenant + branch + device scoped persistent session", async () => {
    const provider = createStore();
    const manager = new SessionManager();
    manager.setStoreProvider(provider);
    const result = await manager.createSession({
      tenantId: "tenant-a",
      userId: "user-a",
      branchId: "branch-a",
      deviceId: "device-a",
    });
    const saved = provider.records.get(result.sessionId);
    expect(saved?.tenantId).toBe("tenant-a");
    expect(saved?.branchId).toBe("branch-a");
    expect(saved?.deviceId).toBe("device-a");
    expect(saved?.refreshTokenHash).not.toBe(result.refreshToken);
    expect(saved?.idleTimeoutMs).toBe(30 * 60_000);
  });

  it("rejects idle sessions server-side", async () => {
    const provider = createStore();
    const manager = new SessionManager();
    manager.setStoreProvider(provider);
    const now = new Date("2026-10-04T10:00:00.000Z");
    const created = await manager.createSession({
      tenantId: "tenant-a",
      userId: "user-a",
      branchId: "branch-a",
      deviceId: "device-a",
      idleTimeoutMs: 5 * 60_000,
      absoluteLifetimeMs: 60 * 60_000,
      refreshTokenLifetimeMs: 24 * 60 * 60_000,
    });
    const session = provider.records.get(created.sessionId)!;
    session.lastActivityAt = new Date(now.getTime() - 6 * 60_000);
    provider.records.set(session.id, session);

    const validation = await manager.validateSession(session.id, { now });
    expect(validation.valid).toBe(false);
    expect(validation.code).toBe("SESSION_EXPIRED");
    expect(provider.records.get(session.id)?.revokeReason).toBe("SESSION_TIMEOUT");
  });

  it("refuses refresh after idle expiry even when the refresh token is correct", async () => {
    const provider = createStore();
    const manager = new SessionManager();
    manager.setStoreProvider(provider);
    const now = new Date("2026-10-04T10:00:00.000Z");
    const created = await manager.createSession({
      tenantId: "tenant-a",
      userId: "user-a",
      branchId: "branch-a",
      deviceId: "device-a",
      idleTimeoutMs: 5 * 60_000,
      absoluteLifetimeMs: 60 * 60_000,
      refreshTokenLifetimeMs: 24 * 60 * 60_000,
    });
    const session = provider.records.get(created.sessionId)!;
    session.lastActivityAt = new Date(now.getTime() - 6 * 60_000);
    provider.records.set(session.id, session);

    const rotated = await manager.rotateRefreshToken(
      session.id,
      created.refreshToken,
      { sub: "user-a", tenantId: "tenant-a", branchId: "branch-a", roles: ["CASHIER"], permissions: [] },
    );
    expect(rotated).toBeNull();
    expect(provider.records.get(session.id)?.revokeReason).toBe("SESSION_TIMEOUT");
  });

  it("detects refresh-token reuse and revokes the token family", async () => {
    const provider = createStore();
    provider.atomicRotateRefreshToken = async (sessionId, expectedHash, replacementHash, now) => {
      const current = provider.records.get(sessionId);
      if (!current) return { rotated: false, reused: false, session: null };
      if (current.refreshTokenHash !== expectedHash) {
        return { rotated: false, reused: current.status === "ACTIVE" && !current.revokedAt, session: structuredClone(current) };
      }
      current.refreshTokenHash = replacementHash;
      current.lastValidatedAt = now;
      provider.records.set(sessionId, current);
      return { rotated: true, reused: false, session: structuredClone(current) };
    };

    const manager = new SessionManager();
    manager.setStoreProvider(provider);
    const created = await manager.createSession({
      tenantId: "tenant-a",
      userId: "user-a",
      branchId: "branch-a",
      deviceId: "device-a",
    });
    const first = await manager.rotateRefreshToken(
      created.sessionId,
      created.refreshToken,
      { sub: "user-a", tenantId: "tenant-a", branchId: "branch-a", roles: ["CASHIER"], permissions: [] },
    );
    expect(first?.refreshToken).toBeTruthy();

    const reused = await manager.rotateRefreshToken(
      created.sessionId,
      created.refreshToken,
      { sub: "user-a", tenantId: "tenant-a", branchId: "branch-a", roles: ["CASHIER"], permissions: [] },
    );
    expect(reused).toBeNull();
    expect(provider.records.get(created.sessionId)?.status).toBe("REVOKED");
  });

  it("fails closed on cross-tenant session validation", async () => {
    const provider = createStore();
    const manager = new SessionManager();
    manager.setStoreProvider(provider);
    const created = await manager.createSession({
      tenantId: "tenant-a",
      userId: "user-a",
      branchId: "branch-a",
      deviceId: "device-a",
    });
    const result = await manager.validateSession(created.sessionId, { tenantId: "tenant-b" });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("TENANT_MISMATCH");
  });
});
