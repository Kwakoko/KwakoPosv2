/**
 * KwakoPos v2 — Language Selector Dropdown Component
 *
 * Provides a clean, accessible interface allowing users to switch between
 * English, Français, and Kiswahili instantly anywhere in the application.
 */

import React, { useEffect, useRef, useState } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useTranslation } from "../i18n/I18nContext.js";
import { type SupportedLocale } from "../i18n/types.js";

export interface LanguageSelectorProps {
  variant?: "topbar" | "full" | "minimal";
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = "topbar",
  className = "",
}) => {
  const { locale, setLocale, availableLocales, localeInfo } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (code: SupportedLocale) => {
    setLocale(code);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`language-selector-container ${className}`}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        className={
          variant === "topbar"
            ? "topbar-icon-btn"
            : variant === "minimal"
            ? "v2-btn v2-btn-ghost v2-btn-sm"
            : "v2-btn v2-btn-secondary v2-btn-sm"
        }
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Select Language (Current: ${localeInfo.nativeName})`}
        title={`Change Language: ${localeInfo.nativeName}`}
        style={
          variant === "topbar"
            ? { display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.4rem 0.5rem" }
            : { display: "inline-flex", alignItems: "center", gap: "0.4rem" }
        }
      >
        <Globe size={16} aria-hidden="true" />
        {variant !== "topbar" && (
          <>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{localeInfo.nativeName}</span>
            <ChevronDown size={12} aria-hidden="true" style={{ opacity: 0.7 }} />
          </>
        )}
        {variant === "topbar" && (
          <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>
            {locale}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="dropdown-panel"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            minWidth: 190,
            zIndex: 9999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "0.4rem",
            backgroundColor: "var(--surface, #ffffff)",
            border: "1px solid var(--surface-border, #e2e8f0)",
          }}
          role="menu"
          aria-label="Languages"
        >
          <div
            style={{
              padding: "0.3rem 0.6rem 0.4rem",
              fontSize: "0.7rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted, #64748b)",
              borderBottom: "1px solid var(--surface-border, #e2e8f0)",
              marginBottom: "0.25rem",
            }}
          >
            Select Language
          </div>

          {availableLocales.map((item) => {
            const isSelected = locale === item.code;
            return (
              <button
                key={item.code}
                type="button"
                className={`dropdown-item ${isSelected ? "active" : ""}`}
                onClick={() => handleSelect(item.code)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.6rem",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius-sm, 6px)",
                  background: isSelected ? "var(--accent-muted, rgba(99, 102, 241, 0.1))" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: isSelected ? "var(--accent, #4f46e5)" : "var(--text, #1e293b)",
                  textAlign: "left",
                }}
                role="menuitem"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>{item.flag}</span>
                  <div>
                    <div style={{ fontWeight: isSelected ? 700 : 500 }}>{item.nativeName}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted, #64748b)" }}>{item.name}</div>
                  </div>
                </div>
                {isSelected && <Check size={14} style={{ color: "var(--accent, #4f46e5)" }} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
