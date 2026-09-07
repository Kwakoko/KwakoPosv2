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
import {
  I18nProvider,
  useTranslation,
  useLocale,
  useFormatters,
} from "../i18n/I18nContext.js";

export type { IndustryModule, ModuleManifest, SidebarItem };
export { I18nProvider, useTranslation, useLocale, useFormatters };

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

export interface ImpersonatedTenant {
  tenantId: string;
  tenantName: string;
  branchId: string;
  branchName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  error: string | null;
  login: (email: string, password: string, mfaCode?: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  dismissLoading: () => void;
  impersonatedTenant: ImpersonatedTenant | null;
  startImpersonation: (tenantId: string, tenantName?: string, branchId?: string, branchName?: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
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
  isImpersonating: boolean;
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
  const [db] = useState(() => new LocalIndexedDbStore(4));
  const [syncEngine] = useState(
    () => new ClientSyncEngine(`web-${crypto.randomUUID?.() || Date.now()}`, db),
  );
  const [pwaVersionManager] = useState(() => new PwaVersionManager("2.12.5", 4, db));

  // Safe Shutdown and Storage Persistence Flush Handlers
  useEffect(() => {
    const handleFlush = () => {
      db.flushPersistence().catch(() => {});
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleFlush);
      window.addEventListener("pagehide", handleFlush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") handleFlush();
      });
      return () => {
        window.removeEventListener("beforeunload", handleFlush);
        window.removeEventListener("pagehide", handleFlush);
      };
    }
  }, [db]);

