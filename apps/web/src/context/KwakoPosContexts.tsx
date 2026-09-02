import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { LocalIndexedDbStore } from "../indexedDb.js";
import { ClientSyncEngine } from "../clientSyncEngine.js";
import { PwaVersionManager } from "../versionManager.js";
import {
  getAccessToken,
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  switchContext as apiSwitchContext,
} from "../services/apiClient.js";
import {
  type IndustryModule,
  type ModuleManifest,
  type SidebarItem,
  MODULE_MANIFESTS,
  ALL_MODULE_KEYS,
  searchModules as registrySearchModules,
  getDefaultTab,
} from "../modules/moduleRegistry.js";

export type { IndustryModule, ModuleManifest, SidebarItem };

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
  moduleEntitlements?: string[];
}

function decodeClaims(token: string | null): JwtClaims {
  if (!token) return {};
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as JwtClaims;
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
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside KwakoPosProvider");
  return ctx;
};

interface TenantContextType {
  currentTenantId: string | null;
  currentTenantName: string | null;
  availableTenants: { id: string; name: string }[];
  switchTenant: (id: string) => Promise<void>;
}
const TenantContext = createContext<TenantContextType | null>(null);
export const useTenant = () => {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used inside KwakoPosProvider");
  return ctx;
};

interface BranchContextType {
  currentBranchId: string | null;
  currentBranchName: string | null;
  availableBranches: { id: string; name: string }[];
  switchBranch: (id: string) => Promise<void>;
}
const BranchContext = createContext<BranchContextType | null>(null);
export const useBranch = () => {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside KwakoPosProvider");
  return ctx;
};

interface RbacContextType {
  role: string | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isSuperAdmin: boolean;
}
const RbacContext = createContext<RbacContextType | null>(null);
export const useRbac = () => {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error("useRbac must be used inside KwakoPosProvider");
  return ctx;
};

export interface ModuleContextType {
  activeModule: IndustryModule;
  setActiveModule: (module: IndustryModule) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  manifest: ModuleManifest;
  availableModules: IndustryModule[];
  enabledModules: IndustryModule[];
  subscribedModules: IndustryModule[];
  canAccessModule: (module: IndustryModule) => boolean;
  canAccessTab: (tab: string) => boolean;
  isModuleEnabled: (module: IndustryModule) => boolean;
  isModuleSubscribed: (module: IndustryModule) => boolean;
  sidebarItems: SidebarItem[];
  bottomNavItems: Array<{ label: string; tab: string; icon: string }>;
  searchModules: (query: string) => IndustryModule[];
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  isDevSuperuser: boolean;
}

// Intentionally no permissive default context. Missing provider is a hard error.
const ModuleContext = createContext<ModuleContextType | null>(null);
export const useModule = (): ModuleContextType => {
  const ctx = useContext(ModuleContext);
  if (!ctx) throw new Error("useModule must be used inside KwakoPosProvider");
  return ctx;
};

interface SyncContextType {
  isOnline: boolean;
  pendingOutboxCount: number;
  syncOutbox: () => Promise<void>;
  db: LocalIndexedDbStore;
  syncEngine: ClientSyncEngine;
  syncError: string | null;
}
const SyncContext = createContext<SyncContextType | null>(null);
export const useSync = () => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside KwakoPosProvider");
  return ctx;
};

interface ThemeContextType {
  theme: "dark" | "light";
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextType | null>(null);
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside KwakoPosProvider");
  return ctx;
};

const TAB_PERMISSION_REQUIREMENTS: Record<string, string> = {
  "Users & Roles": "users.manage",
  "User Management": "users.manage",
  "Roles & Permissions": "users.manage",
  "Security": "security.manage",
  "Audit Logs": "audit.read",
  "API Keys": "integrations.manage",
  "Webhooks": "integrations.manage",
  "Billing": "billing.manage",
  "Subscriptions": "billing.manage",
  "Finance": "finance.read",
  "Expenses": "expense.manage",
  "Reports": "reports.view",
  "Stock Adjustments": "inventory.adjust",
  "Adjustments": "inventory.adjust",
  "Transfers": "inventory.transfer",
  "Branch Transfers": "inventory.transfer",
};

function tabExists(manifest: ModuleManifest, tab: string): boolean {
  const target = tab.trim().toLowerCase();
  if (!target) return false;
  if (manifest.sidebar.some((item) => {
    if (typeof item === "string") return item.trim().toLowerCase() === target;
    return item.name.trim().toLowerCase() === target || Boolean(item.subItems?.some((s) => s.trim().toLowerCase() === target));
  })) return true;
  return manifest.bottomNav.some((item) => item.tab.trim().toLowerCase() === target || item.label.trim().toLowerCase() === target);
}

