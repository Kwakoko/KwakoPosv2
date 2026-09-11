/**
 * KwakoPosv2 — React Production Error Boundary
 * ─────────────────────────────────────────────────────────────────────────────
 * Catches unhandled UI rendering exceptions, provides secure support tracking
 * correlation IDs, auto-heals dynamic chunk load failures with cache clear,
 * and presents a resilient, styled recovery screen matching V2 tokens.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Shield, Home } from "lucide-react";

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Loading chunk") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}

export function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `corr-v2-${ts}-${rand}`;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string;
  errorMessage?: string;
}

export class ProductionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorId: "",
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorId: generateCorrelationId(),
      errorMessage: error?.message,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ProductionErrorBoundary] Unhandled UI Exception caught. Correlation ID: ${this.state.errorId}`,
      error,
      errorInfo,
    );

    // Auto-heal dynamic chunk load errors via controlled reload
    if (isChunkLoadError(error) && typeof window !== "undefined") {
      const attempts = parseInt(sessionStorage.getItem("kwakopos_chunk_reload_attempts") || "0", 10);
      if (attempts < 2) {
        sessionStorage.setItem("kwakopos_chunk_reload_attempts", String(attempts + 1));
        console.info(
          "[ProductionErrorBoundary] Auto-healing dynamic module import failure via page reload...",
        );
        if ("caches" in window) {
          caches
            .keys()
            .then((keys) => keys.forEach((k) => caches.delete(k)))
            .catch(() => {});
        }
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("kwakopos_chunk_reload_attempts");
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => keys.forEach((k) => caches.delete(k)))
          .catch(() => {});
      }
      window.location.reload();
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, errorId: "", errorMessage: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            minHeight: "50vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem 1rem",
          }}
        >
          <div
            className="v2-card"
            style={{
              maxWidth: "460px",
              width: "100%",
              padding: "1.75rem",
              borderRadius: "var(--radius-xl, 1.2rem)",
              boxShadow: "var(--shadow-xl, 0 20px 50px rgba(0,0,0,0.6))",
              border: "1px solid var(--surface-border, #334155)",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "var(--radius-lg, 0.85rem)",
                background: "var(--warning-muted, rgba(251,191,36,0.12))",
                border: "1px solid rgba(251,191,36,0.25)",
                color: "var(--warning, #fbbf24)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={24} />
            </div>

            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 900,
                  color: "var(--text, #f8fafc)",
                  letterSpacing: "-0.01em",
                }}
              >
                Interface Exception Recovered
              </h2>
              <p
                style={{
                  margin: "0.5rem 0 0 0",
                  fontSize: "0.82rem",
                  color: "var(--muted, #94a3b8)",
                  lineHeight: 1.5,
                }}
              >
                KwakoPos safely isolated an interface error and protected your local storage state.
                You can retry rendering or reload the current workspace.
              </p>
            </div>

            {/* Tracking Reference Bar */}
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md, 0.55rem)",
                background: "var(--surface-2, #243047)",
                border: "1px solid var(--surface-border-subtle, #243047)",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: "var(--muted, #94a3b8)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Shield size={13} style={{ color: "var(--accent, #38bdf8)" }} />
                Support Tracking Reference
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "var(--accent, #38bdf8)",
                  userSelect: "all",
                }}
              >
                {this.state.errorId || "corr-prod-system-active"}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <button
                type="button"
                onClick={this.handleReset}
                className="v2-btn v2-btn-primary"
                style={{
                  flex: 1,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  padding: "0.6rem 1rem",
                }}
              >
                <RefreshCw size={15} />
                <span>Retry Interface</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="v2-btn v2-btn-ghost"
                style={{
                  flex: 1,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  padding: "0.6rem 1rem",
                }}
              >
                <Home size={15} />
                <span>Reload Page</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ProductionErrorBoundary;
