import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { LocalIndexedDbStore, db as defaultDb } from "../indexedDb.js";
import { ClientSyncEngine, clientSyncEngine } from "../clientSyncEngine.js";
import { PwaVersionManager } from "../versionManager.js";
import {
  apiFetch,
  getAccessToken,
  getStoredSession,
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  switchContext as apiSwitchContext,
  safeUUID,
} from "../services/apiClient.js";
import { DATA_CHANGED_EVENT } from "../services/dataChangeEvent.js";
import { reconcileLocalInventoryToOutbox } from "../services/inventoryReconciliationService.js";
import type { PersistenceStatusSnapshot } from "../persistence/persistenceStatus.js";
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
const DEFAULT_AUTH_CONTEXT: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isInitializing: false,
  error: null,
  login: async () => { throw new Error("Authentication provider not mounted"); },
  logout: async () => {},
  dismissLoading: () => {},
  impersonatedTenant: null,
  startImpersonation: async () => {},
  stopImpersonation: async () => {},
};

const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  return ctx || DEFAULT_AUTH_CONTEXT;
};

interface TenantContextType {
  currentTenantId: string | null;
  currentTenantName: string | null;
  availableTenants: { id: string; name: string }[];
  switchTenant: (id: string) => Promise<void>;
  isImpersonating: boolean;
}

const DEFAULT_TENANT_CONTEXT: TenantContextType = {
  currentTenantId: null,
  currentTenantName: null,
  availableTenants: [],
  switchTenant: async () => {},
  isImpersonating: false,
};

const TenantContext = createContext<TenantContextType | null>(null);
export const useTenant = (): TenantContextType => {
  const ctx = useContext(TenantContext);
  return ctx || DEFAULT_TENANT_CONTEXT;
};

interface BranchContextType {
  currentBranchId: string | null;
  currentBranchName: string | null;
  availableBranches: { id: string; name: string }[];
  switchBranch: (id: string) => Promise<void>;
}

const DEFAULT_BRANCH_CONTEXT: BranchContextType = {
  currentBranchId: null,
  currentBranchName: null,
  availableBranches: [],
  switchBranch: async () => {},
};

const BranchContext = createContext<BranchContextType | null>(null);
export const useBranch = (): BranchContextType => {
  const ctx = useContext(BranchContext);
  return ctx || DEFAULT_BRANCH_CONTEXT;
};

interface RbacContextType {
  role: string | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isSuperAdmin: boolean;
}

const DEFAULT_RBAC_CONTEXT: RbacContextType = {
  role: null,
  permissions: [],
  hasPermission: () => false,
  isSuperAdmin: false,
};