export const KwakoPosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db] = useState(() => new LocalIndexedDbStore(3));
  const [syncEngine] = useState(
    () => new ClientSyncEngine(`web-${crypto.randomUUID?.() || Date.now()}`, db),
  );
  useState(() => new PwaVersionManager("2.5.0", 3, db));

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("kwakopos:v2:theme") === "light" ? "light" : "dark",
  );
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [activeModule, setActiveModuleState] = useState<IndustryModule>(() => {
    try {
      const saved = localStorage.getItem("kwakopos:v2:active-module");
      if (saved && MODULE_MANIFESTS[saved as IndustryModule]) return saved as IndustryModule;
    } catch { /* ignore */ }
    return "Retail";
  });

  const [activeTab, setActiveTabState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("kwakopos:v2:active-tab");
      if (saved) return saved;
    } catch { /* ignore */ }
    return "Dashboard";
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    db.ready
      .then(() => restoreSession())
      .then((restored) => {
        if (mounted && restored) {
          setUser({ id: restored.id, name: restored.name, email: restored.email, role: restored.role, tenantId: restored.tenantId, branchId: restored.branchId });
        }
      })
      .catch((error) => {
        if (mounted) setAuthError(error instanceof Error ? error.message : "Session restore failed");
      })
      .finally(() => { if (mounted) setIsInitializing(false); });
    return () => { mounted = false; };
  }, [db]);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    void db.ready.then(() => setPendingOutboxCount(db.getPendingOutbox().length));
  }, [db]);

  const login = async (email: string, password: string) => {
    setAuthError(null);
    const loggedIn = await apiLogin(email, password);
    setUser({ id: loggedIn.id, name: loggedIn.name, email: loggedIn.email, role: loggedIn.role, tenantId: loggedIn.tenantId, branchId: loggedIn.branchId });
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setActiveModuleState("Retail");
    setActiveTabState("Dashboard");
    try {
      localStorage.removeItem("kwakopos:v2:active-module");
      localStorage.removeItem("kwakopos:v2:active-tab");
    } catch { /* ignore */ }
    setAuthError(null);
  };

  // These claims are UX hints only. All protected operations remain server-authorized.
  const claims = useMemo(() => decodeClaims(getAccessToken()), [user]);
  const permissions = useMemo(() => claims.permissions || [], [claims]);
  const moduleEntitlements = useMemo(() => claims.moduleEntitlements || [], [claims]);
  const currentTenantId = user?.tenantId || null;
  const currentBranchId = user?.branchId || null;
  const isSuperAdmin = Boolean(user && permissions.includes("*"));

  const canAccessModule = useCallback((module: IndustryModule): boolean => {
    if (!user) return false;
    const manifest = MODULE_MANIFESTS[module];
    if (!manifest) return false;
    if (isSuperAdmin) return true;
    if (manifest.requiresSubscription && !moduleEntitlements.includes(module)) return false;
    if (manifest.requiredPermission && !permissions.includes(manifest.requiredPermission)) return false;
    return true;
  }, [user, isSuperAdmin, permissions, moduleEntitlements]);

  const isModuleEnabled = useCallback((module: IndustryModule) => canAccessModule(module), [canAccessModule]);
  const isModuleSubscribed = useCallback((module: IndustryModule): boolean => {
    if (isSuperAdmin) return true;
    const manifest = MODULE_MANIFESTS[module];
    if (!manifest) return false;
    if (!manifest.requiresSubscription) return true;
    return moduleEntitlements.includes(module);
  }, [isSuperAdmin, moduleEntitlements]);

  const availableModules = useMemo(() => ALL_MODULE_KEYS.filter(canAccessModule), [canAccessModule]);
  const enabledModules = availableModules;
  const subscribedModules = useMemo(() => ALL_MODULE_KEYS.filter(isModuleSubscribed), [isModuleSubscribed]);

  const rawManifest = MODULE_MANIFESTS[activeModule] || MODULE_MANIFESTS["Retail"];
  const manifest = useMemo((): ModuleManifest => {
    if (!canAccessModule(activeModule)) return { ...rawManifest, sidebar: [], bottomNav: [] };
    const sidebar: SidebarItem[] = rawManifest.sidebar.map((item) => {
      if (item === "Settings") return { name: "Settings", subItems: ["General Settings", "Users & Roles"] };
      if (typeof item !== "string" && item.name === "Settings") return { ...item, subItems: [...(item.subItems || []).filter((s) => s !== "Users & Roles"), "Users & Roles"] };
      return item;
    });
    return { ...rawManifest, sidebar };
  }, [activeModule, canAccessModule, rawManifest]);

  const canAccessTab = useCallback((tab: string): boolean => {
    if (!user) return false;
    if (!canAccessModule(activeModule)) return false;
    if (!tabExists(manifest, tab)) return false;
    const requiredPermission = TAB_PERMISSION_REQUIREMENTS[tab];
    return !requiredPermission || permissions.includes("*") || permissions.includes(requiredPermission);
  }, [user, canAccessModule, activeModule, manifest, permissions]);

  const setActiveModule = useCallback((module: IndustryModule) => {
    if (!canAccessModule(module)) return;
    const newTab = getDefaultTab(module);
    if (!canAccessTab(newTab) && !MODULE_MANIFESTS[module].bottomNav.some((item) => item.tab === newTab || item.label === newTab)) return;
    setActiveModuleState(module);
    setActiveTabState(newTab);
    try {
      localStorage.setItem("kwakopos:v2:active-module", module);
      localStorage.setItem("kwakopos:v2:active-tab", newTab);
    } catch { /* ignore */ }
  }, [canAccessModule, canAccessTab]);

  const setActiveTab = useCallback((tab: string) => {
    if (!canAccessTab(tab)) return;
    setActiveTabState(tab);
    try { localStorage.setItem("kwakopos:v2:active-tab", tab); } catch { /* ignore */ }
  }, [canAccessTab]);

  const searchModules = useCallback((query: string) => {
    return registrySearchModules(query).filter(canAccessModule);
  }, [canAccessModule]);

  const switchTenant = async (id: string) => {
    if (!id || id === currentTenantId) return;
    if (!availableTenantsList.some((tenant) => tenant.id === id)) return;
    if (!isOnline) return;
    try {
      const updated = await apiSwitchContext(id, currentBranchId || undefined);
      setUser((prev) => prev ? { ...prev, tenantId: updated.tenantId, branchId: updated.branchId } : null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Tenant switch failed");
    }
  };

  const switchBranch = async (id: string) => {
    if (!id || id === currentBranchId) return;
    if (!availableBranchesList.some((branch) => branch.id === id)) return;
    if (!isOnline) return;
    try {
      const updated = await apiSwitchContext(currentTenantId || undefined, id);
      setUser((prev) => prev ? { ...prev, tenantId: updated.tenantId, branchId: updated.branchId } : null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Branch switch failed");
    }
  };

  const syncOutbox = async () => {
    if (!user || !isOnline) return;
    setSyncError(null);
    await db.ready;
    await syncEngine.syncWithServer(
      async (request) => {
        const response = await fetch("/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
          credentials: "include",
          body: JSON.stringify(request),
        });
        if (!response.ok) throw new Error(`Sync push failed: HTTP ${response.status}`);
        const body = await response.json();
        return body.data || body;
      },
      async (since) => {
        const url = since ? `/sync/delta?since=${encodeURIComponent(since)}` : "/sync/delta";
        const response = await fetch(url, { headers: { ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) }, credentials: "include" });
        if (!response.ok) throw new Error(`Sync delta failed: HTTP ${response.status}`);
        const body = await response.json();
        return body.data || body;
      },
    ).then(() => setPendingOutboxCount(db.getPendingOutbox().length)).catch((error) => {
      setSyncError(error instanceof Error ? error.message : "Synchronization failed");
      throw error;
    });
  };

  const availableTenantsList = useMemo(() => {
    if (!user?.tenantId) return [];
    return [{ id: user.tenantId, name: `${user.tenantId} (Active)` }];
  }, [user]);

  const availableBranchesList = useMemo(() => {
    if (!user?.branchId) return [];
    return [{ id: user.branchId, name: `${user.branchId} (Active)` }];
  }, [user]);

  const authValue: AuthContextType = { user, isAuthenticated: Boolean(user), isInitializing, error: authError, login, logout };
  const tenantValue: TenantContextType = {
    currentTenantId,
    currentTenantName: availableTenantsList.find((t) => t.id === currentTenantId)?.name || currentTenantId,
    availableTenants: availableTenantsList,
    switchTenant,
  };
  const branchValue: BranchContextType = {
    currentBranchId,
    currentBranchName: availableBranchesList.find((b) => b.id === currentBranchId)?.name || currentBranchId,
    availableBranches: availableBranchesList,
    switchBranch,
  };
  const rbacValue: RbacContextType = {
    role: user?.role || null,
    permissions,
    hasPermission: (permission) => permissions.includes("*") || permissions.includes(permission),
    isSuperAdmin,
  };
  const moduleValue: ModuleContextType = {
    activeModule,
    setActiveModule,
    activeTab,
    setActiveTab,
    manifest,
    availableModules,
    enabledModules,
    subscribedModules,
    canAccessModule,
    canAccessTab,
    isModuleEnabled,
    isModuleSubscribed,
    sidebarItems: manifest.sidebar,
    bottomNavItems: manifest.bottomNav,
    searchModules,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    // Kept for backward compatibility only; this is not a development bypass.
    isDevSuperuser: isSuperAdmin,
  };
  const syncValue: SyncContextType = { isOnline, pendingOutboxCount, syncOutbox, db, syncEngine, syncError };
  const themeValue: ThemeContextType = {
    theme,
    toggleTheme: () => setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      if (typeof localStorage !== "undefined") localStorage.setItem("kwakopos:v2:theme", next);
      return next;
    }),
  };

  return (
    <AuthContext.Provider value={authValue}>
      <TenantContext.Provider value={tenantValue}>
        <BranchContext.Provider value={branchValue}>
          <RbacContext.Provider value={rbacValue}>
            <ModuleContext.Provider value={moduleValue}>
              <SyncContext.Provider value={syncValue}>
                <ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>
              </SyncContext.Provider>
            </ModuleContext.Provider>
          </RbacContext.Provider>
        </BranchContext.Provider>
      </TenantContext.Provider>
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const SessionProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const ModuleProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const SyncProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const TenantProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const BranchProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const RbacProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
