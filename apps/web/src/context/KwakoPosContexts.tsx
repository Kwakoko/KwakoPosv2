import { AUTHORITATIVE_COMPATIBILITY_MATRIX } from "../persistence/releaseCompatibility.js";
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
  getDeviceId,
  refreshSession as apiRefreshSession,
  validateSession as apiValidateSession,
  heartbeatSession as apiHeartbeatSession,
  recordSessionEvent as apiRecordSessionEvent,
} from "../services/apiClient.js";
import {
  IdleDetector,
  HeartbeatService,
  SessionWarningModal,
  TimeoutRedirect,
  sessionSyncService,
} from "../session/index.js";
import { captureRegisteredDrafts, restoreSessionDrafts, type SessionDraft } from "../session/sessionDraftStore.js";
import { saveDurableSessionState, clearDurableSessionState } from "../session/sessionStateStore.js";
import { DATA_CHANGED_EVENT, publishDataChanged } from "../services/dataChangeEvent.js";
import { reconcileLocalInventoryToOutbox } from "../services/inventoryReconciliationService.js";
import { processTraVfdOutbox } from "../services/traVfdOutboxService.js";
import { dispatchDrawerOutbox, recoverInterruptedDrawerOutbox } from "../services/cashDrawerOutboxService.js";
import type { PersistenceStatusSnapshot } from "../persistence/persistenceStatus.js";
import { syncStatusService, type SyncStatusSnapshot } from "../services/syncStatusService.js";
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
  tenantName?: string;
  tenantSlug?: string;
  branchName?: string;
  branchCode?: string;
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
  login: (email: string, password: string, mfaCode?: string, rememberMe?: boolean) => Promise<AuthUser>;
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

export type ClientSessionStatus =
  | "UNKNOWN"
  | "AUTHENTICATING"
  | "AUTHENTICATED_ONLINE"
  | "AUTHENTICATED_OFFLINE"
  | "REFRESHING"
  | "REAUTH_REQUIRED"
  | "OFFLINE_LOCKED"
  | "EXPIRED"
  | "REVOKED"
  | "LOGGED_OUT";

export interface ClientSessionPolicy {
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  warningDurationMs: number;
  refreshTokenDurationMs: number;
  rememberMeDurationMs: number;
  offlineGracePeriodMs: number;
  heartbeatIntervalMs: number;
  refreshThresholdMs: number;
  forceLogoutOnBrowserClose: boolean;
  allowMultipleDevices: boolean;
  maxConcurrentSessions: number;
  forceLogoutOnPasswordChange: boolean;
  singleDeviceLogin: boolean;
  trustedDevices: boolean;
  autoRedirect: boolean;
  restoreLastPage: boolean;
}

export interface SessionContextType {
  status: ClientSessionStatus;
  policy: ClientSessionPolicy;
  lastActivityAt: number;
  expiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  offlineExpiresAt: number | null;
  idleRemainingMs: number;
  absoluteRemainingMs: number;
  warningOpen: boolean;
  isLocked: boolean;
  restoredDrafts: SessionDraft[];
  recordActivity: () => void;
  staySignedIn: () => Promise<void>;
  logoutNow: () => Promise<void>;
  restoreDrafts: () => SessionDraft[];
}

const DEFAULT_SESSION_POLICY: ClientSessionPolicy = {
  idleTimeoutMs: 30 * 60_000,
  absoluteTimeoutMs: 8 * 60 * 60_000,
  warningDurationMs: 2 * 60_000,
  refreshTokenDurationMs: 14 * 24 * 60 * 60_000,
  rememberMeDurationMs: 30 * 24 * 60 * 60_000,
  offlineGracePeriodMs: 24 * 60 * 60_000,
  heartbeatIntervalMs: 5 * 60_000,
  refreshThresholdMs: 5 * 60_000,
  forceLogoutOnBrowserClose: false,
  allowMultipleDevices: true,
  maxConcurrentSessions: 5,
  forceLogoutOnPasswordChange: true,
  singleDeviceLogin: false,
  trustedDevices: true,
  autoRedirect: true,
  restoreLastPage: true,
};

const DEFAULT_SESSION_CONTEXT: SessionContextType = {
  status: "UNKNOWN",
  policy: DEFAULT_SESSION_POLICY,
  lastActivityAt: 0,
  expiresAt: null,
  refreshTokenExpiresAt: null,
  offlineExpiresAt: null,
  idleRemainingMs: 0,
  absoluteRemainingMs: 0,
  warningOpen: false,
  isLocked: false,
  restoredDrafts: [],
  recordActivity: () => {},
  staySignedIn: async () => {},
  logoutNow: async () => {},
  restoreDrafts: () => [],
};

