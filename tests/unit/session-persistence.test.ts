import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStoredSession,
  setStoredSession,
  restoreSession,
  validateSession,
  getAccessToken,
  setAccessToken,
  type StoredSession,
} from "../../apps/web/src/services/apiClient.js";

// Mock localStorage and sessionStorage
class MemoryStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) || null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] || null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

describe("Session Persistence & Refresh Resilience Engine", () => {
  let mockLocalStorage: MemoryStorage;
  let mockSessionStorage: MemoryStorage;

  beforeEach(() => {
    mockLocalStorage = new MemoryStorage();
    mockSessionStorage = new MemoryStorage();

    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("sessionStorage", mockSessionStorage);
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage,
      sessionStorage: mockSessionStorage,
      location: { pathname: "/pos" },
    });

    setStoredSession(null);
    setAccessToken(null);
  });

  it("persists session in both localStorage and sessionStorage on setStoredSession", () => {
    const session: StoredSession = {
      sessionId: "sess-12345",
      accessToken: "token-abc",
      user: {
        id: "usr-01",
        email: "cashier@kwakopos.com",
        name: "Amina Cashier",
        role: "CASHIER",
        tenantId: "tnt-tz-01",
        branchId: "br-kariakoo-01",
      },
    };

    setStoredSession(session);

    // Default non-remembered sessions stay in sessionStorage only.
    expect(mockLocalStorage.getItem("kwakopos:v2:session")).toBeNull();
    expect(mockSessionStorage.getItem("kwakopos:v2:session")).toBeTruthy();

    const retrieved = getStoredSession();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sessionId).toBe("sess-12345");
    expect(retrieved?.accessToken).toBeUndefined();
    // Refresh-token credentials are intentionally not persisted in browser storage.
    // The sessionId is the durable refresh handle for the HTTP-only server session.
    expect((retrieved as any)?.refreshToken).toBeUndefined();
    const raw = mockSessionStorage.getItem("kwakopos:v2:session");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("refresh-xyz");
    expect(retrieved?.user.name).toBe("Amina Cashier");
  });

  it("restores a durable session through the server refresh handle", async () => {
    const session: StoredSession = {
      sessionId: "sess-valid-refresh",
      user: {
        id: "usr-01",
        email: "cashier@kwakopos.com",
        name: "Amina Cashier",
        role: "CASHIER",
        tenantId: "tnt-tz-01",
        branchId: "br-kariakoo-01",
      },
    };

    setStoredSession(session);

    const refreshedJwt = "header.payload.signature";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { accessToken: refreshedJwt } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const user = await restoreSession();
    expect(user).not.toBeNull();
    expect(user?.email).toBe("cashier@kwakopos.com");
    expect(getAccessToken()).toBe(refreshedJwt);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/auth/refresh");
  });

  it("preserves the session identity when refresh has a transient online server failure", async () => {
    const session: StoredSession = {
      sessionId: "sess-transient-refresh",
      user: {
        id: "usr-01",
        email: "cashier@kwakopos.com",
        name: "Amina Cashier",
        role: "CASHIER",
        tenantId: "tnt-tz-01",
        branchId: "br-kariakoo-01",
      },
    };
    setStoredSession(session);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Try again" } }),
    }));

    const user = await restoreSession();

    expect(user?.id).toBe("usr-01");
    expect(getStoredSession()?.sessionId).toBe("sess-transient-refresh");
    expect(getAccessToken()).toBeNull();
  });

  it("restores the same valid session repeatedly after access-token memory resets", async () => {
    setStoredSession({
      sessionId: "sess-repeat-refresh",
      user: {
        id: "usr-01",
        email: "cashier@kwakopos.com",
        name: "Amina Cashier",
        role: "CASHIER",
        tenantId: "tnt-tz-01",
        branchId: "br-kariakoo-01",
      },
    });
    vi.stubGlobal("navigator", { onLine: true });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { accessToken: "fresh-access-token" } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      setAccessToken(null);
      const restored = await restoreSession();
      expect(restored?.id).toBe("usr-01");
      expect(getAccessToken()).toBe("fresh-access-token");
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("refreshes an expired access token before accepting session validation", async () => {
    setStoredSession({
      sessionId: "sess-validate-refresh",
      user: {
        id: "usr-01",
        email: "cashier@kwakopos.com",
        name: "Amina Cashier",
        role: "CASHIER",
        tenantId: "tnt-tz-01",
        branchId: "br-kariakoo-01",
      },
    });
    vi.stubGlobal("navigator", { onLine: true });
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { code: "AUTH_REQUIRED", message: "Access token expired" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { accessToken: "refreshed-access-token" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { valid: true } }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateSession();

    expect(result.data.valid).toBe(true);
    expect(getAccessToken()).toBe("refreshed-access-token");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      "/auth/session/validate",
      "/auth/refresh",
      "/auth/session/validate",
    ]);
  });

  it("clears a session only when the server confirms it expired or was revoked", async () => {
    setStoredSession({
      sessionId: "sess-expired",
      user: {
        id: "usr-01",
        email: "cashier@kwakopos.com",
        name: "Amina Cashier",
        role: "CASHIER",
        tenantId: "tnt-tz-01",
        branchId: "br-kariakoo-01",
      },
    });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: { code: "SESSION_EXPIRED", message: "Session expired" } }),
    }));

    const user = await restoreSession();

    expect(user).toBeNull();
    expect(getStoredSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("does NOT wipe stored session on refresh failures or network drops", async () => {
    // Token is expired (exp in past)
    const exp = Math.floor(Date.now() / 1000) - 3600;
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "usr-01", email: "cashier@kwakopos.com", exp }));
    const expiredJwt = `${header}.${payload}.signature`;

    const session: StoredSession = {
      sessionId: "sess-expired-offline",
      accessToken: expiredJwt,
      user: {
        id: "usr-01",
        email: "cashier@kwakopos.com",
        name: "Amina Cashier",
        role: "CASHIER",
        tenantId: "tnt-tz-01",
        branchId: "br-kariakoo-01",
      },
    };

    setStoredSession(session);

    // Mock network failure (e.g. offline POS terminal)
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network connection lost")));

    const user = await restoreSession();

    // Stored session MUST NOT be wiped out! User should stay logged in locally for offline operations
    expect(user).not.toBeNull();
    expect(user?.id).toBe("usr-01");
    expect(getStoredSession()).not.toBeNull();
    expect(getStoredSession()?.user.email).toBe("cashier@kwakopos.com");
  });
});
