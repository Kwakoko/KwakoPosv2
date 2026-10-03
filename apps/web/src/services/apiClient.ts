export interface LoginResponseUser {
  id: string;
  tenantId: string;
  branchId: string;
  email: string;
  name: string;
  role: string;
  tenantName?: string;
  tenantSlug?: string;
  branchName?: string;
  branchCode?: string;
}

export interface LoginResponse {
  success: boolean;
  data?: { accessToken: string; sessionId: string; user: LoginResponseUser };
  error?: { code?: string; message?: string };
}

export class SuperAdminSetupRequiredError extends Error {
  public readonly setupToken: string;
  public readonly passwordChangeRequired: boolean;
  public readonly mfaRequired: boolean;
  public readonly mfaEnrolled: boolean;

  constructor(message: string, data: { setupToken?: string; passwordChangeRequired?: boolean; mfaRequired?: boolean; mfaEnrolled?: boolean }) {
    super(message);
    this.name = "SuperAdminSetupRequiredError";
    this.setupToken = String(data.setupToken || "");
    this.passwordChangeRequired = Boolean(data.passwordChangeRequired);
    this.mfaRequired = Boolean(data.mfaRequired);
    this.mfaEnrolled = Boolean(data.mfaEnrolled);
  }
}

export class MfaRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MfaRequiredError";
  }
}

export interface StoredSession {
  sessionId: string;
  accessToken?: string;
  user: LoginResponseUser;
}

interface ApiErrorPayload {
  error?: { message?: string; code?: string };
}

const SESSION_KEY = "kwakopos:v2:session";
const LEGACY_TOKEN_KEY = "kwakopos_access_token";

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      raw = window.sessionStorage.getItem(SESSION_KEY);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.sessionId || !parsed.user) {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      accessToken: parsed.accessToken,
      user: parsed.user as LoginResponseUser,
    };
  } catch {
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
    return null;
  }
}

export function setStoredSession(session: StoredSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) {
    try { window.localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    try { window.localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* ignore */ }
  } else {
    const serialized = JSON.stringify(session);
    try { window.localStorage.setItem(SESSION_KEY, serialized); } catch { /* ignore */ }
    try { window.sessionStorage.setItem(SESSION_KEY, serialized); } catch { /* ignore */ }
    if (session.accessToken) {
      try { window.localStorage.setItem(LEGACY_TOKEN_KEY, session.accessToken); } catch { /* ignore */ }
    }
  }
}

let accessToken: string | null = typeof window !== "undefined" ? getStoredSession()?.accessToken || window.localStorage.getItem(LEGACY_TOKEN_KEY) || null : null;
let refreshInFlight: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    const stored = getStoredSession();
    if (stored?.accessToken) {
      accessToken = stored.accessToken;
      return accessToken;
    }
    const legacy = window.localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      accessToken = legacy;
      return accessToken;
    }
  }
  return null;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) {
        window.localStorage.setItem(LEGACY_TOKEN_KEY, token);
      } else {
        window.localStorage.removeItem(LEGACY_TOKEN_KEY);
      }
    } catch { /* ignore */ }
  }
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const url = typeof input === "string" && input.startsWith("/") && typeof window === "undefined"
    ? `http://127.0.0.1:${(globalThis as any).process?.env?.PORT || 3000}${input}`
    : input;
  const controller = typeof AbortController !== "undefined" && !init.signal ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(new Error("Request timed out after 15s")), 15000) : null;
  try {
    const response = await fetch(url, {
      ...init,
      signal: init.signal || controller?.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers || {}),
      },
      credentials: "include",
    });

    const body = (await response.json().catch(() => ({}))) as T & ApiErrorPayload & { data?: any };
    if (response.status === 401 && allowRefresh && getStoredSession() && !String(input).includes("/auth/")) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return requestJson<T>(input, init, false);
    }
    if (response.status === 428 && body?.error?.code === "SUPER_ADMIN_SETUP_REQUIRED") {
      throw new SuperAdminSetupRequiredError(body.error.message || "Super Admin security setup is required", body.data || {});
    }
    if (response.status === 401 && body?.error?.code === "MFA_REQUIRED") {
      throw new MfaRequiredError(body.error.message || "Valid Super Admin MFA code is required");
    }
    if (!response.ok) throw new Error(body?.error?.message || `Request failed with HTTP ${response.status}`);
    return body;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const stored = getStoredSession();
    if (!stored) return null;
    try {
      const result = await requestJson<{
        success: boolean;
        data?: { accessToken: string };
      }>(
        "/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            sessionId: stored.sessionId,
            email: stored.user.email,
            tenantId: stored.user.tenantId,
            branchId: stored.user.branchId,
            userId: stored.user.id,
          }),
        },
        false,
      );
      if (!result.success || !result.data?.accessToken) return null;
      accessToken = result.data.accessToken;
      setStoredSession({
        ...stored,
        accessToken: result.data.accessToken,
      });
      return accessToken;
    } catch (err) {
      console.warn("[Session] Token refresh attempt deferred:", err);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function login(email: string, password: string, mfaCode?: string): Promise<LoginResponseUser> {
  const result = await requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, deviceId: getDeviceId(), mfaCode }),
  }, false);
  if (!result.success || !result.data) throw new Error(result.error?.message || "Authentication failed");
  accessToken = result.data.accessToken;
  setStoredSession({
    sessionId: result.data.sessionId,
    accessToken: result.data.accessToken,
    user: result.data.user,
  });
  return result.data.user;
}

