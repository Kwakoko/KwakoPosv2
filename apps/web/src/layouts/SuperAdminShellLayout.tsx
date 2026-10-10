import React from "react";
import { useAuth } from "../context/KwakoPosContexts.js";

export interface SuperAdminShellLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

const PLATFORM_NAVIGATION = [
  { label: "Platform Overview", path: "/super-admin" },
  { label: "Certification", path: "/super-admin/certification" },
  { label: "Support Control Tower", path: "/super-admin/support" },
  { label: "Compliance Tower", path: "/super-admin/compliance" },
  { label: "Rollback Authorization", path: "/super-admin/rollback" },
  { label: "Platform Diagnostics", path: "/diagnostics" },
  { label: "Provision Tenant", path: "/tenant-onboarding" },
] as const;

/**
 * Dedicated platform-level shell. It intentionally does not mount the tenant
 * TopBar, tenant sidebar, module selector, tenant Administration entry, sync HUD,
 * or tenant workspace controls.
 */
export const SuperAdminShellLayout: React.FC<SuperAdminShellLayoutProps> = ({
  currentPath,
  onNavigate,
  children,
}) => {
  const { user, logout } = useAuth();

  const isActive = (path: string) =>
    currentPath === path ||
    (path === "/super-admin" && currentPath === "/super-admin");

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Always leave the protected platform surface if server-side logout fails.
    } finally {
      onNavigate("/");
    }
  };

  return (
    <div
      data-shell="platform-super-admin"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0b1324",
        color: "#e2e8f0",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          minHeight: 66,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "0.75rem 1.25rem",
          borderBottom: "1px solid #29364b",
          background: "#101a2d",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 38,
              height: 38,
              display: "grid",
              placeItems: "center",
              borderRadius: 10,
              background: "rgba(16,185,129,.13)",
              border: "1px solid rgba(16,185,129,.4)",
              color: "#34d399",
              fontWeight: 900,
              fontSize: 18,
            }}
          >
            K
          </div>
          <div>
            <div style={{ fontWeight: 850, letterSpacing: "-0.02em", color: "#f8fafc" }}>
              Kwakoko Platform
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "#34d399" }}>
              SUPER ADMIN CONTROL TOWER
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.75rem" }}>
          <div style={{ textAlign: "right", minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 750, color: "#f8fafc" }}>{user?.name || "Platform Administrator"}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>PLATFORM_SUPER_ADMIN</div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            style={{
              border: "1px solid #3b4a61",
              borderRadius: 8,
              padding: "0.5rem 0.75rem",
              background: "#17243a",
              color: "#e2e8f0",
              fontSize: 12,
              fontWeight: 750,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)", flex: 1 }}>
        <aside
          aria-label="Platform navigation"
          style={{
            padding: "1rem 0.75rem",
            borderRight: "1px solid #29364b",
            background: "#111d30",
          }}
        >
          <div style={{ padding: "0.5rem 0.75rem 0.85rem", color: "#64748b", fontSize: 10, fontWeight: 900, letterSpacing: ".14em" }}>
            PLATFORM OPERATIONS
          </div>
          <nav style={{ display: "grid", gap: 5 }}>
            {PLATFORM_NAVIGATION.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.path)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    textAlign: "left",
                    padding: "0.75rem",
                    borderRadius: 8,
                    border: active ? "1px solid rgba(16,185,129,.38)" : "1px solid transparent",
                    background: active ? "rgba(16,185,129,.12)" : "transparent",
                    color: active ? "#6ee7b7" : "#cbd5e1",
                    fontSize: 13,
                    fontWeight: active ? 800 : 600,
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div
            style={{
              marginTop: "1.25rem",
              padding: "0.8rem",
              borderRadius: 8,
              border: "1px solid rgba(245,158,11,.25)",
              background: "rgba(245,158,11,.06)",
              color: "#cbd5e1",
              fontSize: 11,
              lineHeight: 1.55,
            }}
          >
            Platform controls are isolated from tenant sales, inventory, cash drawers, and business dashboards. Open a tenant workspace only through the authorized platform inspection workflow.
          </div>
        </aside>

        <main id="platform-app-root" role="main" style={{ minWidth: 0, padding: "1.25rem", background: "#0b1324" }}>
          {children}
        </main>
      </div>
      <footer style={{ padding: "0.65rem 1.25rem", borderTop: "1px solid #29364b", color: "#64748b", fontSize: 11 }}>
        Kwakoko Platform Control Tower · Platform administration is separate from tenant operations
      </footer>
    </div>
  );
};
