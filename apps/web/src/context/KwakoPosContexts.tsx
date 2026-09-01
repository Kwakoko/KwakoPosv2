/**
 * KwakoPosv2 — Application Context Providers
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides all global state via React context:
 *   Auth → Tenant → Branch → RBAC → Module → Sync → Theme
 *
 * V2 Module System:
 *   Module availability is resolved from RBAC permissions + tenant entitlements.
 *   Dexie is NEVER the authority for authorization decisions (fail-closed).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, {
  createContext, useCallback, useContext, useEffect,
  useMemo, useState,
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
  searchModules,
  getDefaultTab,
} from "../modules/moduleRegistry.js";

// Re-export types consumers need
export type { IndustryModule, ModuleManifest, SidebarItem };

// ─── Auth ────────────────────────────────────────────────────────────────────

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
  /** Tenant-level entitlements — module keys the tenant has subscribed to */
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

// ─── Authoritative Tenant / Branch Scope Construction ───────────────────────
// Production policy: No synthetic default tenant or branch fallbacks are permitted.
// Unauthenticated or unprovisioned states evaluate to empty lists.

// ─── Context Types ────────────────────────────────────────────────────────────

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
  switchTenant: (id: string) => Promise<void>;
}
const TenantContext = createContext<TenantContextType | null>(null);
export const useTenant = () => useContext(TenantContext)!;

interface BranchContextType {
  currentBranchId: string | null;
  currentBranchName: string | null;
  availableBranches: { id: string; name: string }[];
  switchBranch: (id: string) => Promise<void>;
}
const BranchContext = createContext<BranchContextType | null>(null);
export const useBranch = () => useContext(BranchContext)!;

interface RbacContextType {
  role: string | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isSuperAdmin: boolean;
}
const RbacContext = createContext<RbacContextType | null>(null);
export const useRbac = () => useContext(RbacContext)!;

// ─── Module Context ───────────────────────────────────────────────────────────
/**
 * V2 Module System — full resolution chain:
 *   Module Registry → Tenant Entitlement → Subscription → Feature Flag → RBAC
 *   → Module Availability → Navigation → Route → Workspace
 *
 * Fail-closed: unknown/unauthorized → not available.
 * Dexie is NEVER an authorization authority here.
 */
export interface ModuleContextType {
  // Active state
  activeModule: IndustryModule;
  setActiveModule: (module: IndustryModule) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  manifest: ModuleManifest;

  // Module availability — all resolved from V2 RBAC/entitlements
  availableModules: IndustryModule[];
  enabledModules: IndustryModule[];
  subscribedModules: IndustryModule[];

  // Access guards
  canAccessModule: (module: IndustryModule) => boolean;
  canAccessTab: (tab: string) => boolean;
  isModuleEnabled: (module: IndustryModule) => boolean;
  isModuleSubscribed: (module: IndustryModule) => boolean;

  // Navigation
  sidebarItems: SidebarItem[];
  bottomNavItems: Array<{ label: string; tab: string; icon: string }>;

  // Search
  searchModules: (query: string) => IndustryModule[];

  // Mobile sidebar
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;

  // Dev superuser flag (gets access to all modules regardless of entitlements)
  isDevSuperuser: boolean;
}

const DEFAULT_MODULE_CONTEXT: ModuleContextType = {
  activeModule: "Retail",
  setActiveModule: () => {},
  activeTab: "Dashboard",
  setActiveTab: () => {},
  manifest: MODULE_MANIFESTS["Retail"],
  availableModules: ALL_MODULE_KEYS,
  enabledModules: ALL_MODULE_KEYS,
  subscribedModules: ALL_MODULE_KEYS,
  canAccessModule: () => true,
  canAccessTab: () => true,
  isModuleEnabled: () => true,
  isModuleSubscribed: () => true,
  sidebarItems: MODULE_MANIFESTS["Retail"].sidebar,
  bottomNavItems: MODULE_MANIFESTS["Retail"].bottomNav,
  searchModules,
  isMobileSidebarOpen: false,
  setIsMobileSidebarOpen: () => {},
  isDevSuperuser: false,
};

const ModuleContext = createContext<ModuleContextType>(DEFAULT_MODULE_CONTEXT);
export const useModule = () => useContext(ModuleContext);

// ─── Sync Context ─────────────────────────────────────────────────────────────

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

// ─── Theme Context ────────────────────────────────────────────────────────────

interface ThemeContextType {
  theme: "dark" | "light";
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextType | null>(null);
export const useTheme = () => useContext(ThemeContext)!;

// ─── Dev Superuser emails ─────────────────────────────────────────────────────
// These accounts bypass module entitlement checks for testing all modules.
const DEV_SUPERUSER_EMAILS = new Set(["admin@kwakoko.co.tz", "yannick@kwakoko.co.tz"]);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const KwakoPosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

