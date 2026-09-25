import React, { useState, useEffect, useRef, useCallback } from "react";
import { Minus, Plus } from "lucide-react";

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  width?: string | number;
}

export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  size = "xs",
  className = "",
  style,
  disabled = false,
  placeholder,
  ariaLabel,
  width,
}) => {
  const [localStr, setLocalStr] = useState<string>(String(value ?? 0));
  const [isFocused, setIsFocused] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external value when not directly editing
  useEffect(() => {
    if (!isFocused) {
      setLocalStr(String(value ?? 0));
    }
  }, [value, isFocused]);

  const clamp = useCallback(
    (val: number) => {
      let res = val;
      if (min !== undefined && res < min) res = min;
      if (max !== undefined && res > max) res = max;
      return res;
    },
    [min, max]
  );

  const applyChange = useCallback(
    (delta: number) => {
      if (disabled) return;
      const current = Number(localStr) || 0;
      const next = clamp(current + delta);
      onChange(next);
      setLocalStr(String(next));
    },
    [disabled, localStr, clamp, onChange]
  );

  const stopHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const startHold = useCallback(
    (delta: number) => {
      if (disabled) return;
      applyChange(delta);
      stopHold();

      holdTimerRef.current = setTimeout(() => {
        holdIntervalRef.current = setInterval(() => {
          applyChange(delta);
        }, 75);
      }, 300);
    },
    [disabled, applyChange, stopHold]
  );

  useEffect(() => {
    return () => stopHold();
  }, [stopHold]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalStr(raw);
    if (raw !== "" && !isNaN(Number(raw))) {
      onChange(clamp(Number(raw)));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (localStr === "" || isNaN(Number(localStr))) {
      const fallback = min !== undefined ? min : 0;
      setLocalStr(String(fallback));
      onChange(fallback);
    } else {
      const clamped = clamp(Number(localStr));
      setLocalStr(String(clamped));
      onChange(clamped);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyChange(step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      applyChange(-step);
    } else if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const isAtMin = min !== undefined && (Number(localStr) || 0) <= min;
  const isAtMax = max !== undefined && (Number(localStr) || 0) >= max;

  const iconSize = size === "xs" ? 10 : size === "sm" ? 12 : 14;

  return (
    <div
      className={`v2-number-stepper v2-number-stepper-${size} ${isFocused ? "is-focused" : ""} ${className}`}
      style={{ width: width ?? (size === "xs" ? "88px" : size === "sm" ? "104px" : "120px"), ...style }}
    >
      <button
        type="button"
        className="v2-number-stepper-btn v2-number-stepper-dec"
        aria-label={`Decrease ${ariaLabel || "value"}`}
        tabIndex={-1}
        disabled={disabled || isAtMin}
        onMouseDown={() => startHold(-step)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(-step)}
        onTouchEnd={stopHold}
      >
        <Minus size={iconSize} />
      </button>

      <input
        type="number"
        className="v2-number-stepper-input v2-mono"
        value={localStr}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
      />

      <button
        type="button"
        className="v2-number-stepper-btn v2-number-stepper-inc"
        aria-label={`Increase ${ariaLabel || "value"}`}
        tabIndex={-1}
        disabled={disabled || isAtMax}
        onMouseDown={() => startHold(step)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(step)}
        onTouchEnd={stopHold}
      >
        <Plus size={iconSize} />
      </button>
    </div>
  );
};