const SessionContext = createContext<SessionContextType>(DEFAULT_SESSION_CONTEXT);
export const useSession = (): SessionContextType => useContext(SessionContext);

const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AUTH_CONTEXT_PROVIDER_REQUIRED");
  return ctx;
};

interface TenantContextType {
  currentTenantId: string | null;
  currentTenantName: string | null;
  currentTenantSlug?: string | null;
  availableTenants: { id: string; name: string; slug?: string }[];
  switchTenant: (id: string) => Promise<void>;
  isImpersonating: boolean;
}

const DEFAULT_TENANT_CONTEXT: TenantContextType = {
  currentTenantId: null,
  currentTenantName: null,
  currentTenantSlug: null,
  availableTenants: [],
  switchTenant: async () => {},
  isImpersonating: false,
};

const TenantContext = createContext<TenantContextType | null>(null);
export const useTenant = (): TenantContextType => {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("TENANT_CONTEXT_PROVIDER_REQUIRED");
  return ctx;
};

interface BranchContextType {
  currentBranchId: string | null;
  currentBranchName: string | null;
  currentBranchCode?: string | null;
  availableBranches: { id: string; name: string; code?: string }[];
  switchBranch: (id: string) => Promise<void>;
}

const DEFAULT_BRANCH_CONTEXT: BranchContextType = {
  currentBranchId: null,
  currentBranchName: null,
  currentBranchCode: null,
  availableBranches: [],
  switchBranch: async () => {},
};

