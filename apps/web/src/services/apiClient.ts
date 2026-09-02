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
  data?: { accessToken: string; sessionId: string; user: LoginResponseUser };
  error?: { code?: string; message?: string };
}

interface StoredSession {
  sessionId: string;
  user: LoginResponseUser;
}

interface ApiErrorPayload {
  error?: { message?: string; code?: string };
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
const SESSION_KEY = "kwakopos:v2:session";

export function getAccessToken(): string | null { return accessToken; }
export function setAccessToken(token: string | null): void { accessToken = token; }

function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.sessionId || !parsed.user) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { sessionId: parsed.sessionId, user: parsed.user as LoginResponseUser };
  } catch {
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    return null;
  }
}

function setStoredSession(session: StoredSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) window.sessionStorage.removeItem(SESSION_KEY);
  else window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit = {}, allowRefresh = true): Promise<T> {
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

  const body = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (response.status === 401 && allowRefresh && getStoredSession() && !String(input).includes("/auth/")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return requestJson<T>(input, init, false);
  }
  if (!response.ok) throw new Error(body?.error?.message || `Request failed with HTTP ${response.status}`);
  return body;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const stored = getStoredSession();
    if (!stored) return null;
    try {
      const result = await requestJson<{ success: boolean; data?: { accessToken: string } }>(
        "/auth/refresh",
        { method: "POST", body: JSON.stringify({ sessionId: stored.sessionId }) },
        false,
      );
      if (!result.success || !result.data?.accessToken) return null;
      accessToken = result.data.accessToken;
      return accessToken;
    } catch {
      accessToken = null;
      setStoredSession(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function login(email: string, password: string): Promise<LoginResponseUser> {
  const result = await requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, deviceId: getDeviceId() }),
  }, false);
  if (!result.success || !result.data) throw new Error(result.error?.message || "Authentication failed");
  accessToken = result.data.accessToken;
  setStoredSession({ sessionId: result.data.sessionId, user: result.data.user });
  return result.data.user;
}

export async function restoreSession(): Promise<LoginResponseUser | null> {
  const stored = getStoredSession();
  if (!stored) return null;
  const refreshed = await refreshAccessToken();
  if (!refreshed) return null;
  return getStoredSession()?.user || null;
}

export async function logout(): Promise<void> {
  const stored = getStoredSession();
  try {
    if (stored) await requestJson("/auth/logout", { method: "POST", body: JSON.stringify({ sessionId: stored.sessionId }) }, false);
  } finally {
    accessToken = null;
    setStoredSession(null);
  }
}

export async function switchContext(targetTenantId?: string, targetBranchId?: string): Promise<LoginResponseUser> {
  const result = await requestJson<LoginResponse>("/auth/switch-context", {
    method: "POST",
    body: JSON.stringify({ targetTenantId, targetBranchId }),
  }, true);
  if (!result.success || !result.data) throw new Error(result.error?.message || "Failed to switch context");
  accessToken = result.data.accessToken;
  setStoredSession({ sessionId: result.data.sessionId, user: result.data.user });
  return result.data.user;
}

export async function apiFetch<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  return requestJson<T>(input, init, true);
}

export function safeUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch { /* fallback */ }
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "server-rendered-client";
  const key = "kwakopos:v2:device-id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = `web-${safeUUID()}`;
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return `web-${safeUUID()}`;
  }
}
