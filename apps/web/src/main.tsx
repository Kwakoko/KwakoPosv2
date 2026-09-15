import "./styles.css";
import "./atomicOutbox.js";
import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { fontPersistenceEngine } from "./persistence/fontPersistenceEngine.js";

// Enforce and persist system-wide typography adopted from legacy app
fontPersistenceEngine.initialize();

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[KwakoPos UI RootErrorBoundary caught exception]:", error, errorInfo);
  }

  private handleRecovery = async (clearStorage = false) => {
    try {
      if (clearStorage) {
        sessionStorage.clear();
        localStorage.removeItem("kwakopos_auth_token");
        localStorage.removeItem("kwakopos_user");
        localStorage.removeItem("kwakopos_tenant_id");
      }
      if (typeof window !== "undefined" && "caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // ignore recovery cleanup errors
    }
    const cleanUrl = window.location.origin + window.location.pathname + "?_r=" + Date.now();
    window.location.replace(cleanUrl);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem", background: "#0f172a", color: "#f8fafc", fontFamily: "var(--font-sans, 'Inter', sans-serif)" }}>
          <div style={{ maxWidth: 540, width: "100%", background: "#1e293b", border: "1px solid #f87171", borderRadius: "0.75rem", padding: "1.5rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)" }}>
            <div style={{ color: "#f87171", fontSize: "1.15rem", fontWeight: 800, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>⚠️ Workspace Render Exception</span>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.88rem", marginBottom: "1rem", lineHeight: 1.5 }}>
              An unexpected error prevented the KwakoPos v2 React workspace interface from initializing.
            </p>
            <div style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid rgba(248, 113, 113, 0.25)", borderRadius: "0.5rem", padding: "0.85rem", fontSize: "0.82rem", color: "#f87171", fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", overflowX: "auto", marginBottom: "1.25rem" }}>
              {this.state.error?.message || "Unknown rendering exception"}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                style={{ background: "#38bdf8", color: "#082f49", border: 0, borderRadius: "0.45rem", padding: "0.6rem 1rem", fontWeight: 800, cursor: "pointer" }}
                onClick={() => void this.handleRecovery(false)}
              >
                🔄 Reload Workspace
              </button>
              <button
                style={{ background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: "0.45rem", padding: "0.6rem 1rem", fontWeight: 700, cursor: "pointer" }}
                onClick={() => void this.handleRecovery(true)}
              >
                🧹 Clear Session & Reload
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("KwakoPosv2 React root element #root is missing");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);