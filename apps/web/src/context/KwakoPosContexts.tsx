import React, { createContext, useEffect, useMemo, useState } from "react";
import { LocalIndexedDbStore } from "../indexedDb.js";
import { ClientSyncEngine } from "../clientSyncEngine.js";
import { PwaVersionManager } from "../versionManager.js";
import { getAccessToken, login as apiLogin, logout as apiLogout, restoreSession, switchContext as apiSwitchContext } from "../services/apiClient.js";

export interface AuthUser { id: string; name: string; email: string; role: string; tenantId: string; branchId: string; }
interface JwtClaims { roles?: string[]; permissions?: string[]; }
function decodeClaims(token: string | null): JwtClaims {
  if (!token) return {};
  try { const payload = token.split(".")[1]; if (!payload) return {}; const normalized = payload.replace(/-/g, "+").replace(/_/g, "/"); const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="); return JSON.parse(atob(padded)) as JwtClaims; } catch { return {}; }
}
interface AuthContextType { user: AuthUser | null; isAuthenticated: boolean; isInitializing: boolean; error: string | null; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; }
const AuthContext = createContext<AuthContextType | null>(null); export const useAuth = () => useContext(AuthContext)!;
interface TenantContextType { currentTenantId: string | null; currentTenantName: string | null; availableTenants: { id: string; name: string }[]; switchTenant: (id: string) => Promise<void>; }
const TenantContext = createContext<TenantContextType | null>(null); export const useTenant = () => useContext(TenantContext)!;
interface BranchContextType { currentBranchId: string | null; currentBranchName: string | null; availableBranches: { id: string; name: string }[]; switchBranch: (id: string) => Promise<void>; }
const BranchContext = createContext<BranchContextType | null>(null); export const useBranch = () => useContext(BranchContext)!;
interface RbacContextType { role: string | null; permissions: string[]; hasPermission: (permission: string) => boolean; }
const RbacContext = createContext<RbacContextType | null>(null); export const useRbac = () => useContext(RbacContext)!;
interface ModuleContextType { activeModule: string | null; setActiveModule: (module: string) => void; }
const ModuleContext = createContext<ModuleContextType | null>(null); export const useModule = () => useContext(ModuleContext)!;
interface SyncContextType { isOnline: boolean; pendingOutboxCount: number; syncOutbox: () => Promise<void>; db: LocalIndexedDbStore; syncEngine: ClientSyncEngine; syncError: string | null; }
const SyncContext = createContext<SyncContextType | null>(null); export const useSync = () => useContext(SyncContext)!;
interface ThemeContextType { theme: "dark" | "light"; toggleTheme: () => void; }
const ThemeContext = createContext<ThemeContextType | null>(null); export const useTheme = () => useContext(ThemeContext)!;

export const KwakoPosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db] = useState(() => new LocalIndexedDbStore(3));
  const [syncEngine] = useState(() => new ClientSyncEngine(`web-${crypto.randomUUID?.() || Date.now()}`, db));
  useState(() => new PwaVersionManager("2.5.0", 3, db));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">((typeof localStorage !== "undefined" && localStorage.getItem("kwakopos:v2:theme") === "light") ? "light" : "dark");
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    db.ready.then(() => restoreSession()).then((restored) => { if (mounted && restored) setUser({ id: restored.id, name: restored.name, email: restored.email, role: restored.role, tenantId: restored.tenantId, branchId: restored.branchId }); }).catch((error) => { if (mounted) setAuthError(error instanceof Error ? error.message : "Session restore failed"); }).finally(() => { if (mounted) setIsInitializing(false); });
    return () => { mounted = false; };
  }, [db]);
  useEffect(() => { const updateOnline = () => setIsOnline(navigator.onLine); window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline); return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); }; }, []);
  useEffect(() => { void db.ready.then(() => setPendingOutboxCount(db.getPendingOutbox().length)); }, [db]);

  const login = async (email: string, password: string) => { setAuthError(null); const loggedIn = await apiLogin(email, password); setUser({ id: loggedIn.id, name: loggedIn.name, email: loggedIn.email, role: loggedIn.role, tenantId: loggedIn.tenantId, branchId: loggedIn.branchId }); };
  const logout = async () => { await apiLogout(); setUser(null); setActiveModule(null); setAuthError(null); };

  const claims = useMemo(() => decodeClaims(getAccessToken()), [user]);
  const permissions = useMemo(() => claims.permissions || [], [claims]);
  const currentTenantId = user?.tenantId || null;
  const currentBranchId = user?.branchId || null;

  const switchTenant = async (id: string) => {
    if (!id || id === currentTenantId) return;
    if (!isOnline) throw new Error("Tenant switching requires an online authorized context change.");
    try {
      const updated = await apiSwitchContext(id, currentBranchId || undefined);
      setUser(prev => prev ? { ...prev, tenantId: updated.tenantId, branchId: updated.branchId } : null);
      setAuthError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tenant context switch failed";
      setAuthError(message);
      throw error;
    }
  };

  const switchBranch = async (id: string) => {
    if (!id || id === currentBranchId) return;
    if (!isOnline) throw new Error("Branch switching requires an online authorized context change.");
    try {
      const updated = await apiSwitchContext(currentTenantId || undefined, id);
      setUser(prev => prev ? { ...prev, tenantId: updated.tenantId, branchId: updated.branchId } : null);
      setAuthError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Branch context switch failed";
      setAuthError(message);
      throw error;
    }
  };

  const syncOutbox = async () => {
    if (!user || !isOnline) return;
    setSyncError(null);
    await db.ready;
    await syncEngine.syncWithServer(async (request) => {
      const response = await fetch("/sync/push", { method: "POST", headers: { "Content-Type": "application/json", ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) }, credentials: "include", body: JSON.stringify(request) });
      if (!response.ok) throw new Error(`Sync push failed: HTTP ${response.status}`);
      const body = await response.json(); return body.data || body;
    }, async (since) => {
      const response = await fetch(since ? `/sync/delta?since=${encodeURIComponent(since)}` : "/sync/delta", { headers: { ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) }, credentials: "include" });
      if (!response.ok) throw new Error(`Sync delta failed: HTTP ${response.status}`);
      const body = await response.json(); return body.data || body;
    }).then(() => setPendingOutboxCount(db.getPendingOutbox().length)).catch((error) => { setSyncError(error instanceof Error ? error.message : "Synchronization failed"); throw error; });
  };

  const tenantValue: TenantContextType = { currentTenantId, currentTenantName: currentTenantId, availableTenants: currentTenantId ? [{ id: currentTenantId, name: currentTenantId }] : [], switchTenant };
  const branchValue: BranchContextType = { currentBranchId, currentBranchName: currentBranchId, availableBranches: currentBranchId ? [{ id: currentBranchId, name: currentBranchId }] : [], switchBranch };
  const rbacValue: RbacContextType = { role: user?.role || null, permissions, hasPermission: (permission) => permissions.includes("*") || permissions.includes(permission) };
  const syncValue: SyncContextType = { isOnline, pendingOutboxCount, syncOutbox, db, syncEngine, syncError };
  const themeValue: ThemeContextType = { theme, toggleTheme: () => setTheme(current => { const next = current === "dark" ? "light" : "dark"; if (typeof localStorage !== "undefined") localStorage.setItem("kwakopos:v2:theme", next); return next; }) };
  const authValue: AuthContextType = { user, isAuthenticated: Boolean(user), isInitializing, error: authError, login, logout };
  return <AuthContext.Provider value={authValue}><TenantContext.Provider value={tenantValue}><BranchContext.Provider value={branchValue}><RbacContext.Provider value={rbacValue}><ModuleContext.Provider value={{ activeModule, setActiveModule }}><SyncContext.Provider value={syncValue}><ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider></SyncContext.Provider></ModuleContext.Provider></RbacContext.Provider></BranchContext.Provider></TenantContext.Provider></AuthContext.Provider>;
};
