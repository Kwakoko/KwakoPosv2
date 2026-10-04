import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStoredSession,
  setStoredSession,
  restoreSession,
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

    // Verify stored in both
    expect(mockLocalStorage.getItem("kwakopos:v2:session")).toBeTruthy();
    expect(mockSessionStorage.getItem("kwakopos:v2:session")).toBeTruthy();

    const retrieved = getStoredSession();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sessionId).toBe("sess-12345");
    expect(retrieved?.accessToken).toBe("token-abc");
    // Refresh-token credentials are intentionally not persisted in browser storage.
    // The sessionId is the durable refresh handle for the HTTP-only server session.
    expect((retrieved as any)?.refreshToken).toBeUndefined();
    const raw = mockLocalStorage.getItem("kwakopos:v2:session");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("refresh-xyz");
    expect(retrieved?.user.name).toBe("Amina Cashier");
  });

  it("restores active unexpired JWT session instantly without requiring network refresh", async () => {
    // Generate valid unexpired JWT payload (exp in 1 hour)
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "usr-01", email: "cashier@kwakopos.com", exp }));
    const fakeJwt = `${header}.${payload}.signature`;

    const session: StoredSession = {
      sessionId: "sess-valid-jwt",
      accessToken: fakeJwt,
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

    // Mock fetch to ensure no network calls are needed for unexpired token
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const user = await restoreSession();
    expect(user).not.toBeNull();
    expect(user?.email).toBe("cashier@kwakopos.com");
    expect(getAccessToken()).toBe(fakeJwt);
    expect(fetchSpy).not.toHaveBeenCalled();
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
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network connection lost")));

    const user = await restoreSession();

    // Stored session MUST NOT be wiped out! User should stay logged in locally for offline operations
    expect(user).not.toBeNull();
    expect(user?.id).toBe("usr-01");
    expect(getStoredSession()).not.toBeNull();
    expect(getStoredSession()?.user.email).toBe("cashier@kwakopos.com");
  });
});
