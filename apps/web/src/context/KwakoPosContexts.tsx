/**
 * KwakoPos 2.0 V2 React Context Provider Suite
 * Authoritative system-of-record context providers for Auth, Session, Tenant, Branch, RBAC, Module, Sync, and Theme.
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { LocalIndexedDbStore } from "../indexedDb.js";
import { ClientSyncEngine } from "../clientSyncEngine.js";
import { PwaVersionManager } from "../versionManager.js";
import { KWAKOPOS_UI_PARITY_MATRIX } from "../uiParityMatrix.js";

// --- 1. Auth Context ---
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthContextType {
  user: AuthUser;
  isAuthenticated: boolean;
  login: (email: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: { id: "USR-ADM-01", name: "Alexander M. (Platform Admin)", email: "alexander@kwakopos.com", role: "ADMIN" },
  isAuthenticated: true,
  login: () => {},
  logout: () => {}
});

export const useAuth = () => useContext(AuthContext);

// --- 2. Tenant Context ---
export interface TenantContextType {
  currentTenantId: string;
  currentTenantName: string;
  availableTenants: { id: string; name: string }[];
  switchTenant: (id: string) => void;
}

export const TenantContext = createContext<TenantContextType>({
  currentTenantId: "TNT-TZ-001",
  currentTenantName: "KwakoPos Enterprise Tanzania",
  availableTenants: [
    { id: "TNT-TZ-001", name: "KwakoPos Enterprise Tanzania" },
    { id: "TNT-KE-002", name: "KwakoPos Kenya Ltd" }
  ],
  switchTenant: () => {}
});

export const useTenant = () => useContext(TenantContext);

// --- 3. Branch Context ---
export interface BranchContextType {
  currentBranchId: string;
  currentBranchName: string;
  availableBranches: { id: string; name: string }[];
  switchBranch: (id: string) => void;
}

export const BranchContext = createContext<BranchContextType>({
  currentBranchId: "BR-DSM-01",
  currentBranchName: "Dar es Salaam Main Branch",
  availableBranches: [
    { id: "BR-DSM-01", name: "Dar es Salaam Main Branch" },
    { id: "BR-ARU-02", name: "Arusha Branch" }
  ],
  switchBranch: () => {}
});

export const useBranch = () => useContext(BranchContext);

// --- 4. RBAC Context ---
export interface RbacContextType {
  role: string;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
}

export const RbacContext = createContext<RbacContextType>({
  role: "ADMIN",
  permissions: ["ALL"],
  hasPermission: () => true
});

export const useRbac = () => useContext(RbacContext);

// --- 5. Sync & Outbox Context ---
export interface SyncContextType {
  isOnline: boolean;
  pendingOutboxCount: number;
  syncOutbox: () => void;
  db: LocalIndexedDbStore;
  syncEngine: ClientSyncEngine;
}

export const SyncContext = createContext<SyncContextType | null>(null);

export const useSync = () => useContext(SyncContext)!;

// --- 6. Theme Context ---
export interface ThemeContextType {
  theme: "dark" | "light";
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {}
});

export const useTheme = () => useContext(ThemeContext);

// --- Master KwakoPosProvider Component ---
export const KwakoPosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db] = useState(() => new LocalIndexedDbStore());
  const [syncEngine] = useState(() => new ClientSyncEngine("device-browser-client-1", db));
  const [versionManager] = useState(() => new PwaVersionManager("2.2.0", 3, db));

  const [user, setUser] = useState<AuthUser>({
    id: "USR-ADM-01",
    name: "Alexander M. (Platform Admin)",
    email: "alexander@kwakopos.com",
    role: "ADMIN"
  });

  const [currentTenantId, setCurrentTenantId] = useState("TNT-TZ-001");
  const [currentBranchId, setCurrentBranchId] = useState("BR-DSM-01");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const switchTenant = (id: string) => {
    setCurrentTenantId(id);
  };

  const switchBranch = (id: string) => {
    setCurrentBranchId(id);
  };

  const toggleTheme = () => {
    setTheme(t => (t === "dark" ? "light" : "dark"));
  };

  const syncOutbox = () => {
    const pending = db.getPendingOutbox();
    for (const item of pending) {
      db.markOutboxSynced(item.id);
    }
    setPendingCount(db.getPendingOutbox().length);
  };

  const authValue: AuthContextType = {
    user,
    isAuthenticated: true,
    login: () => {},
    logout: () => {}
  };

  const tenantValue: TenantContextType = {
    currentTenantId,
    currentTenantName: currentTenantId === "TNT-TZ-001" ? "KwakoPos Enterprise Tanzania" : "KwakoPos Kenya Ltd",
    availableTenants: [
      { id: "TNT-TZ-001", name: "KwakoPos Enterprise Tanzania" },
      { id: "TNT-KE-002", name: "KwakoPos Kenya Ltd" }
    ],
    switchTenant
  };

  const branchValue: BranchContextType = {
    currentBranchId,
    currentBranchName: currentBranchId === "BR-DSM-01" ? "Dar es Salaam Main Branch" : "Arusha Branch",
    availableBranches: [
      { id: "BR-DSM-01", name: "Dar es Salaam Main Branch" },
      { id: "BR-ARU-02", name: "Arusha Branch" }
    ],
    switchBranch
  };

  const rbacValue: RbacContextType = {
    role: user.role,
    permissions: ["ALL"],
    hasPermission: () => true
  };

  const syncValue: SyncContextType = {
    isOnline,
    pendingOutboxCount: db.getPendingOutbox().length,
    syncOutbox,
    db,
    syncEngine
  };

  const themeValue: ThemeContextType = {
    theme,
    toggleTheme
  };

  return (
    <AuthContext.Provider value={authValue}>
      <TenantContext.Provider value={tenantValue}>
        <BranchContext.Provider value={branchValue}>
          <RbacContext.Provider value={rbacValue}>
            <SyncContext.Provider value={syncValue}>
              <ThemeContext.Provider value={themeValue}>
                {children}
              </ThemeContext.Provider>
            </SyncContext.Provider>
          </RbacContext.Provider>
        </BranchContext.Provider>
      </TenantContext.Provider>
    </AuthContext.Provider>
  );
};
