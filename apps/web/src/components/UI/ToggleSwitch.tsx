/**
 * KwakoPosv2 — Accessible High-Affordance Toggle Switch Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides an accessible, tactile toggle switch with smooth animated state transitions,
 * glowing emerald active styling, and WCAG switch role semantics.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from "react";

export interface ToggleSwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  id,
  checked,
  onChange,
  label,
  disabled = false,
  size = "md",
  className = "",
}) => {
  const dimensions = {
    sm: { width: 38, height: 20, thumb: 16, translate: 18, pad: 2 },
    md: { width: 48, height: 26, thumb: 20, translate: 22, pad: 3 },
    lg: { width: 58, height: 32, thumb: 26, translate: 26, pad: 3 },
  }[size];

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || "Toggle Switch"}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`v2-toggle-switch ${className}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        borderRadius: "9999px",
        background: checked
          ? "var(--success, #10b981)"
          : "rgba(100, 116, 139, 0.4)",
        border: checked
          ? "1px solid #059669"
          : "1px solid rgba(148, 163, 184, 0.3)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        padding: 0,
        outline: "none",
        boxShadow: checked ? "0 0 12px rgba(16, 185, 129, 0.35)" : "none",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          display: "block",
          width: `${dimensions.thumb}px`,
          height: `${dimensions.thumb}px`,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 2px 5px rgba(0, 0, 0, 0.3)",
          transform: checked
            ? `translateX(${dimensions.translate}px)`
            : `translateX(${dimensions.pad}px)`,
          transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </button>
  );
};