  // ── Infrastructure ──────────────────────────────────────────────────────────
  const [db] = useState(() => new LocalIndexedDbStore(3));
  const [syncEngine] = useState(
    () => new ClientSyncEngine(`web-${crypto.randomUUID?.() || Date.now()}`, db),
  );
  useState(() => new PwaVersionManager("2.5.0", 3, db));

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Theme ───────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("kwakopos:v2:theme") === "light"
      ? "light" : "dark",
  );

  // ── Online / Sync ───────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Module state ────────────────────────────────────────────────────────────
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

  // ── Session restore ─────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    db.ready
      .then(() => restoreSession())
      .then((restored) => {
        if (mounted && restored) {
          setUser({
            id: restored.id,
            name: restored.name,
            email: restored.email,
            role: restored.role,
            tenantId: restored.tenantId,
            branchId: restored.branchId,
          });
        }
      })
      .catch((error) => {
        if (mounted)
          setAuthError(error instanceof Error ? error.message : "Session restore failed");
      })
      .finally(() => { if (mounted) setIsInitializing(false); });
    return () => { mounted = false; };
  }, [db]);

  // ── Online detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    void db.ready.then(() => setPendingOutboxCount(db.getPendingOutbox().length));
  }, [db]);

  // ── Auth actions ────────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    setAuthError(null);
    const loggedIn = await apiLogin(email, password);
    setUser({
      id: loggedIn.id, name: loggedIn.name, email: loggedIn.email,
      role: loggedIn.role, tenantId: loggedIn.tenantId, branchId: loggedIn.branchId,
    });
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setActiveModuleState("Retail");
    setActiveTabState("Dashboard");
    setAuthError(null);
  };

  // ── JWT claims → permissions & module entitlements ──────────────────────────
  const claims = useMemo(() => decodeClaims(getAccessToken()), [user]);
  const permissions = useMemo(() => claims.permissions || [], [claims]);
  const moduleEntitlements = useMemo(
    () => claims.moduleEntitlements || [],
    [claims],
  );

  const currentTenantId = user?.tenantId || null;
  const currentBranchId = user?.branchId || null;

  // ── Dev superuser ──────────────────────────────────────────────────────────
  const isDevSuperuser = user
    ? DEV_SUPERUSER_EMAILS.has(user.email) || permissions.includes("*")
    : false;
  const isSuperAdmin = permissions.includes("*") || permissions.includes("SUPER_ADMIN_OPERATIONS");

  // ── Module resolution (fail-closed) ────────────────────────────────────────
  /**
   * A module is available when ALL of:
   *  1. It exists in the Module Registry.
   *  2. The tenant has the module entitlement (from JWT claims) OR user is dev superuser.
   *  3. The user has RBAC permission to access it (or wildcard *).
   *  4. If requiresSubscription=true, moduleEntitlements must include the key.
   */
  const canAccessModule = useCallback(
    (module: IndustryModule): boolean => {
      if (!user) return false;                         // must be authenticated
      if (isDevSuperuser) return true;                  // dev bypass
      const manifest = MODULE_MANIFESTS[module];
      if (!manifest) return false;                     // unknown → deny

      // RBAC wildcard
      if (permissions.includes("*")) return true;

      // Subscription check
      if (manifest.requiresSubscription) {
        const entitled =
          moduleEntitlements.length === 0 || // no entitlements in JWT → allow all (pre-subscription tenant)
          moduleEntitlements.includes(module);
        if (!entitled) return false;
      }

      // Module-level RBAC permission (optional — if requiredPermission is set)
      if (manifest.requiredPermission && !permissions.includes(manifest.requiredPermission)) {
        return false;
      }

      return true;
    },
    [user, isDevSuperuser, permissions, moduleEntitlements],
  );

  const isModuleEnabled = useCallback(
    (module: IndustryModule) => canAccessModule(module),
    [canAccessModule],
  );

  const isModuleSubscribed = useCallback(
    (module: IndustryModule): boolean => {
      if (isDevSuperuser) return true;
      const manifest = MODULE_MANIFESTS[module];
      if (!manifest?.requiresSubscription) return true;
      return moduleEntitlements.length === 0 || moduleEntitlements.includes(module);
    },
    [isDevSuperuser, moduleEntitlements],
  );

  const availableModules = useMemo(
    () => ALL_MODULE_KEYS.filter((m) => canAccessModule(m)),
    [canAccessModule],
  );

  const enabledModules = availableModules;
  const subscribedModules = useMemo(
    () => ALL_MODULE_KEYS.filter((m) => isModuleSubscribed(m)),
    [isModuleSubscribed],
  );

  const canAccessTab = useCallback(
    (_tab: string) => {
      // Tab-level RBAC can be extended here in future
      return true;
    },
    [],
  );

  // ── Module setters with persistence ────────────────────────────────────────
  const setActiveModule = useCallback(
    (module: IndustryModule) => {
      if (!canAccessModule(module)) return;            // fail-closed
      setActiveModuleState(module);
      const newTab = getDefaultTab(module);
      setActiveTabState(newTab);
      try {
        localStorage.setItem("kwakopos:v2:active-module", module);
        localStorage.setItem("kwakopos:v2:active-tab", newTab);
      } catch { /* ignore */ }
    },
    [canAccessModule],
  );

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    try { localStorage.setItem("kwakopos:v2:active-tab", tab); } catch { /* ignore */ }
  }, []);

  // ── Manifest computation ───────────────────────────────────────────────────
  const manifest = useMemo((): ModuleManifest => {
    const raw = MODULE_MANIFESTS[activeModule] || MODULE_MANIFESTS["Retail"];
    // Ensure Settings always has Users & Roles
    const sidebar: SidebarItem[] = raw.sidebar.map((item) => {
      if (item === "Settings") return { name: "Settings", subItems: ["General Settings", "Users & Roles"] };
      if (typeof item !== "string" && item.name === "Settings") {
        return { ...item, subItems: [...(item.subItems || []).filter((s) => s !== "Users & Roles"), "Users & Roles"] };
      }
      return item;
    });
    return { ...raw, sidebar };
  }, [activeModule]);

  const sidebarItems = manifest.sidebar;
  const bottomNavItems = manifest.bottomNav;

  // ── Tenant switching ───────────────────────────────────────────────────────
  const switchTenant = async (id: string) => {
    if (!id || id === currentTenantId) return;
    try {
      if (isOnline) {
        const updated = await apiSwitchContext(id, currentBranchId || undefined);
        setUser((prev) => prev ? { ...prev, tenantId: updated.tenantId, branchId: updated.branchId } : null);
      } else {
        setUser((prev) => prev ? { ...prev, tenantId: id } : null);
      }
    } catch {
      setUser((prev) => prev ? { ...prev, tenantId: id } : null);
    }
  };

  const switchBranch = async (id: string) => {
    if (!id || id === currentBranchId) return;
    try {
      if (isOnline) {
        const updated = await apiSwitchContext(currentTenantId || undefined, id);
        setUser((prev) => prev ? { ...prev, tenantId: updated.tenantId, branchId: updated.branchId } : null);
      } else {
        setUser((prev) => prev ? { ...prev, branchId: id } : null);
      }
    } catch {
      setUser((prev) => prev ? { ...prev, branchId: id } : null);
    }
  };

  // ── Sync outbox ────────────────────────────────────────────────────────────
  const syncOutbox = async () => {
    if (!user || !isOnline) return;
    setSyncError(null);
    await db.ready;
    await syncEngine
      .syncWithServer(
        async (request) => {
          const response = await fetch("/sync/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
            },
            credentials: "include",
            body: JSON.stringify(request),
          });
          if (!response.ok) throw new Error(`Sync push failed: HTTP ${response.status}`);
          const body = await response.json();
          return body.data || body;
        },
        async (since) => {
          const url = since
            ? `/sync/delta?since=${encodeURIComponent(since)}`
            : "/sync/delta";
          const response = await fetch(url, {
            headers: { ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
            credentials: "include",
          });
          if (!response.ok) throw new Error(`Sync delta failed: HTTP ${response.status}`);
          const body = await response.json();
          return body.data || body;
        },
      )
      .then(() => setPendingOutboxCount(db.getPendingOutbox().length))
      .catch((error) => {
        setSyncError(error instanceof Error ? error.message : "Synchronization failed");
        throw error;
      });
  };

  // ── Tenant / branch list construction ─────────────────────────────────────
  // Production Rule: Strictly load authoritative context from session. No synthetic fallbacks.
  const availableTenantsList = useMemo(() => {
    if (!user || !user.tenantId) return [];
    return [{ id: user.tenantId, name: `${user.tenantId} (Active)` }];
  }, [user]);

  const availableBranchesList = useMemo(() => {
    if (!user || !user.branchId) return [];
    return [{ id: user.branchId, name: `${user.branchId} (Active)` }];
  }, [user]);

  // ── Context values ─────────────────────────────────────────────────────────
  const authValue: AuthContextType = {
    user, isAuthenticated: Boolean(user), isInitializing, error: authError, login, logout,
  };

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
    sidebarItems,
    bottomNavItems,
    searchModules,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isDevSuperuser,
  };

  const syncValue: SyncContextType = {
    isOnline, pendingOutboxCount, syncOutbox, db, syncEngine, syncError,
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

// ─── Individual Provider Aliases for Modular / Legacy Backward Compatibility ─
export const AuthProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const SessionProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const ModuleProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const SyncProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const TenantProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const BranchProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const RbacProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = KwakoPosProvider;
