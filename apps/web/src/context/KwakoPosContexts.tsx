import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LocalIndexedDbStore } from "../indexedDb.js";
import { ClientSyncEngine } from "../clientSyncEngine.js";
import { PwaVersionManager } from "../versionManager.js";
import { getAccessToken, login as apiLogin, logout as apiLogout, restoreSession } from "../services/apiClient.js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  branchId: string;
}

interface JwtClaims {
  roles?: string[];
  permissions?: string[];
}

function decodeClaims(token: string | null): JwtClaims {
  if (!token) return {};
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized)) as JwtClaims;
  } catch {
    return {};
  }
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = () => useContext(AuthContext)!;

interface TenantContextType {
  currentTenantId: string | null;
  currentTenantName: string | null;
  availableTenants: { id: string; name: string }[];
  switchTenant: (id: string) => void;
}

const TenantContext = createContext<TenantContextType | null>(null);
export const useTenant = () => useContext(TenantContext)!;

interface BranchContextType {
  currentBranchId: string | null;
  currentBranchName: string | null;
  availableBranches: { id: string; name: string }[];
  switchBranch: (id: string) => void;
}

const BranchContext = createContext<BranchContextType | null>(null);
export const useBranch = () => useContext(BranchContext)!;

interface RbacContextType {
  role: string | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
}

const RbacContext = createContext<RbacContextType | null>(null);
export const useRbac = () => useContext(RbacContext)!;

interface ModuleContextType {
  activeModule: string | null;
  setActiveModule: (module: string) => void;
}

const ModuleContext = createContext<ModuleContextType | null>(null);
export const useModule = () => useContext(ModuleContext)!;

interface SyncContextType {
  isOnline: boolean;
  pendingOutboxCount: number;
  syncOutbox: () => Promise<void>;
  db: LocalIndexedDbStore;
  syncEngine: ClientSyncEngine;
  syncError: string | null;
}

const SyncContext = createContext<SyncContextType | null>(null);
export const useSync = () => useContext(SyncContext)!;

interface ThemeContextType {
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);
export const useTheme = () => useContext(ThemeContext)!;

export const KwakoPosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db] = useState(() => new LocalIndexedDbStore());
  const [syncEngine] = useState(() => new ClientSyncEngine(`web-${crypto.randomUUID?.() || Date.now()}`, db));
  const [versionManager] = useState(() => new PwaVersionManager("2.5.0", 3, db));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">((localStorage.getItem("kwakopos:v2:theme") as "dark" | "light") || "dark");
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    restoreSession().then((restored) => {
      if (!mounted) return;
      if (restored) {
        setUser({
          id: restored.id,
          name: restored.name,
          email: restored.email,
          role: restored.role,
          tenantId: restored.tenantId,
          branchId: restored.branchId,
        });
        setCurrentTenantId(restored.tenantId);
        setCurrentBranchId(restored.branchId);
      }
    }).catch(() => undefined).finally(() => mounted && setIsInitializing(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    setPendingOutboxCount(db.getPendingOutbox().length);
  }, [db]);

  const login = async (email: string, password: string) => {
    setAuthError(null);
    const loggedIn = await apiLogin(email, password);
    setUser({
      id: loggedIn.id,
      name: loggedIn.name,
      email: loggedIn.email,
      role: loggedIn.role,
      tenantId: loggedIn.tenantId,
      branchId: loggedIn.branchId,
    });
    setCurrentTenantId(loggedIn.tenantId);
    setCurrentBranchId(loggedIn.branchId);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setCurrentTenantId(null);
    setCurrentBranchId(null);
    setActiveModule(null);
  };

  const claims = useMemo(() => decodeClaims(getAccessToken()), [user]);
  const permissions = useMemo(() => claims.permissions || [], [claims]);
  const roles = useMemo(() => claims.roles || (user?.role ? [user.role] : []), [claims, user?.role]);

  const switchTenant = (id: string) => {
    if (!user || id !== user.tenantId) throw new Error("Tenant switching requires an authorized V2 tenant-context API");
  };

  const switchBranch = (id: string) => {
    if (!user || id !== user.branchId) throw new Error("Branch switching requires an authorized V2 branch-context API");
  };

  const syncOutbox = async () => {
    if (!user || !isOnline) return;
    try {
      setSyncError(null);
      await syncEngine.syncWithServer(
        async (request) => {
          const response = await fetch("/api/v1/sync/push", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
            credentials: "include",
            body: JSON.stringify(request),
          });
          if (!response.ok) throw new Error(`Sync push failed: HTTP ${response.status}`);
          return response.json();
        },
        async (since) => {
          const url = since ? `/api/v1/sync/delta?since=${encodeURIComponent(since)}` : "/api/v1/sync/delta";
          const response = await fetch(url, {
            headers: { ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
            credentials: "include",
          });
          if (!response.ok) throw new Error(`Sync delta failed: HTTP ${response.status}`);
          return response.json();
        },
      );
      setPendingOutboxCount(db.getPendingOutbox().length);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Synchronization failed";
      setSyncError(message);
      throw error;
    }
  };

  const authValue = { user, isAuthenticated: Boolean(user), isInitializing, error: authError, login, logout };
  const tenantName = currentTenantId ? currentTenantId : null;
  const branchName = currentBranchId ? currentBranchId : null;
  const tenantValue = { currentTenantId, currentTenantName: tenantName, availableTenants: user ? [{ id: user.tenantId, name: tenantName || user.tenantId }] : [], switchTenant };
  const branchValue = { currentBranchId, currentBranchName: branchName, availableBranches: user ? [{ id: user.branchId, name: branchName || user.branchId }] : [], switchBranch };
  const rbacValue = { role: user?.role || null, permissions, hasPermission: (permission: string) => permissions.includes("*") || permissions.includes(permission) };
  const syncValue = { isOnline, pendingOutboxCount, syncOutbox, db, syncEngine, syncError };
  const themeValue = { theme, toggleTheme: () => setTheme((current) => { const next = current === "dark" ? "light" : "dark"; localStorage.setItem("kwakopos:v2:theme", next); return next; }) };

  return (
    <AuthContext.Provider value={authValue}>
      <TenantContext.Provider value={tenantValue}>
        <BranchContext.Provider value={branchValue}>
          <RbacContext.Provider value={rbacValue}>
            <ModuleContext.Provider value={{ activeModule, setActiveModule }}>
              <SyncContext.Provider value={syncValue}>
                <ThemeContext.Provider value={themeValue}>
                  {children}
                </ThemeContext.Provider>
              </SyncContext.Provider>
            </ModuleContext.Provider>
          </RbacContext.Provider>
        </BranchContext.Provider>
      </TenantContext.Provider>
    </AuthContext.Provider>
  );
};
