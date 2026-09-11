/**
 * KwakoPosv2 — System UI 2-Second Hold-to-Confirm Button
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive safety button requiring a continuous 2-second press-and-hold
 * to trigger destructive operations (such as database and store purges).
 * Cancels immediately if released early. Provides visual animated fill feedback.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

export interface HoldToConfirmButtonProps {
  onConfirm: () => void | Promise<void>;
  holdDurationMs?: number;
  label?: string;
  holdingLabel?: string;
  completedLabel?: string;
  variant?: "danger" | "warning" | "primary";
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const HoldToConfirmButton: React.FC<HoldToConfirmButtonProps> = ({
  onConfirm,
  holdDurationMs = 2000,
  label = "Hold 2s to Execute",
  holdingLabel = "Keep holding...",
  completedLabel = "Action Completed",
  variant = "danger",
  disabled = false,
  className = "",
  style,
}) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const cancelHold = useCallback(() => {
    if (isExecuting || isDone) return;
    setIsHolding(false);
    startTimeRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setProgress(0);
  }, [isExecuting, isDone]);

  const completeHold = useCallback(async () => {
    setIsHolding(false);
    setProgress(100);
    setIsExecuting(true);
    try {
      await onConfirm();
      setIsDone(true);
      setTimeout(() => {
        setIsDone(false);
        setProgress(0);
        setIsExecuting(false);
      }, 3000);
    } catch (err) {
      console.error("[HoldToConfirmButton] Action execution failed:", err);
      setIsExecuting(false);
      setProgress(0);
    }
  }, [onConfirm]);

  const step = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const currentProgress = Math.min(100, (elapsed / holdDurationMs) * 100);
    setProgress(currentProgress);

    if (currentProgress >= 100) {
      completeHold();
    } else {
      animFrameRef.current = requestAnimationFrame(step);
    }
  }, [holdDurationMs, completeHold]);

  const startHold = useCallback(
    (e: React.SyntheticEvent) => {
      if (disabled || isExecuting || isDone) return;
      // Prevent default context menu on long-press mobile
      if ("preventDefault" in e && typeof e.preventDefault === "function") {
        // do not prevent default on mouse down to keep focus
      }
      setIsHolding(true);
      startTimeRef.current = Date.now();
      animFrameRef.current = requestAnimationFrame(step);
    },
    [disabled, isExecuting, isDone, step],
  );

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        if (!isHolding && !isExecuting && !isDone && !disabled && !e.repeat) {
          e.preventDefault();
          startHold(e);
        }
      }
    },
    [isHolding, isExecuting, isDone, disabled, startHold],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        cancelHold();
      }
    },
    [cancelHold],
  );

  const variantColors = {
    danger: {
      bg: "rgba(248, 113, 113, 0.12)",
      border: "rgba(248, 113, 113, 0.35)",
      text: "var(--danger, #f87171)",
      fill: "var(--danger, #f87171)",
    },
    warning: {
      bg: "rgba(251, 191, 36, 0.12)",
      border: "rgba(251, 191, 36, 0.35)",
      text: "var(--warning, #fbbf24)",
      fill: "var(--warning, #fbbf24)",
    },
    primary: {
      bg: "rgba(56, 189, 248, 0.12)",
      border: "rgba(56, 189, 248, 0.35)",
      text: "var(--accent, #38bdf8)",
      fill: "var(--accent, #38bdf8)",
    },
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled || isExecuting}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`v2-btn ${className}`}
      aria-label={label}
      aria-busy={isExecuting}
      aria-live={isHolding || isExecuting ? "assertive" : "off"}
      style={{
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${variantColors.border}`,
        background: variantColors.bg,
        color: isHolding || progress > 50 ? "#ffffff" : variantColors.text,
        fontSize: "0.8rem",
        fontWeight: 800,
        padding: "0.55rem 1.1rem",
        borderRadius: "var(--radius-md, 0.55rem)",
        userSelect: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.45rem",
        minWidth: "190px",
        transition: "color var(--transition-fast, 120ms ease), border var(--transition-fast, 120ms ease)",
        ...style,
      }}
    >
      {/* Animated progress fill bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: `${progress}%`,
          background: variantColors.fill,
          transition: isHolding ? "none" : "width 200ms ease-out",
          opacity: 0.9,
          zIndex: 0,
        }}
      />

      {/* Button content (layered above fill) */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
        }}
      >
        {isExecuting ? (
          <>
            <Loader2 size={14} className="v2-spin" />
            <span>Purging...</span>
          </>
        ) : isDone ? (
          <>
            <Check size={14} />
            <span>{completedLabel}</span>
          </>
        ) : isHolding ? (
          <>
            <AlertTriangle size={14} />
            <span>{holdingLabel} ({Math.round(progress)}%)</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} />
            <span>{label}</span>
          </>
        )}
      </div>
    </button>
  );
};

export default HoldToConfirmButton;
