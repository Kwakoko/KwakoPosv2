/**
 * KwakoPosv2 — System UI Reusable Empty State Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides semantic, domain-tailored zero-data placeholders across 9 variants
 * with action CTA hooks, respecting V2 design tokens and dark/light themes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from "react";
import {
  Search,
  Package,
  Users,
  WifiOff,
  Lock,
  FolderOpen,
  ShoppingCart,
  BarChart3,
  Building,
} from "lucide-react";

export type EmptyVariant =
  | "no-data"
  | "no-results"
  | "offline"
  | "locked"
  | "no-products"
  | "no-customers"
  | "no-orders"
  | "no-reports"
  | "no-tenants";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  style?: React.CSSProperties;
}

const VARIANTS: Record<
  EmptyVariant,
  {
    icon: React.ReactNode;
    iconBg: string;
    iconBorder: string;
    defaultTitle: string;
    defaultDescription: string;
  }
> = {
  "no-data": {
    icon: <FolderOpen size={28} style={{ color: "var(--muted, #94a3b8)" }} />,
    iconBg: "var(--surface-2, #243047)",
    iconBorder: "var(--surface-border, #334155)",
    defaultTitle: "Nothing here yet",
    defaultDescription: "Add your first record or start an operation to populate this workspace.",
  },
  "no-results": {
    icon: <Search size={28} style={{ color: "var(--accent, #38bdf8)" }} />,
    iconBg: "var(--accent-muted, rgba(56,189,248,0.12))",
    iconBorder: "rgba(56,189,248,0.25)",
    defaultTitle: "No results found",
    defaultDescription: "Try adjusting your query, keywords, or filters to find what you are looking for.",
  },
  offline: {
    icon: <WifiOff size={28} style={{ color: "var(--warning, #fbbf24)" }} />,
    iconBg: "var(--warning-muted, rgba(251,191,36,0.12))",
    iconBorder: "rgba(251,191,36,0.25)",
    defaultTitle: "You're working offline",
    defaultDescription: "Local cache is operating. Changes will automatically sync when connection returns.",
  },
  locked: {
    icon: <Lock size={28} style={{ color: "var(--danger, #f87171)" }} />,
    iconBg: "var(--danger-muted, rgba(248,113,113,0.12))",
    iconBorder: "rgba(248,113,113,0.25)",
    defaultTitle: "Access restricted",
    defaultDescription: "Your user role lacks permission to view or execute operations in this section.",
  },
  "no-products": {
    icon: <Package size={28} style={{ color: "var(--accent, #38bdf8)" }} />,
    iconBg: "var(--accent-muted, rgba(56,189,248,0.12))",
    iconBorder: "rgba(56,189,248,0.25)",
    defaultTitle: "No products in inventory",
    defaultDescription: "Start building your catalog by adding products, stock batches, and barcodes.",
  },
  "no-customers": {
    icon: <Users size={28} style={{ color: "var(--info, #818cf8)" }} />,
    iconBg: "var(--info-muted, rgba(129,140,248,0.12))",
    iconBorder: "rgba(129,140,248,0.25)",
    defaultTitle: "No customers registered",
    defaultDescription: "Customer profiles and purchase credit histories will appear here as transactions occur.",
  },
  "no-orders": {
    icon: <ShoppingCart size={28} style={{ color: "var(--success, #4ade80)" }} />,
    iconBg: "var(--success-muted, rgba(74,222,128,0.12))",
    iconBorder: "rgba(74,222,128,0.25)",
    defaultTitle: "No sales recorded yet",
    defaultDescription: "Process sales from the POS terminal to generate receipts and transaction records.",
  },
  "no-reports": {
    icon: <BarChart3 size={28} style={{ color: "var(--accent, #38bdf8)" }} />,
    iconBg: "var(--accent-muted, rgba(56,189,248,0.12))",
    iconBorder: "rgba(56,189,248,0.25)",
    defaultTitle: "No report telemetry available",
    defaultDescription: "BI insights, turnover analytics, and fiscal metrics will generate once data flows.",
  },
  "no-tenants": {
    icon: <Building size={28} style={{ color: "var(--accent, #38bdf8)" }} />,
    iconBg: "var(--accent-muted, rgba(56,189,248,0.12))",
    iconBorder: "rgba(56,189,248,0.25)",
    defaultTitle: "No tenant accounts found",
    defaultDescription: "Onboard new businesses and organization branches to manage them from this platform.",
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = "no-data",
  title,
  description,
  action,
  secondaryAction,
  className = "",
  style,
}) => {
  const cfg = VARIANTS[variant] || VARIANTS["no-data"];

  return (
    <div
      className={`v2-flex v2-flex-col v2-items-center v2-justify-center ${className}`}
      style={{
        padding: "3.5rem 1.5rem",
        textAlign: "center",
        ...style,
      }}
    >
      {/* Icon badge */}
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "var(--radius-xl, 1.2rem)",
          background: cfg.iconBg,
          border: `1px solid ${cfg.iconBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.2rem",
          boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.4))",
        }}
      >
        {cfg.icon}
      </div>

      {/* Title */}
      <h3
        style={{
          margin: 0,
          fontSize: "0.95rem",
          fontWeight: 800,
          color: "var(--text, #f8fafc)",
          letterSpacing: "-0.01em",
        }}
      >
        {title || cfg.defaultTitle}
      </h3>

      {/* Description */}
      <p
        style={{
          margin: "0.45rem 0 0 0",
          fontSize: "0.82rem",
          color: "var(--muted, #94a3b8)",
          maxWidth: "380px",
          lineHeight: 1.5,
        }}
      >
        {description || cfg.defaultDescription}
      </p>

      {/* Action buttons */}
      {(action || secondaryAction) && (
        <div
          style={{
            marginTop: "1.4rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {action && (
            <button
              type="button"
              aria-label={action.label}
              onClick={action.onClick}
              className="v2-btn v2-btn-primary"
              style={{
                fontSize: "0.82rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 1.1rem",
              }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          )}

          {secondaryAction && (
            <button
              type="button"
              aria-label={secondaryAction.label}
              onClick={secondaryAction.onClick}
              className="v2-btn v2-btn-ghost"
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                padding: "0.5rem 1rem",
              }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