const RbacContext = createContext<RbacContextType | null>(null);
export const useRbac = (): RbacContextType => {
  const ctx = useContext(RbacContext);
  return ctx || DEFAULT_RBAC_CONTEXT;
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

const DEFAULT_MODULE_CONTEXT: ModuleContextType = {
  activeModule: "Retail",
  setActiveModule: () => {},
  activeTab: "Dashboard",
  setActiveTab: () => {},
  manifest: MODULE_MANIFESTS.Retail,
  availableModules: ALL_MODULE_KEYS.slice(),
  enabledModules: ALL_MODULE_KEYS.slice(),
  subscribedModules: ALL_MODULE_KEYS.slice(),
  canAccessModule: () => true,
  canAccessTab: () => true,
  isModuleEnabled: () => true,
  isModuleSubscribed: () => true,
  sidebarItems: MODULE_MANIFESTS.Retail.sidebar,
  bottomNavItems: MODULE_MANIFESTS.Retail.bottomNav,
  searchModules: () => [],
  isMobileSidebarOpen: false,
  setIsMobileSidebarOpen: () => {},
  isDevSuperuser: false,
};

const ModuleContext = createContext<ModuleContextType | null>(null);
export const useModule = (): ModuleContextType => {
  const ctx = useContext(ModuleContext);
  return ctx || DEFAULT_MODULE_CONTEXT;
};

interface SyncContextType {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  toggleOfflineSimulation: () => void;
  isSyncing: boolean;
  pendingOutboxCount: number;
  syncOutbox: (options?: { quiet?: boolean; force?: boolean }) => Promise<any>;
  db: LocalIndexedDbStore;
  syncEngine: ClientSyncEngine;
  syncError: string | null;
  lastSyncedAt: number | null;
  persistenceStatus: PersistenceStatusSnapshot;
}

const DEFAULT_SYNC_CONTEXT: SyncContextType = {
  isOnline: true,
  isSimulatedOffline: false,
  toggleOfflineSimulation: () => {},
  isSyncing: false,
  pendingOutboxCount: 0,
  syncOutbox: async () => {},
  db: null as any,
  syncEngine: null as any,
  syncError: null,
  lastSyncedAt: null,
  persistenceStatus: {
    tenantId: null,
    branchId: null,
    counts: {
      LOCAL_COMMITTED: 0,
      SYNC_PENDING: 0,
      SERVER_CONFIRMED: 0,
      FAILED: 0,
      CONFLICT: 0,
      TOMBSTONED: 0,
    },
    total: 0,
    latest: null,
    records: [],
  },
};

const SyncContext = createContext<SyncContextType | null>(null);
export const useSync = (): SyncContextType => {
  const ctx = useContext(SyncContext);
  return ctx || DEFAULT_SYNC_CONTEXT;
};

interface ThemeContextType {
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const DEFAULT_THEME_CONTEXT: ThemeContextType = {
  theme: "dark",
  toggleTheme: () => {},
};

const ThemeContext = createContext<ThemeContextType | null>(null);
export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  return ctx || DEFAULT_THEME_CONTEXT;
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

export const KwakoPosProvider: React.FC<{ children: React.ReactNode; dbInstance?: LocalIndexedDbStore }> = ({ children, dbInstance }) => {
  const [db] = useState(() => dbInstance || defaultDb);
  const [syncEngine] = useState(
    () => new ClientSyncEngine(`web-${safeUUID()}`, db),
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

  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = getStoredSession();
    if (!stored?.user) return null;
    return {
      id: stored.user.id,
      name: stored.user.name,
      email: stored.user.email,
      role: stored.user.role,
      tenantId: stored.user.tenantId,
      branchId: stored.user.branchId,
    };
  });
  const [isInitializing, setIsInitializing] = useState(() => !getStoredSession()?.user);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("kwakopos:v2:theme") === "light" ? "light" : "dark",
  );
  const [rawOnline, setRawOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const isOnline = isSimulatedOffline ? false : rawOnline;
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatusSnapshot>(() =>
    db.getPersistenceStatusSnapshot(),
  );

  const toggleOfflineSimulation = useCallback(() => {
    setIsSimulatedOffline((prev) => !prev);
  }, []);

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
    const update = () => setRawOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    const refreshCount = () => {
      void db.ready.then(() => {
        try {
          const tenantId = user?.tenantId || currentTenantId || "tenant-default";
          const branchId = user?.branchId || currentBranchId || "branch-default";
          setPendingOutboxCount(db.getPendingOutbox(tenantId, branchId).length);
        } catch { /* ignore */ }
      });
    };
    refreshCount();
    window.addEventListener("kwakopos:outbox-enqueued", refreshCount);
    window.addEventListener(DATA_CHANGED_EVENT, refreshCount);
    const interval = setInterval(refreshCount, 20000);
    return () => {
      window.removeEventListener("kwakopos:outbox-enqueued", refreshCount);
      window.removeEventListener(DATA_CHANGED_EVENT, refreshCount);
      clearInterval(interval);
    };
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
    try {
      await db.ready;
      await db.refreshStoresFromNative();
      setPendingOutboxCount(db.getPendingOutbox(authUser.tenantId, authUser.branchId).length);
    } catch (err) {
      console.warn("[Session] Post-login store alignment warned:", err);
    }
    return authUser;
  };

  const logout = async () => {
    try {
      // 1. Guarantee all microtask persistence writes are committed to IndexedDB before session teardown
      await db.flushPersistence().catch((err) => console.warn("Flush persistence on logout:", err));
      // 2. Clear remote session
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
    user && (user.role === "SUPER_ADMIN" || user.role === "SUPERADMIN" || permissions.includes("SUPER_ADMIN_OPERATIONS") || permissions.includes("ADMIN:PLATFORM"))
  );
  const currentTenantId = impersonatedTenant?.tenantId || (isSuperAdmin ? null : user?.tenantId || null);
  const currentBranchId = impersonatedTenant?.branchId || (isSuperAdmin ? null : user?.branchId || null);

  const refreshPersistenceStatus = useCallback(() => {
    const tenantId = currentTenantId || user?.tenantId || undefined;
    const branchId = currentBranchId || user?.branchId || undefined;
    void db.ready
      .then(() => setPersistenceStatus(db.getPersistenceStatusSnapshot(tenantId, branchId)))
      .catch(() => {});
  }, [db, currentTenantId, currentBranchId, user?.tenantId, user?.branchId]);

  useEffect(() => {
    refreshPersistenceStatus();
    window.addEventListener("kwakopos:persistence-status-changed", refreshPersistenceStatus);
    window.addEventListener("kwakopos:outbox-enqueued", refreshPersistenceStatus);
    window.addEventListener(DATA_CHANGED_EVENT, refreshPersistenceStatus);
    const interval = setInterval(refreshPersistenceStatus, 3000);
    return () => {
      window.removeEventListener("kwakopos:persistence-status-changed", refreshPersistenceStatus);
      window.removeEventListener("kwakopos:outbox-enqueued", refreshPersistenceStatus);
      window.removeEventListener(DATA_CHANGED_EVENT, refreshPersistenceStatus);
      clearInterval(interval);
    };
  }, [refreshPersistenceStatus]);

  const canAccessModule = useCallback((module: IndustryModule): boolean => {
    if (!user) return false;
    const manifest = MODULE_MANIFESTS[module];
    if (!manifest) return false;
    // Super Admin in platform mode should NOT see tenant store modules unless actively impersonating
    if (isSuperAdmin && !impersonatedTenant) return false;
    if (isSuperAdmin && impersonatedTenant) return true;
    if (manifest.requiresSubscription && moduleEntitlements.length > 0 && !moduleEntitlements.includes(module)) return false;
    if (manifest.requiredPermission && !permissions.includes("*") && !permissions.includes(manifest.requiredPermission)) return false;
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

  const isSyncInProgressRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const consecutiveFailuresRef = useRef<number>(0);
  const hasBootReconciledRef = useRef(false);
  const outboxDebounceTimerRef = useRef<any>(null);
  // Ensure clientSyncEngine is initialized with DB + API references
  useEffect(() => {
    const targetTenantId = user?.tenantId || currentTenantId || "tenant-default";
    const targetBranchId = user?.branchId || currentBranchId || "branch-default";
    const targetUserId = user?.id || "user-default";

    clientSyncEngine.init({
      localDb: db,
      pushApiFn: async (request) => {
        const body = await apiFetch<any>("/sync/push", {
          method: "POST",
          headers: {
            "x-tenant-id": targetTenantId,
            "x-branch-id": targetBranchId,
            "x-user-id": targetUserId,
          },
          body: JSON.stringify(request),
        });
        return body.data || body;
      },
      deltaApiFn: async (since) => {
        const url = since ? `/sync/delta?since=${encodeURIComponent(since)}` : "/sync/delta";
        const body = await apiFetch<any>(url, {
          headers: {
            "x-tenant-id": targetTenantId,
            "x-branch-id": targetBranchId,
            "x-user-id": targetUserId,
          },
        });
        return body.data || body;
      },
      tenantId: targetTenantId,
      branchId: targetBranchId,
    });
  }, [db, user, currentTenantId, currentBranchId]);

  const syncOutbox = useCallback(async (options?: { quiet?: boolean; force?: boolean }) => {
    if (!isOnline) return;
    if (isSyncInProgressRef.current) return;
    isSyncInProgressRef.current = true;

    const targetTenantId = user?.tenantId || currentTenantId || "tenant-default";
    const targetBranchId = user?.branchId || currentBranchId || "branch-default";
    const targetUserId = user?.id || "user-default";

    // Re-queue any previously failed outbox items so they are retried
    try {
      db.retryFailedOutbox(targetTenantId, targetBranchId);
    } catch { /* ignore */ }

    // Only set visual isSyncing if not quiet, or if pending items actually exist, or if forced
    const pendingCount = db.getPendingOutbox(targetTenantId, targetBranchId).length;
    const shouldShowVisualSync = !options?.quiet || pendingCount > 0 || options?.force;

    if (shouldShowVisualSync) {
      setIsSyncing(true);
    }
    setSyncError(null);

    try {
      await db.ready;

      // Reconcile local inventory only once on boot or when explicitly forced, never on every background tick
      if (!hasBootReconciledRef.current || options?.force) {
        hasBootReconciledRef.current = true;
        try {
          await reconcileLocalInventoryToOutbox(db, targetTenantId, targetBranchId);
        } catch (reconErr) {
          console.warn("[Sync] Local inventory reconciliation error:", reconErr);
        }
      }

      const result = await syncEngine.syncWithServer(
        async (request) => {
          const body = await apiFetch<any>("/sync/push", {
            method: "POST",
            headers: {
              "x-tenant-id": targetTenantId,
              "x-branch-id": targetBranchId,
              "x-user-id": targetUserId,
            },
            body: JSON.stringify(request),
          });
          return body.data || body;
        },
        async (since) => {
          const url = since ? `/sync/delta?since=${encodeURIComponent(since)}` : "/sync/delta";
          const body = await apiFetch<any>(url, {
            headers: {
              "x-tenant-id": targetTenantId,
              "x-branch-id": targetBranchId,
              "x-user-id": targetUserId,
            },
          });
          return body.data || body;
        },
        targetTenantId,
        targetBranchId,
      );

      const now = Date.now();
      lastSyncTimeRef.current = now;
      consecutiveFailuresRef.current = 0;
      setLastSyncedAt(now);
      setPendingOutboxCount(db.getPendingOutbox(targetTenantId, targetBranchId).length);

      if (result && (result.pulled > 0 || result.pushed > 0)) {
        window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "SYNC_CONVERGED", ...result } }));
        window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "INVENTORY_CHANGED" } }));
        try {
          if (typeof window !== "undefined" && "BroadcastChannel" in window) {
            const bc = new BroadcastChannel("kwakopos_sync_channel");
            bc.postMessage({ type: "SYNC_CONVERGED", ...result, timestamp: Date.now() });
            bc.close();
          }
        } catch {
          /* ignore broadcast errors in isolated test workers */
        }
      }
      return result;
    } catch (error) {
      consecutiveFailuresRef.current += 1;
      setSyncError(error instanceof Error ? error.message : "Synchronization failed");
      throw error;
    } finally {
      isSyncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [user, currentTenantId, currentBranchId, isOnline, db, syncEngine]);

  // ─── Automated Convergence Lifecycles ──────────────────────────────────────────

  // Imperative convergence hook used by UI automation and diagnostics. It executes
  // the same configured syncOutbox path used by the application, including durable
  // IndexedDB, real /sync/push, PostgreSQL journal, and /sync/delta application.
  useEffect(() => {
    const handleSyncNow = (event: Event) => {
      const detail = (event as CustomEvent<{ onComplete?: (result: { pushed: number; pulled: number }) => void; onError?: (error: unknown) => void }>).detail;
      const runWhenIdle = async () => {
        // A boot/heartbeat sync may already be active. Wait for the mounted
        // production sync lifecycle to become idle instead of silently dropping
        // the requested convergence run.
        const deadline = Date.now() + 15000;
        while (isSyncInProgressRef.current && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (isSyncInProgressRef.current) {
          throw new Error("SYNC_IN_PROGRESS_TIMEOUT");
        }
        return syncOutbox({ quiet: true, force: true });
      };
      void runWhenIdle().then(
        (result) => {
          if (result) detail?.onComplete?.(result);
        },
        (error) => detail?.onError?.(error),
      );
    };
    window.addEventListener("kwakopos:context-sync-now", handleSyncNow);
    return () => window.removeEventListener("kwakopos:context-sync-now", handleSyncNow);
  }, [syncOutbox]);

  // 1. Cross-tab peer convergence via BroadcastChannel
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const bc = new BroadcastChannel("kwakopos_sync_channel");
    bc.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "OUTBOX_MUTATION") {
        void db.refreshStoresFromNative([
          "syncOutbox", "sales", "products", "productVariants", "stockLedger",
          "stockAdjustments", "customers", "suppliers", "receipts", "configuration",
        ]).then(() => {
          setPendingOutboxCount(db.getPendingOutbox((user?.tenantId || currentTenantId) || undefined, (user?.branchId || currentBranchId) || undefined).length);
          if (isOnline && !isSyncInProgressRef.current) {
            void syncOutbox({ quiet: true }).catch(() => {});
          }
        }).catch(() => {});
      } else if (data.type === "SYNC_CONVERGED") {
        void db.refreshStoresFromNative().then(() => {
          setPendingOutboxCount(db.getPendingOutbox((user?.tenantId || currentTenantId) || undefined, (user?.branchId || currentBranchId) || undefined).length);
          window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "SYNC_CONVERGED", ...data } }));
          window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "INVENTORY_CHANGED" } }));
        }).catch(() => {
          window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { action: "SYNC_CONVERGED", ...data } }));
        });
      }
    };
    return () => {
      bc.close();
    };
  }, [isOnline, syncOutbox, db, user, currentTenantId, currentBranchId]);

  // 2. Debounced trigger on local outbox enqueue (250ms debounce batches rapid user actions)
  useEffect(() => {
    const handleOutboxQueued = () => {
      if (!isOnline) return;
      const targetTenantId = (user?.tenantId || currentTenantId) || undefined;
      const targetBranchId = (user?.branchId || currentBranchId) || undefined;
      setPendingOutboxCount(db.getPendingOutbox(targetTenantId, targetBranchId).length);
      if (outboxDebounceTimerRef.current) {
        clearTimeout(outboxDebounceTimerRef.current);
      }
      outboxDebounceTimerRef.current = setTimeout(() => {
        if (!isSyncInProgressRef.current) {
          void syncOutbox({ quiet: false }).catch(() => {});
        }
      }, 250);
    };
    window.addEventListener("kwakopos:outbox-enqueued", handleOutboxQueued);
    return () => {
      window.removeEventListener("kwakopos:outbox-enqueued", handleOutboxQueued);
      if (outboxDebounceTimerRef.current) {
        clearTimeout(outboxDebounceTimerRef.current);
      }
    };
  }, [isOnline, db, syncOutbox, user, currentTenantId, currentBranchId]);

  // 3. Multi-device background convergence heartbeat (30s active, 5m hidden, exponential backoff)
  useEffect(() => {
    if (!isOnline) return;

    // Initial boot sync after 600ms
    const initTimer = setTimeout(() => {
      void syncOutbox({ quiet: true }).catch(() => {});
    }, 600);

    let timerId: any = null;

    const scheduleNextHeartbeat = () => {
      if (timerId) clearTimeout(timerId);

      // Tab visibility: 5m if hidden, 30s if active foreground
      const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const baseInterval = isHidden ? 300000 : 30000;

      // Exponential backoff if consecutive errors occurred
      const backoffDelay = consecutiveFailuresRef.current > 0
        ? Math.min(60000, 5000 * Math.pow(2, consecutiveFailuresRef.current - 1))
        : 0;

      const nextInterval = Math.max(baseInterval, backoffDelay);

      timerId = setTimeout(() => {
        if (!isSyncInProgressRef.current) {
          void syncOutbox({ quiet: true })
            .catch(() => {})
            .finally(() => {
              scheduleNextHeartbeat();
            });
        } else {
          scheduleNextHeartbeat();
        }
      }, nextInterval);
    };

    scheduleNextHeartbeat();

    // Visibility change handler: immediately probe if returning after >= 15s away
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const elapsed = Date.now() - lastSyncTimeRef.current;
        if (elapsed >= 15000 && !isSyncInProgressRef.current) {
          void syncOutbox({ quiet: true }).catch(() => {});
        }
        scheduleNextHeartbeat();
      } else {
        scheduleNextHeartbeat();
      }
    };

    // Focus & Online reconnection triggers
    const handleReconnection = () => {
      if (!isSyncInProgressRef.current) {
        void syncOutbox({ quiet: true }).catch(() => {});
      }
      scheduleNextHeartbeat();
    };

    window.addEventListener("focus", handleReconnection);
    window.addEventListener("online", handleReconnection);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearTimeout(initTimer);
      if (timerId) clearTimeout(timerId);
      window.removeEventListener("focus", handleReconnection);
      window.removeEventListener("online", handleReconnection);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [isOnline, syncOutbox]);

  const availableTenantsList = useMemo(() => {
    if (impersonatedTenant) return [{ id: impersonatedTenant.tenantId, name: `${impersonatedTenant.tenantName} (Audit)` }];
    if (!user?.tenantId) return [];
    const friendlyName = (user as any).tenantName || "Bravados";
    return [{ id: user.tenantId, name: friendlyName }];
  }, [user, impersonatedTenant]);

  const availableBranchesList = useMemo(() => {
    if (impersonatedTenant) return [{ id: impersonatedTenant.branchId, name: `${impersonatedTenant.branchName} (Audit)` }];
    if (!user?.branchId) return [];
    const friendlyBranch = (user as any).branchName || "Main HQ";
    return [{ id: user.branchId, name: friendlyBranch }];
  }, [user, impersonatedTenant]);

  const currentTenantName = impersonatedTenant?.tenantName || (isSuperAdmin ? "Platform Super Admin" : availableTenantsList.find((t) => t.id === currentTenantId)?.name || "Bravados");
  const currentBranchName = impersonatedTenant?.branchName || (isSuperAdmin ? "Global Control Plane" : availableBranchesList.find((b) => b.id === currentBranchId)?.name || "Main HQ");

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
    currentBranchName,
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
  const syncValue: SyncContextType = {
    isOnline,
    isSimulatedOffline,
    toggleOfflineSimulation,
    isSyncing,
    pendingOutboxCount,
    syncOutbox,
    db,
    syncEngine,
    syncError,
    lastSyncedAt,
    persistenceStatus,
  };
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


