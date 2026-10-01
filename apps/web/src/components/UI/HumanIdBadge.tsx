/**
 * KwakoPosv2 — HumanIdBadge Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive badge adhering to the Dual-Key presentation pattern.
 * Displays concise, human-friendly identifiers (e.g. USR-C0B5A9, bravados-pub,
 * BP-MAINBR, OWNER) while preserving 1-click clipboard copying of the underlying
 * authoritative 36-character UUIDv4.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { formatShortId, formatTenantCode, formatBranchCode, formatRoleName } from "../../utils/idFormatters.js";

export interface HumanIdBadgeProps {
  /** The underlying authoritative UUID or raw identifier */
  fullId?: string | null;
  /** Optional custom display code (e.g. slug or branch code) */
  displayCode?: string;
  /** Identifier prefix (e.g. "USR", "TNT", "BR", "ROL", "SES", "EVT", "TXN") */
  prefix?: "USR" | "TNT" | "BR" | "ROL" | "SES" | "EVT" | "TXN" | string;
  /** Optional label prefix shown before the badge (e.g. "Tenant", "Branch", "User ID") */
  label?: string;
  /** Size variant */
  size?: "xs" | "sm" | "md";
  /** Color theme variant */
  variant?: "default" | "tenant" | "branch" | "user" | "role" | "muted";
  /** Whether clicking the badge copies the full ID (defaults to true) */
  copyable?: boolean;
  /** Optional CSS class name */
  className?: string;
  /** Optional inline style override */
  style?: React.CSSProperties;
}

const VARIANT_STYLES: Record<
  NonNullable<HumanIdBadgeProps["variant"]>,
  { bg: string; border: string; text: string }
> = {
  default: {
    bg: "var(--surface-2, rgba(255, 255, 255, 0.06))",
    border: "var(--surface-border, rgba(255, 255, 255, 0.12))",
    text: "inherit",
  },
  tenant: {
    bg: "rgba(59, 130, 246, 0.10)",
    border: "rgba(59, 130, 246, 0.28)",
    text: "#60a5fa",
  },
  branch: {
    bg: "rgba(16, 185, 129, 0.10)",
    border: "rgba(16, 185, 129, 0.28)",
    text: "#34d399",
  },
  user: {
    bg: "rgba(139, 92, 246, 0.10)",
    border: "rgba(139, 92, 246, 0.28)",
    text: "#a78bfa",
  },
  role: {
    bg: "rgba(245, 158, 11, 0.10)",
    border: "rgba(245, 158, 11, 0.28)",
    text: "#fbbf24",
  },
  muted: {
    bg: "var(--surface-2, rgba(0, 0, 0, 0.05))",
    border: "var(--surface-border, rgba(0, 0, 0, 0.1))",
    text: "var(--muted, #888)",
  },
};

const SIZE_STYLES: Record<
  NonNullable<HumanIdBadgeProps["size"]>,
  { fontSize: string; padding: string; iconSize: number; gap: string }
> = {
  xs: {
    fontSize: "0.68rem",
    padding: "0.1rem 0.35rem",
    iconSize: 10,
    gap: "0.25rem",
  },
  sm: {
    fontSize: "0.74rem",
    padding: "0.15rem 0.45rem",
    iconSize: 11,
    gap: "0.3rem",
  },
  md: {
    fontSize: "0.82rem",
    padding: "0.25rem 0.6rem",
    iconSize: 13,
    gap: "0.35rem",
  },
};

export const HumanIdBadge: React.FC<HumanIdBadgeProps> = ({
  fullId,
  displayCode,
  prefix,
  label,
  size = "sm",
  variant = "default",
  copyable = true,
  className = "",
  style,
}) => {
  const [copied, setCopied] = useState(false);

  if (!fullId) return null;

  const resolvedDisplay = displayCode || formatShortId(fullId, prefix);
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.default;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.sm;

  const handleCopy = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!copyable || !fullId) return;

      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(fullId);
        } else {
          // Fallback for older browsers
          const textarea = document.createElement("textarea");
          textarea.value = fullId;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch (err) {
        console.warn("[HumanIdBadge] Copy to clipboard deferred:", err);
      }
    },
    [copyable, fullId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        handleCopy(e);
      }
    },
    [handleCopy]
  );

  const tooltipTitle = fullId
    ? `${label ? `${label}: ` : ""}Full ID: ${fullId} (Click to copy)`
    : undefined;

  return (
    <span
      className={`human-id-badge ${className}`}
      role={copyable ? "button" : undefined}
      tabIndex={copyable ? 0 : undefined}
      onClick={copyable ? handleCopy : undefined}
      onKeyDown={copyable ? handleKeyDown : undefined}
      title={tooltipTitle}
      aria-label={tooltipTitle || resolvedDisplay}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sizeStyle.gap,
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        fontFamily: "var(--font-mono, 'SF Mono', Consolas, monospace)",
        fontWeight: 600,
        lineHeight: 1.2,
        borderRadius: "4px",
        background: copied ? "rgba(16, 185, 129, 0.15)" : variantStyle.bg,
        border: `1px solid ${copied ? "rgba(16, 185, 129, 0.4)" : variantStyle.border}`,
        color: copied ? "var(--success, #10b981)" : variantStyle.text,
        cursor: copyable ? "pointer" : "default",
        userSelect: "none",
        transition: "all 0.15s ease",
        verticalAlign: "middle",
        ...style,
      }}
    >
      {label && (
        <span
          style={{
            fontWeight: 500,
            opacity: 0.75,
            marginRight: "0.15rem",
            fontSize: "0.9em",
            fontFamily: "inherit",
          }}
        >
          {label}:
        </span>
      )}
      <span style={{ letterSpacing: "-0.01em" }}>
        {copied ? "Copied!" : resolvedDisplay}
      </span>
      {copyable && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            opacity: copied ? 1 : 0.65,
            transition: "opacity 0.15s ease",
          }}
        >
          {copied ? (
            <Check size={sizeStyle.iconSize} aria-hidden="true" />
          ) : (
            <Copy size={sizeStyle.iconSize} aria-hidden="true" />
          )}
        </span>
      )}
    </span>
  );
};
