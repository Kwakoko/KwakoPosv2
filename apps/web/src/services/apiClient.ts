export interface LoginResponseUser {
  id: string;
  tenantId: string;
  branchId: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    user: LoginResponseUser;
  };
  error?: { code?: string; message?: string };
}

interface StoredSession {
  sessionId: string;
  refreshToken: string;
  user: LoginResponseUser;
}

let accessToken: string | null = null;

const SESSION_KEY = "kwakopos:v2:session";

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function setStoredSession(session: StoredSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers || {}),
    },
    credentials: "include",
  });

  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body?.error?.message || `Request failed with HTTP ${response.status}`);
  }
  return body;
}

export async function login(email: string, password: string): Promise<LoginResponseUser> {
  const result = await requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, deviceId: getDeviceId() }),
  });
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || "Authentication failed");
  }
  accessToken = result.data.accessToken;
  setStoredSession({
    sessionId: result.data.sessionId,
    refreshToken: result.data.refreshToken,
    user: result.data.user,
  });
  return result.data.user;
}

export async function restoreSession(): Promise<LoginResponseUser | null> {
  const stored = getStoredSession();
  if (!stored) return null;

  try {
    const result = await requestJson<{
      success: boolean;
      data?: { accessToken: string; refreshToken: string; user?: LoginResponseUser };
    }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({
        sessionId: stored.sessionId,
        refreshToken: stored.refreshToken,
        email: stored.user.email,
        tenantId: stored.user.tenantId,
        branchId: stored.user.branchId,
        userId: stored.user.id,
      }),
    });

    if (!result.success || !result.data) throw new Error("Session refresh failed");
    accessToken = result.data.accessToken;
    setStoredSession({
      ...stored,
      refreshToken: result.data.refreshToken,
      user: result.data.user || stored.user,
    });
    return result.data.user || stored.user;
  } catch {
    accessToken = null;
    setStoredSession(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  const stored = getStoredSession();
  try {
    if (stored) {
      await requestJson("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ sessionId: stored.sessionId }),
      });
    }
  } finally {
    accessToken = null;
    setStoredSession(null);
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  return requestJson<T>(input, init);
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "server-rendered-client";
  const key = "kwakopos:v2:device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const generated = `web-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, generated);
  return generated;
}
