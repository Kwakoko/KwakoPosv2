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
  data?: { accessToken: string; refreshToken: string; sessionId: string; user: LoginResponseUser };
  error?: { code?: string; message?: string };
}

interface StoredSession { sessionId: string; refreshToken: string; user: LoginResponseUser; }
interface ApiErrorPayload { error?: { message?: string; code?: string } }

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
const SESSION_KEY = "kwakopos:v2:session";

export function getAccessToken(): string | null { return accessToken; }
export function setAccessToken(token: string | null): void { accessToken = token; }

function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch { return null; }
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
      const result = await requestJson<{ success: boolean; data?: { accessToken: string; refreshToken: string } }>(
        "/auth/refresh",
        { method: "POST", body: JSON.stringify({ sessionId: stored.sessionId, refreshToken: stored.refreshToken }) },
        false,
      );
      if (!result.success || !result.data) return null;
      accessToken = result.data.accessToken;
      setStoredSession({ ...stored, refreshToken: result.data.refreshToken });
      return accessToken;
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("Invalid") || message.includes("expired") || message.includes("revoked") || message.includes("401")) {
        accessToken = null;
        setStoredSession(null);
      }
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
  setStoredSession({ sessionId: result.data.sessionId, refreshToken: result.data.refreshToken, user: result.data.user });
  return result.data.user;
}

export async function restoreSession(): Promise<LoginResponseUser | null> {
  const stored = getStoredSession();
  if (!stored) return null;
  try {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return null;
    return getStoredSession()?.user || stored.user;
  } catch (error: any) {
    throw new Error(error?.message || "Unable to restore session");
  }
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

export async function apiFetch<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> { return requestJson<T>(input, init, true); }

function getDeviceId(): string {
  if (typeof window === "undefined") return "server-rendered-client";
  const key = "kwakopos:v2:device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const generated = `web-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, generated);
  return generated;
}
