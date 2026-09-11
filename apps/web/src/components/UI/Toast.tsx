/**
 * KwakoPosv2 — System UI Toast & Async Confirm Dialog System
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides global toast notifications (success, error, warning, info) with
 * animated progress bar dismiss, plus an asynchronous confirm() modal dialog
 * returning a Promise<boolean> that respects V2 semantic design tokens.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
}

export interface ToastContextValue {
  success: (title: string, message?: string, duration?: number) => void;
  error: (title: string, message?: string, duration?: number) => void;
  warning: (title: string, message?: string, duration?: number) => void;
  info: (title: string, message?: string, duration?: number) => void;
  showToast: (options: { type?: ToastVariant; title?: string; message: string; duration?: number }) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  let ctx: ToastContextValue | null = null;
  try {
    const dispatcher =
      (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
        ?.ReactCurrentDispatcher?.current;
    if (dispatcher) {
      ctx = useContext(ToastContext);
    }
  } catch {
    ctx = null;
  }
  if (!ctx) {
    // Fallback stub if called outside provider during headless tests
    return {
      success: (t, m) => console.log(`[Toast:success] ${t}: ${m || ""}`),
      error: (t, m) => console.error(`[Toast:error] ${t}: ${m || ""}`),
      warning: (t, m) => console.warn(`[Toast:warning] ${t}: ${m || ""}`),
      info: (t, m) => console.info(`[Toast:info] ${t}: ${m || ""}`),
      showToast: (opts) => {
        const fn = opts.type === "error" ? console.error : opts.type === "warning" ? console.warn : console.log;
        fn(`[Toast:${opts.type || "info"}] ${opts.title || ""}: ${opts.message}`);
      },
      confirm: async () => true,
    };
  }
  return ctx;
};

// ─── Toast Item ──────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    icon: React.ReactNode;
    color: string;
    borderColor: string;
    bgMuted: string;
    barColor: string;
  }
> = {
  success: {
    icon: <CheckCircle2 size={18} className="v2-text-success" aria-hidden="true" />,
    color: "var(--success, #4ade80)",
    borderColor: "rgba(74, 222, 128, 0.35)",
    bgMuted: "rgba(74, 222, 128, 0.08)",
    barColor: "var(--success, #4ade80)",
  },
  error: {
    icon: <XCircle size={18} className="v2-text-danger" aria-hidden="true" />,
    color: "var(--danger, #f87171)",
    borderColor: "rgba(248, 113, 113, 0.35)",
    bgMuted: "rgba(248, 113, 113, 0.08)",
    barColor: "var(--danger, #f87171)",
  },
  warning: {
    icon: <AlertTriangle size={18} className="v2-text-warning" aria-hidden="true" />,
    color: "var(--warning, #fbbf24)",
    borderColor: "rgba(251, 191, 36, 0.35)",
    bgMuted: "rgba(251, 191, 36, 0.08)",
    barColor: "var(--warning, #fbbf24)",
  },
  info: {
    icon: <Info size={18} className="v2-text-accent" aria-hidden="true" />,
    color: "var(--accent, #38bdf8)",
    borderColor: "rgba(56, 189, 248, 0.35)",
    bgMuted: "rgba(56, 189, 248, 0.08)",
    barColor: "var(--accent, #38bdf8)",
  },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const cfg = VARIANT_CONFIG[toast.variant];
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const anim = requestAnimationFrame(() => setVisible(true));
    const step = 100 / (toast.duration / 50);
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p - step <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          handleDismiss();
          return 0;
        }
        return p - step;
      });
    }, 50);

    return () => {
      cancelAnimationFrame(anim);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [toast.duration]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 250);
  }, [onDismiss, toast.id]);

  return (
    <div
      role="alert"
      style={{
        position: "relative",
        overflow: "hidden",
        width: "340px",
        maxWidth: "calc(100vw - 2rem)",
        background: "var(--surface, #1e293b)",
        borderRadius: "var(--radius-lg, 0.85rem)",
        border: `1px solid ${cfg.borderColor}`,
        boxShadow: "var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.5))",
        transition: "all var(--transition-base, 200ms ease)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(30px)",
        pointerEvents: "auto",
        marginBottom: "0.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          padding: "0.85rem 1rem 0.85rem 0.85rem",
        }}
      >
        <div style={{ marginTop: "2px", flexShrink: 0 }}>{cfg.icon}</div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: "1.25rem" }}>
          <div
            style={{
              fontSize: "0.82rem",
              fontWeight: 800,
              color: cfg.color,
              lineHeight: 1.3,
            }}
          >
            {toast.title}
          </div>
          {toast.message && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-secondary, #cbd5e1)",
                marginTop: "0.2rem",
                lineHeight: 1.4,
              }}
            >
              {toast.message}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleDismiss}
        aria-label="Dismiss toast"
        type="button"
        style={{
          position: "absolute",
          top: "0.5rem",
          right: "0.5rem",
          background: "transparent",
          border: "none",
          color: "var(--muted, #94a3b8)",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--radius-sm, 4px)",
        }}
      >
        <X size={14} />
      </button>

      {/* Auto-dismiss progress bar */}
      <div
        style={{
          height: "3px",
          width: "100%",
          background: "var(--surface-border, #334155)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: cfg.barColor,
            transition: "width 50ms linear",
          }}
        />
      </div>
    </div>
  );
};

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmDialogRenderer: React.FC<{
  state: ConfirmState | null;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state) {
      const anim = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(anim);
    }
    setVisible(false);
  }, [state]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state) {
        state.resolve(false);
        onClose();
      }
      if (e.key === "Enter" && state) {
        state.resolve(true);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, onClose]);

  if (!state) return null;

  const variant = state.variant || "danger";
  const btnColor =
    variant === "danger"
      ? "var(--danger, #f87171)"
      : variant === "warning"
      ? "var(--warning, #fbbf24)"
      : "var(--accent, #38bdf8)";

  const accentGradient =
    variant === "danger"
      ? "var(--gradient-danger, linear-gradient(135deg, #ef4444 0%, #f87171 100%))"
      : variant === "warning"
      ? "var(--gradient-warning, linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%))"
      : "var(--gradient-accent, linear-gradient(135deg, #38bdf8 0%, #818cf8 100%))";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        transition: "opacity var(--transition-base, 200ms ease)",
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={() => {
          state.resolve(false);
          onClose();
        }}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Dialog box */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "420px",
          borderRadius: "var(--radius-xl, 1.2rem)",
          background: "var(--surface, #1e293b)",
          border: "1px solid var(--surface-border, #334155)",
          boxShadow: "var(--shadow-xl, 0 20px 50px rgba(0,0,0,0.6))",
          overflow: "hidden",
          transition: "transform var(--transition-base, 200ms ease)",
          transform: visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(10px)",
        }}
      >
        {/* Top accent line */}
        <div style={{ height: "4px", width: "100%", background: accentGradient }} />

        <div style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
            <AlertTriangle size={20} style={{ color: btnColor, flexShrink: 0 }} />
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 900,
                color: "var(--text, #f8fafc)",
              }}
            >
              {state.title}
            </h3>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: "0.83rem",
              color: "var(--text-secondary, #cbd5e1)",
              lineHeight: 1.5,
            }}
          >
            {state.message}
          </p>

          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.6rem",
            }}
          >
            <button
              type="button"
              autoFocus
              onClick={() => {
                state.resolve(false);
                onClose();
              }}
              className="v2-btn v2-btn-ghost"
              style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem" }}
            >
              {state.cancelLabel || "Cancel"}
            </button>
            <button
              type="button"
              onClick={() => {
                state.resolve(true);
                onClose();
              }}
              className="v2-btn"
              style={{
                background: btnColor,
                color: "#ffffff",
                fontSize: "0.8rem",
                fontWeight: 800,
                padding: "0.45rem 1rem",
                border: "none",
              }}
            >
              {state.confirmLabel || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const addToast = useCallback(
    (variant: ToastVariant, title: string, message?: string, duration = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, variant, title, message, duration }]);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const ctx: ToastContextValue = {
    success: (title, msg, dur) => addToast("success", title, msg, dur),
    error: (title, msg, dur) => addToast("error", title, msg, dur),
    warning: (title, msg, dur) => addToast("warning", title, msg, dur),
    info: (title, msg, dur) => addToast("info", title, msg, dur),
    showToast: ({ type = "info", title, message, duration }) =>
      addToast(type, title || (type.charAt(0).toUpperCase() + type.slice(1)), message, duration),
    confirm,
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast Notification Stack (bottom-right) */}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: "1rem",
          right: "1rem",
          zIndex: 450,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialogRenderer state={confirmState} onClose={() => setConfirmState(null)} />
    </ToastContext.Provider>
  );
};

export default ToastProvider;