export interface SuperAdminSetupDetails {
  totpSecret: string;
  otpauthUri?: string;
  qrPayload?: string;
  currentOtp?: string;
  userId?: string;
  issuer?: string;
  account?: string;
}

export async function startSuperAdminSetup(setupToken: string): Promise<SuperAdminSetupDetails> {
  const result = await requestJson<{ success: boolean; data?: SuperAdminSetupDetails; error?: { message?: string; code?: string } }>("/auth/super-admin/setup/start", {
    method: "POST",
    body: JSON.stringify({ setupToken }),
  }, false);
  if (!result.success || !result.data) throw new Error(result.error?.message || "Failed to initiate Super Admin setup");
  return result.data;
}

export async function completeSuperAdminSetup(params: {
  setupToken: string;
  newPassword: string;
  totpSecret: string;
  totpCode: string;
}): Promise<void> {
  const result = await requestJson<{ success: boolean; data?: { completed: boolean }; error?: { message?: string; code?: string } }>("/auth/super-admin/setup/complete", {
    method: "POST",
    body: JSON.stringify(params),
  }, false);
  if (!result.success) throw new Error(result.error?.message || "Failed to complete Super Admin setup");
}

export async function changeSuperAdminPassword(currentPassword: string, newPassword: string, mfaCode: string): Promise<void> {
  const result = await requestJson<{ success: boolean; error?: { message?: string; code?: string } }>("/auth/super-admin/password-change", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword, mfaCode }),
  }, true);
  if (!result.success) throw new Error(result.error?.message || "Failed to change password");
}

export async function restoreSession(): Promise<LoginResponseUser | null> {
  const stored = getStoredSession();
  if (!stored || !stored.user) return null;

  // If stored accessToken is present and not expired, restore immediately
  if (stored.accessToken) {
    try {
      const parts = stored.accessToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (payload && typeof payload.exp === "number") {
          const expiresAtMs = payload.exp * 1000;
          if (expiresAtMs > Date.now() + 30000) {
            accessToken = stored.accessToken;
            return stored.user;
          }
        }
      }
    } catch {
      // Decode fallback
    }
  }

  const refreshed = await refreshAccessToken();
  if (refreshed) {
    return getStoredSession()?.user || stored.user;
  }

  // Preserve stored user so offline POS sessions do not get logged out on page refresh
  return stored.user;
}

export async function logout(): Promise<void> {
  const stored = getStoredSession();
  try {
    if (stored?.sessionId) {
      await requestJson("/auth/logout", { method: "POST", body: JSON.stringify({ sessionId: stored.sessionId }) }, false);
    }
  } catch (err) {
    console.warn("apiLogout error:", err);
  } finally {
    accessToken = null;
    setStoredSession(null);
  }
}

export interface SwitchContextResponse {
  success: boolean;
  data?: {
    accessToken: string;
    sessionId: string;
    user: LoginResponseUser;
    tenantName?: string;
    branchName?: string;
    isImpersonating?: boolean;
  };
  error?: { code?: string; message?: string };
}

export async function switchContext(
  targetTenantId?: string,
  targetBranchId?: string
): Promise<LoginResponseUser & { tenantName?: string; branchName?: string; isImpersonating?: boolean }> {
  const result = await requestJson<SwitchContextResponse>("/auth/switch-context", {
    method: "POST",
    body: JSON.stringify({ targetTenantId, targetBranchId }),
  }, true);
  if (!result.success || !result.data) throw new Error(result.error?.message || "Failed to switch context");
  accessToken = result.data.accessToken;
  const existing = getStoredSession();
  setStoredSession({
    sessionId: result.data.sessionId,
    accessToken: result.data.accessToken,
    user: result.data.user,
  });
  return {
    ...result.data.user,
    tenantName: result.data.tenantName,
    branchName: result.data.branchName,
    isImpersonating: result.data.isImpersonating,
  };
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