  // Safe PWA Service Worker Registration
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && window.location?.protocol.startsWith("http")) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[PWA] Service worker registration deferred:", err);
      });
    }
  }, []);

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

  const [impersonatedTenant, setImpersonatedTenant] = useState<ImpersonatedTenant | null>(() => {
    try {
      const saved = sessionStorage.getItem("kwakopos:v2:impersonation");
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return null;
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const dismissLoading = useCallback(() => {
    setIsInitializing(false);
  }, []);

  useEffect(() => {
    let active = true;

    // Hard ceiling: the UI should NEVER stay in initializing state for more than 2500ms
    const safetyTimer = setTimeout(() => {
      if (active) {
        setIsInitializing(false);
      }
    }, 2500);

    const initSequence = async () => {
      try {
        // Step 1: Wait for local database with a 1500ms race ceiling
        await Promise.race([
          db.ready.catch((err) => {
            console.warn("IndexedDB ready signal warned:", err);
          }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);

        // Step 2: Attempt session restoration with a 1500ms race ceiling
        const restored = await Promise.race([
          restoreSession().catch((err) => {
            console.warn("Session restore attempt warned:", err);
            return null;
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);

        if (active && restored) {
          setUser({
            id: restored.id,
            name: restored.name,
            email: restored.email,
            role: restored.role,
            tenantId: restored.tenantId,
            branchId: restored.branchId,
          });
        }
      } catch (error) {
        if (active) {
          setAuthError(error instanceof Error ? error.message : "Session restore failed");
        }
      } finally {
        clearTimeout(safetyTimer);
        if (active) {
          setIsInitializing(false);
        }
      }
    };

    void initSequence();

    return () => {
      active = false;
      clearTimeout(safetyTimer);
    };
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

  const login = async (email: string, password: string, mfaCode?: string): Promise<AuthUser> => {
    setAuthError(null);
    const loggedIn = await apiLogin(email, password, mfaCode);
    const authUser: AuthUser = {
      id: loggedIn.id,
      name: loggedIn.name,
      email: loggedIn.email,
      role: loggedIn.role,
      tenantId: loggedIn.tenantId,
      branchId: loggedIn.branchId,
    };
    setUser(authUser);
    return authUser;
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.warn("apiLogout error:", err);
    } finally {
      setUser(null);
      setImpersonatedTenant(null);
      try {
        sessionStorage.removeItem("kwakopos:v2:impersonation");
        localStorage.removeItem("kwakopos:v2:active-module");
        localStorage.removeItem("kwakopos:v2:active-tab");
      } catch { /* ignore */ }
      setActiveModuleState("Retail");
      setActiveTabState("Dashboard");
      setAuthError(null);
    }
  };

  // These claims are UX hints only. All protected operations remain server-authorized.
  const claims = useMemo(() => decodeClaims(getAccessToken()), [user]);
  const permissions = useMemo(() => claims.permissions || [], [claims]);
  const moduleEntitlements = useMemo(() => claims.moduleEntitlements || [], [claims]);
  const isSuperAdmin = Boolean(
    user && (user.role === "SUPER_ADMIN" || permissions.includes("*") || permissions.includes("SUPER_ADMIN_OPERATIONS"))
  );
  const currentTenantId = impersonatedTenant?.tenantId || (isSuperAdmin ? null : user?.tenantId || null);
  const currentBranchId = impersonatedTenant?.branchId || (isSuperAdmin ? null : user?.branchId || null);

  const canAccessModule = useCallback((module: IndustryModule): boolean => {
    if (!user) return false;
    const manifest = MODULE_MANIFESTS[module];
    if (!manifest) return false;
    // Super Admin in platform mode should NOT see tenant store modules unless actively impersonating
    if (isSuperAdmin && !impersonatedTenant) return false;
    if (isSuperAdmin && impersonatedTenant) return true;
    if (manifest.requiresSubscription && !moduleEntitlements.includes(module)) return false;
    if (manifest.requiredPermission && !permissions.includes(manifest.requiredPermission)) return false;
    return true;
  }, [user, isSuperAdmin, impersonatedTenant, permissions, moduleEntitlements]);

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
    if (isSuperAdmin && !impersonatedTenant) {
      const superAdminTabs = [
        "Super Admin",
        "Support Control Tower",
        "Compliance Tower",
        "Diagnostics",
        "Tenant Onboarding",
        "Legal",
        "Privacy",
        "Help",
      ];
      return superAdminTabs.includes(tab);
    }
    if (!isSuperAdmin) {
      const forbiddenForTenants = [
        "Super Admin",
        "Support Control Tower",
        "Compliance Tower",
      ];
      if (forbiddenForTenants.includes(tab)) return false;
    }
    if (!canAccessModule(activeModule)) return false;
    if (!tabExists(manifest, tab)) return false;
    const requiredPermission = TAB_PERMISSION_REQUIREMENTS[tab];
    return !requiredPermission || permissions.includes("*") || permissions.includes(requiredPermission);
  }, [user, isSuperAdmin, impersonatedTenant, canAccessModule, activeModule, manifest, permissions]);

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

  // Keep Super Admin defaulted to Super Admin tab when not impersonating
  useEffect(() => {
    if (isSuperAdmin && !impersonatedTenant && (activeTab === "Dashboard" || activeTab === "POS")) {
      setActiveTabState("Super Admin");
    }
  }, [isSuperAdmin, impersonatedTenant, activeTab]);

  const startImpersonation = useCallback(async (tenantId: string, tenantName?: string, branchId?: string, branchName?: string) => {
    if (!isSuperAdmin) {
      throw new Error("Only Super Admin can activate tenant inspection mode.");
    }
    const result = await apiSwitchContext(tenantId, branchId);
    const resolved: ImpersonatedTenant = {
      tenantId: result.tenantId,
      tenantName: result.tenantName || tenantName || result.tenantId,
      branchId: result.branchId,
      branchName: result.branchName || branchName || result.branchId,
    };
    setImpersonatedTenant(resolved);
    try {
      sessionStorage.setItem("kwakopos:v2:impersonation", JSON.stringify(resolved));
    } catch { /* ignore */ }
    setUser((prev) => prev ? { ...prev, tenantId: result.tenantId, branchId: result.branchId } : null);
    setActiveModuleState("Retail");
    setActiveTabState("Dashboard");
  }, [isSuperAdmin]);

  const stopImpersonation = useCallback(async () => {
    setImpersonatedTenant(null);
    try {
      sessionStorage.removeItem("kwakopos:v2:impersonation");
    } catch { /* ignore */ }
    try {
      const result = await apiSwitchContext("PLATFORM_SUPER_ADMIN");
      setUser((prev) => prev ? { ...prev, tenantId: result.tenantId, branchId: result.branchId } : null);
    } catch {
      /* ignore */
    }
    setActiveTabState("Super Admin");
  }, []);

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

  const currentTenantName = impersonatedTenant?.tenantName || (isSuperAdmin ? "Platform Super Admin" : availableTenantsList.find((t) => t.id === currentTenantId)?.name || currentTenantId);
  const currentBranchName = impersonatedTenant?.branchName || (isSuperAdmin ? "Global Control Plane" : availableBranchesList.find((b) => b.id === currentBranchId)?.name || currentBranchId);

  const authValue: AuthContextType = {
    user,
    isAuthenticated: Boolean(user),
    isInitializing,
    error: authError,
    login,
    logout,
    dismissLoading,
    impersonatedTenant,
    startImpersonation,
    stopImpersonation,
  };
  const tenantValue: TenantContextType = {
    currentTenantId,
    currentTenantName,
    availableTenants: availableTenantsList,
    switchTenant,
    isImpersonating: Boolean(impersonatedTenant),
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
                <ThemeContext.Provider value={themeValue}>
                  <I18nProvider userLocale={(user as any)?.locale} tenantLocale={null}>
                    {children}
                  </I18nProvider>
                </ThemeContext.Provider>
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