const BranchContext = createContext<BranchContextType | null>(null);
export const useBranch = (): BranchContextType => {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("BRANCH_CONTEXT_PROVIDER_REQUIRED");
  return ctx;
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
  if (!ctx) throw new Error("RBAC_CONTEXT_PROVIDER_REQUIRED");
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

const DEFAULT_MODULE_CONTEXT: ModuleContextType = {
  activeModule: "Retail",
  setActiveModule: () => {},
  activeTab: "Dashboard",
  setActiveTab: () => {},
  manifest: MODULE_MANIFESTS.Retail,
  availableModules: [],
  enabledModules: [],
  subscribedModules: [],
  canAccessModule: () => false,
  canAccessTab: () => false,
  isModuleEnabled: () => false,
  isModuleSubscribed: () => false,
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
  if (!ctx) throw new Error("MODULE_CONTEXT_PROVIDER_REQUIRED");
  return ctx;
};

interface SyncContextType {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  toggleOfflineSimulation: () => void;
  isSyncing: boolean;
  pendingOutboxCount: number;
  syncStatus: SyncStatusSnapshot;
  syncOutbox: (options?: { quiet?: boolean; force?: boolean }) => Promise<any>;
  /** Force a full bootstrap re-sync from the server, wiping and replacing local IndexedDB state. */
  forceBootstrap: () => Promise<void>;
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
  syncStatus: syncStatusService.getSnapshot(),
  syncOutbox: async () => {},
  forceBootstrap: async () => {},
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
  if (!ctx) throw new Error("SYNC_CONTEXT_PROVIDER_REQUIRED");
  return ctx;
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
  const [pwaVersionManager] = useState(() => new PwaVersionManager(AUTHORITATIVE_COMPATIBILITY_MATRIX.applicationVersion, AUTHORITATIVE_COMPATIBILITY_MATRIX.schemaVersion, db));

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
      tenantName: stored.user.tenantName,
      tenantSlug: stored.user.tenantSlug,
      branchName: stored.user.branchName,
      branchCode: stored.user.branchCode,
    };
  });
  const [isInitializing, setIsInitializing] = useState(() => !getStoredSession()?.user);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("kwakopos:v2:theme") === "light" ? "light" : "dark",
  );
  const [rawOnline, setRawOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [sessionStatus, setSessionStatus] = useState<ClientSessionStatus>("UNKNOWN");
  const [sessionPolicy, setSessionPolicy] = useState<ClientSessionPolicy>(DEFAULT_SESSION_POLICY);
  const [sessionLastActivityAt, setSessionLastActivityAt] = useState<number>(() => Date.now());
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(() => {
    const raw = getStoredSession()?.session?.expiresAt;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [sessionRefreshTokenExpiresAt, setSessionRefreshTokenExpiresAt] = useState<number | null>(() => {
    const raw = getStoredSession()?.session?.refreshTokenExpiresAt;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [offlineExpiresAt, setOfflineExpiresAt] = useState<number | null>(null);
  const [sessionWarningOpen, setSessionWarningOpen] = useState(false);
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  const [sessionRedirectPath, setSessionRedirectPath] = useState<string | null>(null);
  const [restoredDrafts, setRestoredDrafts] = useState<SessionDraft[]>([]);
  const sessionTerminationRef = useRef(false);
  const sessionLastActivityRef = useRef(sessionLastActivityAt);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const isOnline = isSimulatedOffline ? false : rawOnline;
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(() => syncStatusService.getSnapshot());
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

  const login = async (email: string, password: string, mfaCode?: string, rememberMe = false): Promise<AuthUser> => {
    setAuthError(null);
    sessionTerminationRef.current = false;
    const loggedIn = await apiLogin(email, password, mfaCode, rememberMe);
    const authUser: AuthUser = {
      id: loggedIn.id, name: loggedIn.name, email: loggedIn.email, role: loggedIn.role,
      tenantId: loggedIn.tenantId, branchId: loggedIn.branchId, tenantName: loggedIn.tenantName,
      tenantSlug: loggedIn.tenantSlug, branchName: loggedIn.branchName, branchCode: loggedIn.branchCode,
    };
    const stored = getStoredSession();
    const expiry = stored?.session?.expiresAt ? Date.parse(stored.session.expiresAt) : NaN;
    const refreshExpiry = stored?.session?.refreshTokenExpiresAt ? Date.parse(stored.session.refreshTokenExpiresAt) : NaN;
    setSessionExpiresAt(Number.isFinite(expiry) ? expiry : Date.now() + DEFAULT_SESSION_POLICY.absoluteTimeoutMs);
    setSessionRefreshTokenExpiresAt(Number.isFinite(refreshExpiry) ? refreshExpiry : null);
    const now = Date.now();
    setSessionLastActivityAt(now);
    sessionLastActivityRef.current = now;
    setOfflineExpiresAt(null);
    setSessionStatus("AUTHENTICATED_ONLINE");
    setSessionWarningOpen(false);
    void saveDurableSessionState({
      sessionId: stored?.sessionId || "",
      tenantId: authUser.tenantId,
      branchId: authUser.branchId,
      userId: authUser.id,
      deviceId: getDeviceId(),
      status: "AUTHENTICATED_ONLINE",
      authenticatedAt: now,
      lastOnlineAt: now,
      lastActivityAt: now,
      serverExpiresAt: Number.isFinite(expiry) ? expiry : null,
      lastValidatedAt: now,
      localLogoutPending: false,
    });
    void apiRecordSessionEvent("SESSION_RESTORED", { source: "login" });
    setSessionRedirectPath(null);
    const drafts = restoreSessionDrafts(authUser.tenantId, authUser.id);
    setRestoredDrafts(drafts);
    window.dispatchEvent(new CustomEvent("kwakopos:session-restored", { detail: { drafts } }));
    setUser(authUser);
    sessionSyncService.broadcast("SESSION_LOGIN", { sessionId: stored?.sessionId || null });
    try {
      await db.ready;
      await db.refreshStoresFromNative();
      setPendingOutboxCount(db.getPendingOutbox(authUser.tenantId, authUser.branchId).length);
    } catch (err) {
      console.warn("[Session] Post-login store alignment warned:", err);
    }
    return authUser;
  };

  const terminateSession = useCallback(async (
    reason: "SESSION_TIMEOUT" | "USER_LOGOUT" | "SESSION_REVOKED" | "SESSION_LOCKED",
    broadcast = true,
    redirectOnExpiry = reason === "SESSION_TIMEOUT",
  ) => {
    if (sessionTerminationRef.current) return;
    sessionTerminationRef.current = true;
    const currentUser = user;
    const currentPath = typeof window !== "undefined"
      ? window.location.pathname + window.location.search + window.location.hash
      : "/";
    if (currentUser) {
      captureRegisteredDrafts(currentUser.tenantId, currentUser.id);
      await db.flushPersistence().catch(() => {});
    }
    if (broadcast) {
      const event = reason === "SESSION_TIMEOUT" ? "SESSION_TIMEOUT" : reason === "SESSION_REVOKED" ? "SESSION_REVOKED" : reason === "SESSION_LOCKED" ? "SESSION_LOCKED" : "SESSION_LOGOUT";
      sessionSyncService.broadcast(event, { sessionId: getStoredSession()?.sessionId || null });
    }
    if (reason === "USER_LOGOUT" || reason === "SESSION_TIMEOUT") {
      await apiLogout(reason).catch(() => {});
    }
    setUser(null);
    setSessionWarningOpen(false);
    void clearDurableSessionState();
    setSessionStatus(reason === "SESSION_TIMEOUT" ? "EXPIRED" : reason === "SESSION_REVOKED" ? "REVOKED" : reason === "SESSION_LOCKED" ? "OFFLINE_LOCKED" : "LOGGED_OUT");
    if (redirectOnExpiry && currentPath !== "/login" && currentPath !== "/auth/login") setSessionRedirectPath(currentPath);
  }, [db, user]);

  const logout = useCallback(async () => {
    await terminateSession("USER_LOGOUT", true, false);
    setImpersonatedTenant(null);
    try {
      sessionStorage.removeItem("kwakopos:v2:impersonation");
      localStorage.removeItem("kwakopos:v2:active-module");
      localStorage.removeItem("kwakopos:v2:active-tab");
    } catch { /* ignore */ }
    setActiveModuleState("Retail");
    setActiveTabState("Dashboard");
    setAuthError(null);
    sessionTerminationRef.current = false;
  }, [terminateSession]);

  const recordSessionActivity = useCallback(() => {
    if (!user || ["OFFLINE_LOCKED", "LOGGED_OUT", "EXPIRED"].includes(sessionStatus)) return;
    const now = Date.now();
    sessionLastActivityRef.current = now;
    setSessionLastActivityAt(now);
    if (isOnline) {
      setSessionStatus("AUTHENTICATED_ONLINE");
      setSessionWarningOpen(false);
    }
  }, [user, sessionStatus, isOnline]);

  const staySignedIn = useCallback(async () => {
    if (!user || sessionStatus === "OFFLINE_LOCKED") return;
    setSessionStatus("REFRESHING");
    try {
      const refreshed = await apiRefreshSession();
      if (!refreshed) throw new Error("SESSION_REFRESH_REJECTED");
      const heartbeat = await apiHeartbeatSession();
      const data = heartbeat?.data || heartbeat;
      const activity = Date.parse(String(data?.lastActivityAt || "")) || Date.now();
      const expiry = Date.parse(String(data?.expiresAt || ""));
      const refreshExpiry = Date.parse(String(data?.refreshTokenExpiresAt || ""));
      sessionLastActivityRef.current = activity;
      setSessionLastActivityAt(activity);
      if (Number.isFinite(expiry)) setSessionExpiresAt(expiry);
      if (Number.isFinite(refreshExpiry)) setSessionRefreshTokenExpiresAt(refreshExpiry);
      setSessionStatus(isOnline ? "AUTHENTICATED_ONLINE" : "AUTHENTICATED_OFFLINE");
      setSessionWarningOpen(false);
    } catch (error) {
      await terminateSession("SESSION_TIMEOUT", true, true);
      throw error;
    }
  }, [user, sessionStatus, isOnline, terminateSession]);

  const restoreDrafts = useCallback(() => {
    if (!user) return [];
    const drafts = restoreSessionDrafts(user.tenantId, user.id);
    setRestoredDrafts(drafts);
    return drafts;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!isOnline) {
      const absolute = sessionExpiresAt || (Date.now() + sessionPolicy.absoluteTimeoutMs);
      const offlineUntil = Math.min(absolute, Date.now() + sessionPolicy.offlineGracePeriodMs);
      setOfflineExpiresAt(offlineUntil);
      setSessionStatus("AUTHENTICATED_OFFLINE");
      return;
    }

    let alive = true;
    // Small stabilization delay: lets the access token settle in memory after
    // login before firing the first validation request. Without this the effect
    // can fire synchronously before the token is stored, causing a spurious 401.
    const delay = setTimeout(() => {
      if (!alive) return;
      void apiValidateSession()
        .then((result) => {
          if (!alive) return;
          const data = result?.data || result;
          const expiry = Date.parse(String(data?.expiresAt || ""));
          const refreshExpiry = Date.parse(String(data?.refreshTokenExpiresAt || ""));
          const idleMinutes = Number(data?.policy?.idleTimeoutMinutes);
          const warningSeconds = Number(data?.policy?.warningDurationSeconds);
          if (Number.isFinite(expiry)) setSessionExpiresAt(expiry);
          if (Number.isFinite(refreshExpiry)) setSessionRefreshTokenExpiresAt(refreshExpiry);
          setSessionPolicy((current) => ({
            ...current,
            idleTimeoutMs: Number.isFinite(idleMinutes) ? idleMinutes * 60_000 : current.idleTimeoutMs,
            warningDurationMs: Number.isFinite(warningSeconds) ? warningSeconds * 1000 : current.warningDurationMs,
          }));
          const serverActivity = Date.parse(String(data?.lastActivityAt || ""));
          if (Number.isFinite(serverActivity)) {
            setSessionLastActivityAt(serverActivity);
            sessionLastActivityRef.current = serverActivity;
          }
          setSessionStatus("AUTHENTICATED_ONLINE");
          setOfflineExpiresAt(null);
          void saveDurableSessionState({
            sessionId: String(getStoredSession()?.sessionId || ""),
            tenantId: user.tenantId,
            branchId: user.branchId,
            userId: user.id,
            deviceId: getDeviceId(),
            status: "AUTHENTICATED_ONLINE",
            authenticatedAt: Number.isFinite(expiry) ? expiry - sessionPolicy.absoluteTimeoutMs : Date.now(),
            lastOnlineAt: Date.now(),
            lastActivityAt: Number.isFinite(serverActivity) ? serverActivity : Date.now(),
            serverExpiresAt: Number.isFinite(expiry) ? expiry : null,
            lastValidatedAt: Date.now(),
            localLogoutPending: false,
          });
          void apiRecordSessionEvent("SESSION_RESTORED", { source: "session-validate" });
        })
        .catch((err: unknown) => {
          if (!alive) return;
          // NEVER terminate the session from the validate catch.
          // The access token is memory-only and is lost on every page reload.
          // A 401 here almost always means the token hasn't been refreshed yet,
          // NOT that the server session is revoked. The authoritative expiry
          // mechanism is the idle/absolute timeout ticker (setInterval below).
          // Terminating here was the root cause of the post-login flash to LoginPage.
          console.warn("[Session] Validate transient failure (token may still be refreshing):", (err as any)?.status);
        });
    }, 1500);
    return () => { alive = false; clearTimeout(delay); };
  // Intentionally exclude sessionExpiresAt: including it causes the effect to
  // re-run every time validation updates the expiry, creating an infinite loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isOnline, sessionPolicy.absoluteTimeoutMs, sessionPolicy.offlineGracePeriodMs, terminateSession]);

  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setSessionNow(now);
      if (!isOnline) {
        const until = offlineExpiresAt || Math.min(
          sessionExpiresAt || (now + sessionPolicy.absoluteTimeoutMs),
          now + sessionPolicy.offlineGracePeriodMs,
        );
        if (now >= until) {
          setSessionStatus("OFFLINE_LOCKED");
          setSessionWarningOpen(false);
        }
        return;
      }
      const absoluteRemaining = sessionExpiresAt == null ? Number.POSITIVE_INFINITY : sessionExpiresAt - now;
      const idleRemaining = sessionLastActivityAt + sessionPolicy.idleTimeoutMs - now;
      const remaining = Math.min(absoluteRemaining, idleRemaining);
      if (absoluteRemaining <= 0 || idleRemaining <= 0) {
        void terminateSession("SESSION_TIMEOUT", true, true);
        return;
      }
      if (remaining <= sessionPolicy.warningDurationMs) {
        if (!sessionWarningOpen) {
          sessionSyncService.broadcast("SESSION_WARNING", { sessionId: getStoredSession()?.sessionId || null, remainingMs: remaining });
          void apiRecordSessionEvent("SESSION_WARNING_SHOWN", { remainingMs: remaining });
        }
        setSessionWarningOpen(true);
      } else if (sessionWarningOpen) {
        setSessionWarningOpen(false);
      }
    }, 1_000);
    return () => window.clearInterval(id);
  }, [user, isOnline, offlineExpiresAt, sessionExpiresAt, sessionLastActivityAt, sessionPolicy, sessionWarningOpen, terminateSession]);

  useEffect(() => sessionSyncService.subscribe((event) => {
    if (!user) return;
    const currentId = String(getStoredSession()?.sessionId || "");
    const eventId = String(event.payload?.sessionId || "");
    if (event.type === "SESSION_WARNING") {
      if (!eventId || eventId === currentId) setSessionWarningOpen(true);
      return;
    }
    if (!["SESSION_TIMEOUT", "SESSION_REVOKED", "SESSION_LOCKED", "SESSION_LOGOUT"].includes(event.type)) return;
    if (eventId && eventId !== currentId) return;
    void terminateSession(
      event.type === "SESSION_TIMEOUT" ? "SESSION_TIMEOUT" :
      event.type === "SESSION_REVOKED" ? "SESSION_REVOKED" :
      event.type === "SESSION_LOCKED" ? "SESSION_LOCKED" : "USER_LOGOUT",
      false,
      event.type === "SESSION_TIMEOUT",
    );
  }), [user, terminateSession]);

  const sessionIdleRemainingMs = Math.max(0, sessionLastActivityAt + sessionPolicy.idleTimeoutMs - sessionNow);
  const sessionAbsoluteRemainingMs = Math.max(0, (sessionExpiresAt || sessionNow) - sessionNow);

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

  const refreshSyncStatus = useCallback(() => {
    const tenantId = currentTenantId || user?.tenantId || null;
    const branchId = currentBranchId || user?.branchId || null;
    syncStatusService.setScope({ tenantId, branchId });
    syncStatusService.setNetworkStatus(isOnline);
    void syncStatusService.refreshCounts({ tenantId, branchId });
  }, [currentTenantId, currentBranchId, user?.tenantId, user?.branchId, isOnline]);

  useEffect(() => {
    syncStatusService.registerStore(db);
    const unsubscribe = syncStatusService.subscribe(setSyncStatus);
    refreshSyncStatus();
    return unsubscribe;
  }, [db, refreshSyncStatus]);

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
    const syncScope = { tenantId: targetTenantId, branchId: targetBranchId };
    syncStatusService.setScope(syncScope);
    syncStatusService.startSync(syncScope);
    setSyncStatus(syncStatusService.getSnapshot(syncScope));

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
        async (manifest) => {
          const body = await apiFetch<any>("/sync/reconcile", {
            method: "POST",
            headers: {
              "x-tenant-id": targetTenantId,
              "x-branch-id": targetBranchId,
              "x-user-id": targetUserId,
            },
            body: JSON.stringify(manifest),
          });
          return body.data || body;
        },
      );

      const now = Date.now();
      lastSyncTimeRef.current = now;
      consecutiveFailuresRef.current = 0;
      setLastSyncedAt(now);
      setPendingOutboxCount(db.getPendingOutbox(targetTenantId, targetBranchId).length);
      syncStatusService.completeSync(result, true);
      setSyncStatus(syncStatusService.getSnapshot(syncScope));

      if (result && (result.pulled > 0 || result.pushed > 0)) {
        publishDataChanged({ action: "SYNC_CONVERGED", ...result });
        publishDataChanged({ action: "INVENTORY_CHANGED" });
        try {
          if (typeof window !== "undefined" && "BroadcastChannel" in window) {
            const bc = new BroadcastChannel("kwakopos_sync_channel");
            bc.postMessage({
              type: "SYNC_CONVERGED",
              tenantId: targetTenantId,
              branchId: targetBranchId,
              ...result,
              timestamp: Date.now(),
            });
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
      syncStatusService.failSync(error);
      setSyncStatus(syncStatusService.getSnapshot(syncScope));
      throw error;
    } finally {
      isSyncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [user, currentTenantId, currentBranchId, isOnline, db, syncEngine]);

  // Force-bootstrap: wipe local IndexedDB and re-fetch from authoritative server snapshot.
  // Triggered by UI button or `kwakopos:force-bootstrap` window event.
  const forceBootstrap = useCallback(async () => {
    if (!isOnline) return;
    const targetTenantId = user?.tenantId || currentTenantId || "tenant-default";
    const targetBranchId = user?.branchId || currentBranchId || "branch-default";
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncEngine.bootstrapWithServer(
        async (req) => {
          const body = await apiFetch<any>("/sync/bootstrap", {
            method: "POST",
            headers: {
              "x-tenant-id": targetTenantId,
              "x-branch-id": targetBranchId,
              "x-user-id": user?.id || "user-default",
            },
            body: JSON.stringify(req),
          });
          return body.data || body;
        },
        targetTenantId,
        targetBranchId,
      );
      // After bootstrap, purge any remaining orphaned outbox items from old scopes.
      db.purgeOrphanedOutbox(targetTenantId, targetBranchId);
      await db.refreshStoresFromNative();
      setPendingOutboxCount(db.getPendingOutbox(targetTenantId, targetBranchId).length);
      const syncScope = { tenantId: targetTenantId, branchId: targetBranchId };
      await syncStatusService.refreshCounts(syncScope);
      setSyncStatus(syncStatusService.getSnapshot(syncScope));
      publishDataChanged({ action: "SYNC_CONVERGED", bootstrapped: true });
      publishDataChanged({ action: "INVENTORY_CHANGED" });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Bootstrap failed");
    } finally {
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

  // Force-bootstrap event: dispatching `kwakopos:force-bootstrap` from DevTools or the UI
  // triggers a full authoritative snapshot re-sync, clearing ghost products and orphaned outbox items.
  useEffect(() => {
    const handleForceBootstrap = () => { void forceBootstrap(); };
    window.addEventListener("kwakopos:force-bootstrap", handleForceBootstrap);
    return () => window.removeEventListener("kwakopos:force-bootstrap", handleForceBootstrap);
  }, [forceBootstrap]);

  // On boot: purge orphaned outbox items from old test sessions to keep the pending-sync count clean.
  useEffect(() => {
    const targetTenantId = user?.tenantId || currentTenantId;
    const targetBranchId = user?.branchId || currentBranchId;
    if (!targetTenantId || !targetBranchId) return;
    try {
      const purged = db.purgeOrphanedOutbox(targetTenantId, targetBranchId);
      if (purged > 0) {
        console.info(`[Sync] Boot-time orphan purge: removed ${purged} outbox items from old scopes.`);
      }
    } catch { /* never break the app */ }
  }, [db, user?.tenantId, user?.branchId, currentTenantId, currentBranchId]);

  // 1. Cross-tab peer convergence via BroadcastChannel
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const bc = new BroadcastChannel("kwakopos_sync_channel");
    bc.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      const activeTenantId = user?.tenantId || currentTenantId || null;
      const activeBranchId = user?.branchId || currentBranchId || null;
      const messageTenantId = data.tenantId ? String(data.tenantId) : null;
      const messageBranchId = data.branchId ? String(data.branchId) : null;
      if (
        (messageTenantId && activeTenantId && messageTenantId !== activeTenantId) ||
        (messageBranchId && activeBranchId && messageBranchId !== activeBranchId)
      ) {
        return;
      }

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
          publishDataChanged({ action: "SYNC_CONVERGED", ...data });
          publishDataChanged({ action: "INVENTORY_CHANGED" });
        }).catch(() => {
          publishDataChanged({ action: "SYNC_CONVERGED", ...data });
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

  // Cash drawer has its own high-priority hardware queue. It is independent of syncOutbox and TRA VFD.
  useEffect(() => {
    if (!user?.tenantId || !user?.branchId) return;
    const ctx = { tenantId: user.tenantId, branchId: user.branchId };
    const runDrawer = () => {
      void dispatchDrawerOutbox(db, ctx).catch((error) => {
        console.warn("[CASH DRAWER] Hardware queue processing failed:", error);
      });
    };
    void db.ready.then(() => {
      recoverInterruptedDrawerOutbox(db);
      runDrawer();
    }).catch(() => undefined);
    const timer = window.setInterval(runDrawer, 5000);
    window.addEventListener("focus", runDrawer);
    window.addEventListener("online", runDrawer);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", runDrawer);
      window.removeEventListener("online", runDrawer);
    };
  }, [db, user?.tenantId, user?.branchId]);

  // TRA VFD has its own fiscal worker and durable queue. It never calls syncOutbox.
  useEffect(() => {
    if (!isOnline || !user?.tenantId || !user?.branchId) return;
    const ctx = { tenantId: user.tenantId, branchId: user.branchId };
    const runTraVfd = () => {
      void processTraVfdOutbox(db, ctx).catch((error) => {
        console.warn("[TRA VFD] Fiscal queue processing failed:", error);
      });
    };
    runTraVfd();
    const timer = window.setInterval(runTraVfd, 30000);
    window.addEventListener("online", runTraVfd);
    window.addEventListener("focus", runTraVfd);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", runTraVfd);
      window.removeEventListener("focus", runTraVfd);
    };
  }, [isOnline, db, user?.tenantId, user?.branchId]);

  const availableTenantsList = useMemo(() => {
    if (impersonatedTenant) return [{ id: impersonatedTenant.tenantId, name: `${impersonatedTenant.tenantName} (Audit)`, slug: (impersonatedTenant as any).tenantSlug }];
    if (!user?.tenantId) return [];
    const friendlyName = (user as any).tenantName || "Bravados";
    const slug = (user as any).tenantSlug || undefined;
    return [{ id: user.tenantId, name: friendlyName, slug }];
  }, [user, impersonatedTenant]);

  const availableBranchesList = useMemo(() => {
    if (impersonatedTenant) return [{ id: impersonatedTenant.branchId, name: `${impersonatedTenant.branchName} (Audit)`, code: (impersonatedTenant as any).branchCode }];
    if (!user?.branchId) return [];
    const friendlyBranch = (user as any).branchName || "Main HQ";
    const code = (user as any).branchCode || undefined;
    return [{ id: user.branchId, name: friendlyBranch, code }];
  }, [user, impersonatedTenant]);

  const currentTenantName = impersonatedTenant?.tenantName || (isSuperAdmin ? "Platform Super Admin" : availableTenantsList.find((t) => t.id === currentTenantId)?.name || "Bravados");
  const currentTenantSlug = impersonatedTenant ? (impersonatedTenant as any).tenantSlug || null : user?.tenantSlug || null;
  const currentBranchName = impersonatedTenant?.branchName || (isSuperAdmin ? "Global Control Plane" : availableBranchesList.find((b) => b.id === currentBranchId)?.name || "Main HQ");
  const currentBranchCode = impersonatedTenant ? (impersonatedTenant as any).branchCode || null : user?.branchCode || null;

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
    currentTenantSlug,
    availableTenants: availableTenantsList,
    switchTenant,
    isImpersonating: Boolean(impersonatedTenant),
  };
  const branchValue: BranchContextType = {
    currentBranchId,
    currentBranchName,
    currentBranchCode,
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
    syncStatus,
    syncOutbox,
    forceBootstrap,
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
                    <SessionContext.Provider value={{
                      status: sessionStatus,
                      policy: sessionPolicy,
                      lastActivityAt: sessionLastActivityAt,
                      expiresAt: sessionExpiresAt,
                      refreshTokenExpiresAt: sessionRefreshTokenExpiresAt,
                      offlineExpiresAt,
                      idleRemainingMs: sessionIdleRemainingMs,
                      absoluteRemainingMs: sessionAbsoluteRemainingMs,
                      warningOpen: sessionWarningOpen,
                      isLocked: sessionStatus === "OFFLINE_LOCKED",
                      restoredDrafts,
                      recordActivity: recordSessionActivity,
                      staySignedIn,
                      logoutNow: logout,
                      restoreDrafts,
                    }}>
                      <IdleDetector enabled={Boolean(user)} onActivity={recordSessionActivity} />
                      <HeartbeatService
                        enabled={Boolean(user && isOnline && sessionStatus === "AUTHENTICATED_ONLINE")}
                        intervalMs={sessionPolicy.heartbeatIntervalMs}
                        lastActivityAt={sessionLastActivityAt}
                        onFailure={(error) => {
                          if (typeof navigator !== "undefined" && navigator.onLine === false) return;
                          const message = error instanceof Error ? error.message : String(error);
                          if (/expired|authentication|unauthorized|session/i.test(message)) void terminateSession("SESSION_TIMEOUT", true, true);
                        }}
                      />
                      <SessionWarningModal
                        open={sessionWarningOpen && Boolean(user) && isOnline}
                        remainingMs={Math.min(sessionIdleRemainingMs, sessionAbsoluteRemainingMs)}
                        onStaySignedIn={() => void staySignedIn()}
                        onLogout={() => void logout()}
                      />
                      <TimeoutRedirect active={Boolean(sessionRedirectPath)} redirectPath={sessionRedirectPath} />
                      {sessionStatus === "OFFLINE_LOCKED" && (
                        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(15,23,42,.96)", color: "#fff", display: "grid", placeItems: "center", padding: "2rem", textAlign: "center" }}>
                          <div style={{ maxWidth: 560 }}>
                            <h2 style={{ marginTop: 0 }}>Session Locked — Connection Required</h2>
                            <p>Your offline authorization period has ended. Your business data and pending synchronization records are preserved.</p>
                            <p>Reconnect to validate the session and continue.</p>
                          </div>
                        </div>
                      )}
                      {children}
                    </SessionContext.Provider>
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


